// Semua endpoint wajib login. Endpoint admin ditambah requireRole(["admin"]).
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./volunteers.controller.js";
import {
  applySchema,
  patchMeSchema,
  createAvailabilitySchema,
  nearbyQuerySchema,
  rateSchema,
  reviewVolunteerSchema,
} from "./volunteers.schema.js";

export const volunteersRouter = Router();
volunteersRouter.use(requireAuth);

volunteersRouter.post("/apply", validate({ body: applySchema }), controller.applyHandler);
volunteersRouter.get("/me", controller.getMeHandler);
volunteersRouter.patch("/me", validate({ body: patchMeSchema }), controller.patchMeHandler);

volunteersRouter.post(
  "/availability",
  validate({ body: createAvailabilitySchema }),
  controller.addAvailabilityHandler,
);
volunteersRouter.get("/availability", controller.listAvailabilityHandler);
volunteersRouter.delete("/availability/:id", controller.removeAvailabilityHandler);

volunteersRouter.get("/nearby", validate({ query: nearbyQuerySchema }), controller.nearbyHandler);

volunteersRouter.post("/:id/rate", validate({ body: rateSchema }), controller.rateHandler);
volunteersRouter.patch(
  "/:id/verification",
  requireRole(["admin"]),
  validate({ body: reviewVolunteerSchema }),
  controller.reviewHandler,
);
