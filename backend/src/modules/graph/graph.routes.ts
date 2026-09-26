import { Router } from "express";
import { requireMapper } from "../../middleware/rbac.js";
import * as graphController from "./graph.controller.js";

const router = Router();

router.get("/nodes", graphController.listNodes);
router.post("/nodes", requireMapper, graphController.createNode);
router.patch("/nodes/:id", requireMapper, graphController.updateNode);
router.delete("/nodes/:id", requireMapper, graphController.deleteNode);

router.get("/edges", graphController.listEdges);
router.post("/edges", requireMapper, graphController.createEdge);
router.patch("/edges/:id", requireMapper, graphController.updateEdge);
router.delete("/edges/:id", requireMapper, graphController.deleteEdge);

router.get("/coverage", graphController.getCoverage);
router.post("/validate", requireMapper, graphController.validateTopology);

export default router;