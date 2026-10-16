// B14 (§15.3) — rencana perjalanan. Semua endpoint wajib login; kepemilikan &
// tautan keluarga dicek di service.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./trips.controller.js";
import { createPlannedTripSchema } from "./trips.schema.js";

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

tripsRouter.post("/planned", validate({ body: createPlannedTripSchema }), controller.createHandler);
tripsRouter.get("/planned", controller.listHandler);
tripsRouter.delete("/planned/:id", controller.cancelHandler);
