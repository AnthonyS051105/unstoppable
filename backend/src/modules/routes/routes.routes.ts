import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireTraveler } from "../../middleware/rbac.js";
import { routePlanLimiter } from "../../middleware/rate-limit.js";
import * as routesController from "./routes.controller.js";

const router = Router();

router.post("/plan", requireAuth, requireTraveler, routePlanLimiter, routesController.plan);
router.post("/compare", requireAuth, requireTraveler, routePlanLimiter, routesController.compare);

// Rute tersimpan (docs/API_CONTRACT.md §5). Semua ber-auth + terikat
// kepemilikan user (userId dari req.user!.id, bukan dari body/param).
router.get("/saved", requireAuth, requireTraveler, routesController.listSaved);
router.post("/saved", requireAuth, requireTraveler, routesController.createSaved);
router.delete("/saved/:id", requireAuth, requireTraveler, routesController.deleteSaved);

export default router;
