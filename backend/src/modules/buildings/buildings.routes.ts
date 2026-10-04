import { Router } from "express";
import {
  listBuildingsHandler,
  getBuildingHandler,
  getBuildingBarriersHandler,
} from "./buildings.controller.js";

export const buildingsRouter = Router();

buildingsRouter.get("/", listBuildingsHandler);
buildingsRouter.get("/:id", getBuildingHandler);
buildingsRouter.get("/:id/barriers", getBuildingBarriersHandler);
