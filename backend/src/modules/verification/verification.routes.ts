import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  getQueueHandler,
  approveHandler,
  rejectHandler,
} from "./verification.controller.js";

const router = Router();

router.use(requireAuth, requireRole(["admin"]));

router.get("/queue", getQueueHandler);
router.post("/:id/approve", approveHandler);
router.post("/:type/:id/approve", approveHandler);
router.post("/:id/reject", rejectHandler);
router.post("/:type/:id/reject", rejectHandler);

export default router;