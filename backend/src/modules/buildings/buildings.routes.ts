import { Router } from "express";
import {
  listBuildingsHandler,
  getBuildingHandler,
  getBuildingAccessibilityScoreHandler,
  getBuildingBarriersHandler,
} from "./buildings.controller.js";

export const buildingsRouter = Router();

buildingsRouter.get("/", listBuildingsHandler);
buildingsRouter.get("/:id/accessibility-score", getBuildingAccessibilityScoreHandler);
buildingsRouter.get("/:id/barriers", getBuildingBarriersHandler);
buildingsRouter.get("/:id", getBuildingHandler);
