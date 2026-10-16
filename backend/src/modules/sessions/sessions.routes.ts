import { Router } from "express";
import * as sessionController from "./sessions.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { locationPingLimiter } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import {
  arrivalSchema,
  endSessionSchema,
  feedbackSchema,
  locationUpdateSchema,
  pauseSchema,
  startSessionSchema,
  wellbeingSchema,
} from "./sessions.schema.js";

const router = Router();

// Semua route sesi butuh identitas pengguna. requireAuth mengisi req.user,
// yang jadi SATU-SATUNYA sumber userId di controller.
router.use(requireAuth);

router.post("/start", validate({ body: startSessionSchema }), sessionController.start);
router.post(
  "/:id/location",
  locationPingLimiter,
  validate({ body: locationUpdateSchema }),
  sessionController.updateLocation,
);
router.patch(
  "/:id/location",
  locationPingLimiter,
  validate({ body: locationUpdateSchema }),
  sessionController.updateLocation,
);
router.post(
  "/:id/end",
  validate({ body: endSessionSchema }),
  sessionController.end,
);
router.post(
  "/:id/arrival",
  validate({ body: arrivalSchema }),
  sessionController.arrival,
);
router.post(
  "/:id/pause",
  validate({ body: pauseSchema }),
  sessionController.pause,
);
router.post(
  "/:id/resume",
  validate({ body: pauseSchema }),
  sessionController.resume,
);
router.post(
  "/:id/wellbeing",
  validate({ body: wellbeingSchema }),
  sessionController.wellbeing,
);
router.post(
  "/:id/feedback",
  validate({ body: feedbackSchema }),
  sessionController.feedback,
);
router.get("/:id/summary", sessionController.getSummary);

export default router;
