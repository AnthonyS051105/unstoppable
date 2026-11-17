import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireTraveler } from "../../middleware/rbac.js";
import { routePlanLimiter } from "../../middleware/rate-limit.js";
import * as transitDemoController from "./transit-demo.controller.js";

const router = Router();

router.get("/fixture", requireAuth, requireTraveler, transitDemoController.getFixtureInfo);
router.post("/recommend", requireAuth, requireTraveler, routePlanLimiter, transitDemoController.recommend);

export default router;
