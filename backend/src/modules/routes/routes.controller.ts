// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3: "controller tidak boleh menyentuh database langsung"). Tidak ada
// Prisma/raw SQL di sini.
import { asyncHandler } from "../../shared/async-handler.js";
import { ok, created } from "../../shared/response.js";
import { AppError } from "../../shared/errors.js";
import { serializeBigInt } from "../../shared/bigint.js";
import { planRouteSchema, compareRouteSchema, saveRouteSchema } from "./routes.schema.js";
import * as routesService from "./routes.service.js";

/**
 * POST /api/routes/plan
 */
export const plan = asyncHandler(async (req, res) => {
  const input = planRouteSchema.parse(req.body);
  const result = await routesService.planRoute(
    req.user!.id,
    input.origin,
    input.destination,
    input.profileId,
    input.includeNarration ?? false,
  );
  ok(res, serializeBigInt(result));
});

/**
 * POST /api/routes/compare
 */
export const compare = asyncHandler(async (req, res) => {
  const input = compareRouteSchema.parse(req.body);
  const result = await routesService.compareRoutes(req.user!.id, input.origin, input.destination, input.profileIds);
  ok(res, serializeBigInt(result));
});

// UUID v4-ish check -- hindari ::uuid cast melempar error Postgres (500) saat
// :id dari URL bukan UUID sah. Bentuk tak valid -> 404 (tidak ditemukan),
// konsisten dengan "tidak membocorkan keberadaan rute milik orang lain".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/routes/saved
 */
export const listSaved = asyncHandler(async (req, res) => {
  const result = await routesService.listSavedRoutes(req.user!.id);
  ok(res, serializeBigInt(result));
});

/**
 * POST /api/routes/saved
 */
export const createSaved = asyncHandler(async (req, res) => {
  const input = saveRouteSchema.parse(req.body);
  const result = await routesService.createSavedRoute({
    userId: req.user!.id,
    name: input.name,
    origin: input.origin,
    destination: input.destination,
    edgeIds: input.edgeIds,
    profileId: input.profileId,
  });
  created(res, serializeBigInt(result));
});

/**
 * DELETE /api/routes/saved/:id
 *
 * Kepemilikan dipaksakan di service (WHERE user_id = ...). Rute yang tidak ada
 * atau bukan milik pemanggil -> 404 (sama, tidak membocorkan keberadaannya).
 */
export const deleteSaved = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!UUID_RE.test(id)) {
    throw new AppError("NOT_FOUND", "Rute tersimpan tidak ditemukan.", 404);
  }
  const deleted = await routesService.deleteSavedRoute(id, req.user!.id);
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Rute tersimpan tidak ditemukan.", 404);
  }
  ok(res, { deleted: true, id });
});
