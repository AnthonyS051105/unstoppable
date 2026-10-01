import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireTraveler } from "../../middleware/rbac.js";
import { routePlanLimiter } from "../../middleware/rate-limit.js";
import * as routesController from "./routes.controller.js";

const router = Router();

router.post("/plan", requireAuth, requireTraveler, routePlanLimiter, routesController.plan);
router.post("/compare", requireAuth, requireTraveler, routePlanLimiter, routesController.compare);

export default router;
