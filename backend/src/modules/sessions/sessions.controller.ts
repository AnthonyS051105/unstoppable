// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3: "controller tidak boleh menyentuh database langsung"). Semua handler
// dibungkus asyncHandler, response pakai amplop ok()/created(), error lewat
// AppError. Identitas HANYA dari req.user!.id (requireAuth sudah mengisinya di
// route) -- tidak ada lagi fallback req.body.userId / header x-user-id. §13.
import { asyncHandler } from "../../shared/async-handler.js";
import { ok, created } from "../../shared/response.js";
import { AppError } from "../../shared/errors.js";
import { assertCanViewLocation } from "../../middleware/rbac.js";
import * as sessionService from "./sessions.service.js";

function parseLatLng(point: any): { lat: number; lng: number } | null {
  if (!point) return null;
  if (
    point.type === "Point" &&
    Array.isArray(point.coordinates) &&
    point.coordinates.length >= 2
  ) {
    return {
      lng: Number(point.coordinates[0]),
      lat: Number(point.coordinates[1]),
    };
  }
  if (point.lat != null && point.lng != null) {
    return { lat: Number(point.lat), lng: Number(point.lng) };
  }
  return null;
}

/**
 * POST /api/sessions/start
 */
export const start = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const {
    origin,
    destination,
    destinationName,
    edgeIds,
    profileId,
    estimatedArrival,
  } = req.body;

  const parsedOrigin = parseLatLng(origin);
  const parsedDest = parseLatLng(destination);

  if (!parsedOrigin || !parsedDest) {
    throw new AppError(
      "VALIDATION_ERROR",
      "origin dan destination (GeoJSON Point atau {lat, lng}) wajib diisi.",
      400,
    );
  }

  const session = await sessionService.startSession({
    userId,
    origin: parsedOrigin,
    destination: parsedDest,
    destinationName,
    edgeIds,
    profileId,
    estimatedArrival,
  });

  created(res, session);
});

/**
 * POST | PATCH /api/sessions/:id/location
 *
 * Kepemilikan: hanya pemilik sesi yang boleh mengirim ping lokasi untuk
 * sesinya sendiri (§5.3 CLAUDE.md: cek kepemilikan di controller/service).
 */
export const updateLocation = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;

  const owned = await sessionService.isOwnedBy(id, userId);
  if (!owned) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan.", 404);
  }

  const parsed = parseLatLng(req.body.location ?? req.body);
  const accuracyM =
    req.body.accuracyM != null ? Number(req.body.accuracyM) : undefined;

  if (!parsed) {
    throw new AppError(
      "VALIDATION_ERROR",
      "location (GeoJSON Point) atau lat/lng wajib diisi.",
      400,
    );
  }

  const ping = await sessionService.recordLocationPing({
    sessionId: id,
    lat: parsed.lat,
    lng: parsed.lng,
    accuracyM,
  });

  created(res, ping);
});

/**
 * POST /api/sessions/:id/end
 *
 * Kepemilikan dipaksakan di service (WHERE user_id = ...). Kalau tidak ada
 * baris yang terpengaruh -> sesi bukan milik user ini atau sudah berakhir.
 */
export const end = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  const { status = "completed", destinationName } = req.body;

  if (status !== "completed" && status !== "cancelled") {
    throw new AppError(
      "VALIDATION_ERROR",
      "status harus 'completed' atau 'cancelled'.",
      400,
    );
  }

  const result = await sessionService.endSession(
    id,
    userId,
    status,
    destinationName,
  );

  if (!result) {
    throw new AppError(
      "NOT_FOUND",
      "Sesi tidak ditemukan atau bukan milik Anda.",
      404,
    );
  }

  ok(res, result);
});

/**
 * GET /api/sessions/:id/summary
 *
 * Izin: pemilik sesi, atau caregiver yang berhak melihat lokasi pemilik
 * (assertCanViewLocation -- sumber kebenaran tunggal, sama dipakai
 * location:shared / GET /sos/:id/status). Pengguna lain -> 403.
 */
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
