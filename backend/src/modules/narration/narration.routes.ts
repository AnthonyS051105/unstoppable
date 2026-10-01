import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireTraveler } from "../../middleware/rbac.js";
import * as narrationController from "./narration.controller.js";

const router = Router();

router.post("/route", requireAuth, requireTraveler, narrationController.narrateRoute);

export default router;
