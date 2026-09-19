import { Router } from "express";
import * as sessionController from "./sessions.controller.js";

const router = Router();

router.post("/start", sessionController.start);
router.patch("/:id/location", sessionController.updateLocation);
router.post("/:id/end", sessionController.end);
router.get("/:id/summary", sessionController.getSummary);

export default router;