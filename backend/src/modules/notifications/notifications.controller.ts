import type { Request } from "express";
import { ok } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import * as service from "./notifications.service.js";
import { idParamSchema, type ListQueryInput } from "./notifications.schema.js";

const parseId = (req: Request) => idParamSchema.parse(req.params).id;

export const listHandler = asyncHandler(async (req, res) => {
  ok(res, await service.listMine(req.user!.id, req.query as unknown as ListQueryInput));
});

export const readHandler = asyncHandler(async (req, res) => {
  ok(res, await service.markRead(req.user!.id, parseId(req)));
});

export const readAllHandler = asyncHandler(async (req, res) => {
  ok(res, await service.markAllRead(req.user!.id));
});
