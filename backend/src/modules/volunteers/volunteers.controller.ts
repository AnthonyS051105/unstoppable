import type { Request } from "express";
import { ok, created, noContent } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import * as service from "./volunteers.service.js";
import {
  idParamSchema,
  type ApplyInput,
  type PatchVolunteerMeInput,
  type CreateAvailabilityInput,
  type NearbyQueryInput,
  type RateInput,
  type ReviewVolunteerInput,
} from "./volunteers.schema.js";

const parseId = (req: Request) => idParamSchema.parse(req.params).id;

export const applyHandler = asyncHandler(async (req, res) => {
  created(res, await service.apply(req.user!.id, req.body as ApplyInput));
});

export const getMeHandler = asyncHandler(async (req, res) => {
  ok(res, await service.getProfile(req.user!.id));
});

export const patchMeHandler = asyncHandler(async (req, res) => {
  ok(res, await service.updateMe(req.user!.id, req.body as PatchVolunteerMeInput));
});

export const addAvailabilityHandler = asyncHandler(async (req, res) => {
  created(res, await service.addAvailability(req.user!.id, req.body as CreateAvailabilityInput));
});

export const listAvailabilityHandler = asyncHandler(async (req, res) => {
  ok(res, await service.listAvailability(req.user!.id));
});

export const removeAvailabilityHandler = asyncHandler(async (req, res) => {
  await service.removeAvailability(req.user!.id, parseId(req));
  noContent(res);
});

export const nearbyHandler = asyncHandler(async (req, res) => {
  ok(res, await service.findNearby(req.query as unknown as NearbyQueryInput));
});

export const rateHandler = asyncHandler(async (req, res) => {
  ok(res, await service.rateVolunteer(req.user!.id, parseId(req), req.body as RateInput));
});

export const reviewHandler = asyncHandler(async (req, res) => {
  ok(res, await service.reviewVolunteer(req.user!.id, parseId(req), req.body as ReviewVolunteerInput));
});
