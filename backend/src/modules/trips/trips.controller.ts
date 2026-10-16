import type { Request } from "express";
import { ok, created } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import * as service from "./trips.service.js";
import { idParamSchema, type CreatePlannedTripInput } from "./trips.schema.js";

const parseId = (req: Request) => idParamSchema.parse(req.params).id;

export const createHandler = asyncHandler(async (req, res) => {
  created(res, await service.createPlannedTrip(req.user!.id, req.body as CreatePlannedTripInput));
});

export const listHandler = asyncHandler(async (req, res) => {
  ok(res, await service.listPlannedTrips(req.user!.id));
});

export const cancelHandler = asyncHandler(async (req, res) => {
  ok(res, await service.cancelPlannedTrip(req.user!.id, parseId(req)));
});
