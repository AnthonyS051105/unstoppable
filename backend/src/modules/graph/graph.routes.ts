import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireMapper } from "../../middleware/rbac.js";
import * as graphController from "./graph.controller.js";

const router = Router();

// GET endpoints publik (lihat manual-testing.md bagian G). Endpoint tulis
// butuh requireAuth DULU untuk mengisi req.user dari JWT, baru requireMapper
// yang memeriksa kapabilitas canMapData di req.user.
router.get("/nodes", graphController.listNodes);
router.post("/nodes", requireAuth, requireMapper, graphController.createNode);
router.patch("/nodes/:id", requireAuth, requireMapper, graphController.updateNode);
router.delete("/nodes/:id", requireAuth, requireMapper, graphController.deleteNode);

router.get("/edges", graphController.listEdges);
router.post("/edges", requireAuth, requireMapper, graphController.createEdge);
router.patch("/edges/:id", requireAuth, requireMapper, graphController.updateEdge);
router.delete("/edges/:id", requireAuth, requireMapper, graphController.deleteEdge);

router.get("/coverage", graphController.getCoverage);
router.post("/validate", requireAuth, requireMapper, graphController.validateTopology);

export default router;