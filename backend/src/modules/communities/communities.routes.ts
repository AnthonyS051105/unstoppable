import { Router } from "express";
import { requireAdmin } from "../../middleware/rbac.js";
import { requireAuth as authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./communities.controller.js";
import { communitiesQuerySchema, createCommunitySchema } from "./communities.schema.js";

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
communitiesRouter.post(
  "/",
  requireAdmin,
  validate({ body: createCommunitySchema }),
  controller.createHandler,
);

export default communitiesRouter;
