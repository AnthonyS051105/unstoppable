import { asyncHandler } from "../../shared/async-handler.js";
import { created, ok } from "../../shared/response.js";
import * as service from "./communities.service.js";
import {
  communitiesQuerySchema,
  communityIdSchema,
  createCommunitySchema,
  createEventSchema,
  createPostSchema,
  eventIdSchema,
  flagPostSchema,
  moderationSchema,
  postPageQuerySchema,
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

export const listPostsHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  const query = postPageQuerySchema.parse(req.query);
  ok(res, await service.listPosts(req.user!.id, id, query));
});

export const createPostHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  const input = createPostSchema.parse(req.body);
  created(res, await service.createPost(req.user!.id, id, input));
});

export const deletePostHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  ok(res, await service.deletePost(req.user!.id, id));
});

export const flagPostHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  const input = flagPostSchema.parse(req.body);
  ok(res, await service.flagPost(req.user!.id, id, input));
});

export const moderatePostHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  const input = moderationSchema.parse(req.body);
  ok(res, await service.moderatePost(req.user!.id, req.user!.role, id, input));
});

export const listEventsHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  ok(res, await service.listEvents(id));
});

export const createEventHandler = asyncHandler(async (req, res) => {
  const { id } = communityIdSchema.parse(req.params);
  const input = createEventSchema.parse(req.body);
  created(res, await service.createEvent(req.user!.id, req.user!.role, id, input));
});

export const cancelEventHandler = asyncHandler(async (req, res) => {
  const { id, eventId } = eventIdSchema.parse(req.params);
  ok(res, await service.cancelEvent(req.user!.id, req.user!.role, id, eventId));
});
