import { Router } from "express";
import * as sessionController from "./sessions.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { locationPingLimiter } from "../../middleware/rate-limit.js";

const router = Router();

// Semua route sesi butuh identitas pengguna. requireAuth mengisi req.user,
// yang jadi SATU-SATUNYA sumber userId di controller (§13).
router.use(requireAuth);

router.post("/start", sessionController.start);
router.post("/:id/location", locationPingLimiter, sessionController.updateLocation);
router.patch("/:id/location", locationPingLimiter, sessionController.updateLocation);
router.post("/:id/end", sessionController.end);
router.get("/:id/summary", sessionController.getSummary);

export default router;
