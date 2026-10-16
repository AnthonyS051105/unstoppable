// B12b (§15.4) — kotak notifikasi. Semua endpoint wajib login; kepemilikan
// dicek di service.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./notifications.controller.js";
import { listQuerySchema } from "./notifications.schema.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", validate({ query: listQuerySchema }), controller.listHandler);
notificationsRouter.post("/read-all", controller.readAllHandler);
notificationsRouter.post("/:id/read", controller.readHandler);
