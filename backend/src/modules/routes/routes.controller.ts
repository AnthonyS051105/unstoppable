// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3: "controller tidak boleh menyentuh database langsung"). Tidak ada
// Prisma/raw SQL di sini.
import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import { serializeBigInt } from "../../shared/bigint.js";
import { planRouteSchema, compareRouteSchema } from "./routes.schema.js";
import * as routesService from "./routes.service.js";

/**
 * POST /api/routes/plan
 */
export const plan = asyncHandler(async (req, res) => {
  const input = planRouteSchema.parse(req.body);
  const result = await routesService.planRoute(req.user!.id, input.origin, input.destination, input.profileId);
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
