// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3: "controller tidak boleh menyentuh database langsung"). Tidak ada
// Prisma/raw SQL di sini.
import { asyncHandler } from "../../shared/async-handler.js";
import { ok, created } from "../../shared/response.js";
import { AppError } from "../../shared/errors.js";
import { getIo } from "../../realtime/index.js";
import { broadcastSosTriggered, broadcastSosNew, broadcastSosResolved } from "../../realtime/sos.handlers.js";
import { assertCanViewLocation } from "../../middleware/rbac.js";
import { triggerSosSchema, cancelSosSchema, respondSosSchema } from "./sos.schema.js";
import * as sosService from "./sos.service.js";

/**
 * POST /api/sos/trigger
 */
export const trigger = asyncHandler(async (req, res) => {
  const input = triggerSosSchema.parse(req.body);
  const userId = req.user!.id;
  const [lng, lat] = input.location.coordinates;

  const incident = await sosService.triggerSos({
    userId,
    sessionId: input.sessionId,
    triggerType: input.triggerType,
    lng,
    lat,
    audioRecordingUrl: input.audioRecordingUrl,
  });

  const [caregiverIds, nearbyVolunteers, userName] = await Promise.all([
    sosService.getCaregiverIds(userId),
    sosService.findNearbyVolunteers(lng, lat),
    sosService.getUserName(userId),
  ]);

  const io = getIo();
  broadcastSosTriggered(io, caregiverIds, {
    sosId: incident.id,
    userId,
    user: { id: userId, name: userName },
    sessionId: input.sessionId ?? null,
    triggerType: input.triggerType,
    coordinates: [lng, lat],
    createdAt: incident.createdAt.toISOString(),
  });
  // §15.3 sos:new -- { sosId, user: {id,name}, coordinates, distanceM, triggerType }.
  broadcastSosNew(io, nearbyVolunteers, {
    sosId: incident.id,
    user: { id: userId, name: userName },
    coordinates: [lng, lat],
    triggerType: input.triggerType,
  });

  // SOS tidak boleh gagal senyap -- simpan hasil notifikasi apa adanya, jangan
  // menelan exception (CLAUDE.md §5.4). Kalau ini gagal, trigger tetap sukses
  // karena insiden sudah tersimpan; asyncHandler meneruskan error ke
  // error-handler.ts kalau recordCaregiverNotifications benar-benar gagal.
  await sosService.recordCaregiverNotifications(incident.id, caregiverIds);

  created(res, {
    sosId: incident.id,
    notifiedVolunteers: nearbyVolunteers.length,
    notifiedCaregivers: caregiverIds.length,
    status: incident.status,
  });
});

/**
 * POST /api/sos/:id/cancel
 */
export const cancel = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const { reason } = cancelSosSchema.parse(req.body ?? {});

  await sosService.cancelSos(id, userId, reason);

  const caregiverIds = await sosService.getCaregiverIds(userId);
  broadcastSosResolved(getIo(), [userId, ...caregiverIds], {
    sosId: id,
    resolvedAt: new Date().toISOString(),
  });

  ok(res, { status: "cancelled" });
});

/**
 * POST /api/sos/:id/respond -- relawan
 */
export const respond = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const volunteerId = req.user!.id;
  const { responseStatus } = respondSosSchema.parse(req.body);

  const response = await sosService.respondToSos(id, volunteerId, responseStatus);
  const ownerId = await sosService.getSosOwnerId(id);
  if (ownerId) {
    const status = await sosService.getSosStatus(id);
    getIo().to(`user:${ownerId}`).emit("sos:update", {
      sosId: id,
      status: status.status,
      escalationLevel: status.escalationLevel,
      responders: status.responders,
    });
  }

  created(res, response);
});

/**
 * GET /api/sos/:id/status
 *
 * Izin: pemilik insiden, caregiver yang berhak (assertCanViewLocation --
 * insiden aktif otomatis memenuhi cabang 'sos_only'), atau relawan yang
 * sudah merespons insiden ini. §5.3 CLAUDE.md: kepemilikan/izin dicek di
 * service/controller, bukan cuma middleware route.
 */
export const status = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const viewerId = req.user!.id;

  const ownerId = await sosService.getSosOwnerId(id);
  if (!ownerId) {
    throw new AppError("NOT_FOUND", "SOS tidak ditemukan.", 404);
  }

  const result = await sosService.getSosStatus(id);
  const isRespondingVolunteer = result.responders.some((r) => r.id === viewerId);
  if (!isRespondingVolunteer) {
    await assertCanViewLocation(viewerId, ownerId);
  }

  ok(res, result);
});
