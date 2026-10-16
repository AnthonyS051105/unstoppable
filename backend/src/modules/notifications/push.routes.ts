import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./notifications.controller.js";
import {
  deletePushSubscriptionSchema,
  pushSubscriptionSchema,
} from "./notifications.schema.js";

const pushRouter = Router();
pushRouter.use(requireAuth);
pushRouter.get("/public-key", controller.publicKeyHandler);
pushRouter.post(
  "/subscriptions",
  validate({ body: pushSubscriptionSchema }),
  controller.upsertSubscriptionHandler,
);
pushRouter.delete(
  "/subscriptions",
  validate({ body: deletePushSubscriptionSchema }),
  controller.deleteSubscriptionHandler,
);

export default pushRouter;
