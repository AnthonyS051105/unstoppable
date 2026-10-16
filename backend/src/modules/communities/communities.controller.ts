import { asyncHandler } from "../../shared/async-handler.js";
import { created, ok } from "../../shared/response.js";
import * as service from "./communities.service.js";
import {
  communitiesQuerySchema,
  communityIdSchema,
  createCommunitySchema,
} from "./communities.schema.js";

export const listHandler = asyncHandler(async (req, res) => {
  const query = communitiesQuerySchema.parse(req.query);
  ok(res, await service.listCommunities(req.user!.id, query));
});

export const detailHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  ok(res, await service.getCommunity(req.user!.id, id));
});

export const joinHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  ok(res, await service.joinCommunity(req.user!.id, id));
});

export const leaveHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  ok(res, await service.leaveCommunity(req.user!.id, id));
});

export const reportsHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  ok(res, await service.listCommunityReports(id));
});

export const createHandler = asyncHandler(async (req, res) => {
  const input = createCommunitySchema.parse(req.body);
  created(res, await service.createCommunity(req.user!.id, input));
});
