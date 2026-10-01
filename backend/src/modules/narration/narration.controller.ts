// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3). Tidak ada logika penyusunan narasi di sini.
import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import { narrateRouteSchema } from "./narration.schema.js";
import { buildNarration } from "./narration.service.js";

/**
 * POST /api/narration/route
 */
export const narrateRoute = asyncHandler(async (req, res) => {
  const input = narrateRouteSchema.parse(req.body);
  const result = buildNarration(input);
  ok(res, result);
});
