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

// Canonical route form per API_CONTRACT.md §8: the prefixed id
// ("node:<id>", "edge:<id>", "report_effect:<id>") carries the item type,
// so a single `:id` param is sufficient. The legacy `/:type/:id/...` form has
// been removed to keep one consistent route shape.
router.get("/queue", getQueueHandler);
router.post("/:id/approve", approveHandler);
router.post("/:id/reject", rejectHandler);

export default router;