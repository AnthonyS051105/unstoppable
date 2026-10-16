import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./notifications.controller.js";
import { notificationsQuerySchema } from "./notifications.schema.js";

const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get("/", validate({ query: notificationsQuerySchema }), controller.listHandler);
notificationsRouter.post("/:id/read", validate({}), controller.markReadHandler);
notificationsRouter.post("/read-all", validate({}), controller.markAllReadHandler);

export default notificationsRouter;
