import { Router } from "express";
import * as sessionController from "./sessions.controller.js";
import { locationPingLimiter } from "../../middleware/rate-limit.js";

const router = Router();

router.post("/start", sessionController.start);
router.post("/:id/location", locationPingLimiter, sessionController.updateLocation);
router.patch("/:id/location", locationPingLimiter, sessionController.updateLocation);
router.post("/:id/end", sessionController.end);
router.get("/:id/summary", sessionController.getSummary);

export default router;