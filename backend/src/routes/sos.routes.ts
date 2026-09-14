import { Router } from "express";
import * as sosController from "../controllers/sos.controller.js";

const router = Router();

router.post("/trigger", sosController.trigger);
router.post("/:id/cancel", sosController.cancel);
router.post("/:id/respond", sosController.respond);
router.get("/:id/status", sosController.status);

export default router;
