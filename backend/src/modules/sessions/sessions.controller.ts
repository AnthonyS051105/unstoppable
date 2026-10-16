// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3: "controller tidak boleh menyentuh database langsung"). Semua handler
// dibungkus asyncHandler dan error diteruskan ke error-handler.ts.
import { asyncHandler } from "../../shared/async-handler.js";
import { ok, created } from "../../shared/response.js";
import { AppError } from "../../shared/errors.js";
import { assertCanViewLocation } from "../../middleware/rbac.js";
import { getIo } from "../../realtime/index.js";
import {
  broadcastSosNew,
  broadcastSosTriggered,
} from "../../realtime/sos.handlers.js";
import * as usersService from "../users/users.service.js";
import * as sosService from "../sos/sos.service.js";
import * as sessionService from "./sessions.service.js";
import {
  arrivalSchema,
  endSessionSchema,
  feedbackSchema,
  locationUpdateSchema,
  startSessionSchema,
  wellbeingSchema,
  type SessionPointInput,
} from "./sessions.schema.js";

function parseLatLng(point: SessionPointInput): { lat: number; lng: number } {
  if ("type" in point && point.type === "Point") {
    return {
      lng: point.coordinates[0],
      lat: point.coordinates[1],
    };
  }

  if ("lat" in point) {
    return {
      lat: point.lat,
      lng: point.lng,
    };
  }

  throw new AppError("VALIDATION_ERROR", "Lokasi sesi tidak valid.", 400);
}

async function emitSessionEvent(
  userId: string,
  event: string,
  payload: object,
  includeUser = false,
): Promise<void> {
  try {
    const watcherIds = await usersService.statusWatchersOf(userId);
    const recipients = new Set(includeUser ? [userId, ...watcherIds] : watcherIds);
    const io = getIo();
    for (const recipientId of recipients) {
      io.to(`user:${recipientId}`).emit(event, payload);
    }
  } catch (err) {
    // Realtime notification failure must not fail the session request.
    console.error(`[sessions] gagal mengirim event ${event}:`, err);
  }
}

async function emitArrivalCheck(check: sessionService.ArrivalCheck): Promise<void> {
  try {
    getIo().to(`user:${check.userId}`).emit("session:arrival-check", {
      sessionId: check.sessionId,
      destinationName: check.destinationName,
      autoEndAt: check.autoEndAt.toISOString(),
    });
  } catch (err) {
    console.error("[sessions] gagal mengirim session:arrival-check:", err);
  }
}

async function emitEndedSession(session: {
  id: string;
  userId: string;
  destinationName: string | null;
  status: string;
  endedReason: string | null;
  endedAt: Date;
}): Promise<void> {
  const userName = await sessionService.getUserName(session.userId);
  await emitSessionEvent(
    session.userId,
    "session:ended",
    {
      sessionId: session.id,
      user: { id: session.userId, name: userName },
      destinationName: session.destinationName,
      status: session.status,
      endedReason: session.endedReason,
      endedAt: session.endedAt.toISOString(),
    },
    true,
  );
}

async function triggerSessionSos(userId: string, sessionId: string) {
  const location = await sessionService.getLatestSessionLocation(sessionId, userId);
  if (!location) {
    throw new AppError("NOT_FOUND", "Sesi perjalanan tidak ditemukan atau sudah berakhir.", 404);
  }

  const incident = await sosService.triggerSos({
    userId,
    sessionId,
    triggerType: "manual_button",
    lng: location.lng,
    lat: location.lat,
    audioRecordingUrl: undefined,
  });

  const [caregiverIds, nearbyVolunteers, userName] = await Promise.all([
    sosService.getCaregiverIds(userId),
    sosService.findNearbyVolunteers(location.lng, location.lat),
    sosService.getUserName(userId),
  ]);

  const io = getIo();
  const basePayload = {
    sosId: incident.id,
    user: { id: userId, name: userName },
    coordinates: [location.lng, location.lat] as [number, number],
    triggerType: "manual_button",
  };

  broadcastSosTriggered(io, caregiverIds, {
    sosId: incident.id,
    userId,
    user: { id: userId, name: userName },
    sessionId,
    triggerType: "manual_button",
    coordinates: [location.lng, location.lat],
    createdAt: incident.createdAt.toISOString(),
  });
  broadcastSosNew(io, nearbyVolunteers, basePayload);
  await sosService.recordCaregiverNotifications(incident.id, caregiverIds);

  return {
    sosId: incident.id,
    notifiedVolunteers: nearbyVolunteers.length,
    notifiedCaregivers: caregiverIds.length,
    status: incident.status,
  };
}

/** POST /api/sessions/start */
export const start = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const input = startSessionSchema.parse(req.body);
  const parsedOrigin = parseLatLng(input.origin);
  const parsedDestination = parseLatLng(input.destination);

  const startParams: sessionService.StartSessionParams = {
    userId,
    origin: parsedOrigin,
    destination: parsedDestination,
  };
  if (input.destinationName !== undefined) startParams.destinationName = input.destinationName;
  if (input.edgeIds !== undefined) startParams.edgeIds = input.edgeIds;
  if (input.profileId !== undefined) startParams.profileId = input.profileId;
  if (input.estimatedArrival !== undefined) startParams.estimatedArrival = input.estimatedArrival;
  if (input.plannedTripId !== undefined) startParams.plannedTripId = input.plannedTripId;

  const started = await sessionService.startSession(startParams);

  for (const replaced of started.replacedSessions) {
    await emitEndedSession(replaced);
  }

  const userName = await sessionService.getUserName(userId);
  await emitSessionEvent(userId, "session:started", {
    sessionId: started.session.id,
    user: { id: userId, name: userName },
    destinationName: started.session.destinationName,
    startedAt: started.session.startedAt.toISOString(),
    estimatedArrival: started.session.estimatedArrival?.toISOString() ?? null,
  });

  created(res, started.session);
});

/** POST | PATCH /api/sessions/:id/location */
export const updateLocation = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const input = locationUpdateSchema.parse(req.body);
  const parsed = parseLatLng(input.location);

  const recorded = await sessionService.recordLocationPing({
    sessionId: id,
    userId,
    lat: parsed.lat,
    lng: parsed.lng,
    accuracyM: input.accuracyM,
  });

  if (!recorded) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan, bukan milik Anda, atau sudah berakhir.", 404);
  }

  if (recorded.arrivalCheck) {
    await emitArrivalCheck(recorded.arrivalCheck);
  }

  created(res, recorded.ping);
});

/** POST /api/sessions/:id/end */
export const end = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const input = endSessionSchema.parse(req.body ?? {});

  const result = await sessionService.endSession(
    id,
    userId,
    input.status,
    input.destinationName,
    "user",
  );

  if (!result) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan atau bukan milik Anda.", 404);
  }

  await emitEndedSession({
    id,
    userId: result.userId,
    destinationName: result.destinationName,
    status: result.status,
    endedReason: result.endedReason,
    endedAt: result.endedAt,
  });

  ok(res, { sessionId: id, status: result.status });
});

/** POST /api/sessions/:id/arrival */
export const arrival = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const { arrived } = arrivalSchema.parse(req.body);
  const result = await sessionService.respondToArrival(id, userId, arrived);

  if (result.type === "ended") {
    if (!result.session) {
      throw new AppError("NOT_FOUND", "Sesi tidak ditemukan atau sudah berakhir.", 404);
    }
    await emitEndedSession({
      id,
      userId: result.session.userId,
      destinationName: result.session.destinationName,
      status: result.session.status,
      endedReason: result.session.endedReason,
      endedAt: result.session.endedAt,
    });
    ok(res, { status: result.session.status, endedReason: result.session.endedReason });
    return;
  }

  if (!result.session) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan atau bukan milik Anda.", 404);
  }

  ok(res, {
    status: "active",
    arrivalSnoozeUntil: result.session.arrivalSnoozeUntil,
  });
});

/** POST /api/sessions/:id/pause */
export const pause = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const paused = await sessionService.pauseSession(id, userId);

  if (!paused) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan atau bukan milik Anda.", 404);
  }

  ok(res, { sessionId: id, status: "paused", pausedAt: paused.pausedAt });
});

/** POST /api/sessions/:id/resume */
export const resume = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const resumed = await sessionService.resumeSession(id, userId);

  if (!resumed) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan atau bukan milik Anda.", 404);
  }

  ok(res, { sessionId: id, status: "active", resumedAt: resumed.lastPingAt });
});

/** POST /api/sessions/:id/wellbeing */
export const wellbeing = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const { status } = wellbeingSchema.parse(req.body);

  if (status === "arrived") {
    const result = await sessionService.endSession(id, userId, "completed", undefined, "user");
    if (!result) {
      throw new AppError("NOT_FOUND", "Sesi tidak ditemukan atau sudah berakhir.", 404);
    }
    await emitEndedSession({
      id,
      userId: result.userId,
      destinationName: result.destinationName,
      status: result.status,
      endedReason: result.endedReason,
      endedAt: result.endedAt,
    });
    ok(res, { status: result.status, endedReason: result.endedReason });
    return;
  }

  if (status === "ok") {
    const acknowledged = await sessionService.acknowledgeWellbeing(id, userId, "ok");
    if (!acknowledged) {
      throw new AppError("NOT_FOUND", "Sesi tidak ditemukan, bukan milik Anda, atau belum dijeda.", 404);
    }
    ok(res, { status: "ok", nextCheckInMin: 15 });
    return;
  }

  const sos = await triggerSessionSos(userId, id);
  const ended = await sessionService.endSession(id, userId, "sos_triggered", undefined, "sos");
  if (ended) {
    await emitEndedSession({
      id,
      userId: ended.userId,
      destinationName: ended.destinationName,
      status: ended.status,
      endedReason: ended.endedReason,
      endedAt: ended.endedAt,
    });
  }
  ok(res, { status: "help", sos });
});

/** POST /api/sessions/:id/feedback */
export const feedback = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const { rating } = feedbackSchema.parse(req.body);
  const result = await sessionService.submitSessionFeedback(id, userId, rating);
  ok(res, result);
});

/** GET /api/sessions/:id/summary */
export const getSummary = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const requesterId = req.user!.id;

  const ownerId = await sessionService.getSessionOwnerId(id);
  if (!ownerId) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan.", 404);
  }

  if (requesterId !== ownerId) {
    await assertCanViewLocation(requesterId, ownerId);
  }

  const summary = await sessionService.getSessionSummary(id, requesterId);
  if (!summary) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan.", 404);
  }

  ok(res, summary);
});
