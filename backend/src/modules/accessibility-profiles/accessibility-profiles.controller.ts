import { ok } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import * as service from "./accessibility-profiles.service.js";
import type { PutAccessibilityInput } from "./accessibility-profiles.schema.js";

export const listProfilesHandler = asyncHandler(async (_req, res) => {
  const profiles = await service.listProfiles();
  ok(res, profiles);
});

export const getMyAccessibilityHandler = asyncHandler(async (req, res) => {
  const profiles = await service.getUserAccessibility(req.user!.id);
  ok(res, { profiles });
});

export const putMyAccessibilityHandler = asyncHandler(async (req, res) => {
  const input = req.body as PutAccessibilityInput;
  const profiles = await service.replaceUserAccessibility(req.user!.id, input);
  ok(res, { profiles });
});
