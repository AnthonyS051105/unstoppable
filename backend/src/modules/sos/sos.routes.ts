import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireTraveler, requireVolunteer } from "../../middleware/rbac.js";
import { sosLimiter } from "../../middleware/rate-limit.js";
import * as sosController from "./sos.controller.js";

const router = Router();

router.post("/trigger", requireAuth, requireTraveler, sosLimiter, sosController.trigger);
router.post("/:id/cancel", requireAuth, requireTraveler, sosController.cancel);
router.post("/:id/respond", requireAuth, requireVolunteer, sosController.respond);
router.get("/:id/status", requireAuth, sosController.status);

export default router;
