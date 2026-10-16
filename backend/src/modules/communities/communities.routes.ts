import { Router } from "express";
import { requireAdmin } from "../../middleware/rbac.js";
import { requireAuth as authenticate } from "../../middleware/auth.js";
import { communityPostLimiter } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./communities.controller.js";
import {
  communitiesQuerySchema,
  createCommunitySchema,
  createEventSchema,
  createPostSchema,
  flagPostSchema,
  moderationSchema,
  postPageQuerySchema,
} from "./communities.schema.js";

const communitiesRouter = Router();
communitiesRouter.use(authenticate);

communitiesRouter.get(
  "/",
  validate({ query: communitiesQuerySchema }),
  controller.listHandler,
);
communitiesRouter.get("/:id", controller.detailHandler);
communitiesRouter.post(
  "/:id/members/me",
  controller.joinHandler,
);
communitiesRouter.delete(
  "/:id/members/me",
  controller.leaveHandler,
);
communitiesRouter.get("/:id/reports", controller.reportsHandler);
communitiesRouter.get(
  "/:id/posts",
  validate({ query: postPageQuerySchema }),
  controller.listPostsHandler,
);
communitiesRouter.post(
  "/:id/posts",
  communityPostLimiter,
  validate({ body: createPostSchema }),
  controller.createPostHandler,
);
communitiesRouter.delete("/posts/:id", controller.deletePostHandler);
communitiesRouter.post(
  "/posts/:id/flag",
  validate({ body: flagPostSchema }),
  controller.flagPostHandler,
);
communitiesRouter.patch(
  "/posts/:id/moderation",
  validate({ body: moderationSchema }),
  controller.moderatePostHandler,
);
communitiesRouter.get("/:id/events", controller.listEventsHandler);
communitiesRouter.post(
  "/:id/events",
  validate({ body: createEventSchema }),
  controller.createEventHandler,
);
communitiesRouter.delete(
  "/:id/events/:eventId",
  controller.cancelEventHandler,
);
communitiesRouter.post(
  "/",
  requireAdmin,
  validate({ body: createCommunitySchema }),
  controller.createHandler,
);

export default communitiesRouter;
