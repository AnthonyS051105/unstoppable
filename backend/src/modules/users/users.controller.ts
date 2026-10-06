import { ok, created, noContent } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import * as service from "./users.service.js";
import type { PatchMeInput, AddCaregiverInput } from "./users.schema.js";

export const getMeHandler = asyncHandler(async (req, res) => {
  const me = await service.getMe(req.user!.id);
  ok(res, me);
});

export const patchMeHandler = asyncHandler(async (req, res) => {
  const me = await service.updateMe(req.user!.id, req.body as PatchMeInput);
  ok(res, me);
});

export const addCaregiverHandler = asyncHandler(async (req, res) => {
  const rel = await service.addCaregiver(req.user!.id, req.body as AddCaregiverInput);
  created(res, rel);
});

export const listCaregiversHandler = asyncHandler(async (req, res) => {
  const rels = await service.listCaregivers(req.user!.id);
  ok(res, rels);
});

export const removeCaregiverHandler = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  await service.removeCaregiver(req.user!.id, id);
  noContent(res);
});

export const listDependentsHandler = asyncHandler(async (req, res) => {
  const deps = await service.listDependents(req.user!.id);
  ok(res, deps);
});
