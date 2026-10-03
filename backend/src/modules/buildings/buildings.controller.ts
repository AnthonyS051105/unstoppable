import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import { buildingIdParamSchema, listBuildingsQuerySchema } from "./buildings.schema.js";
import * as buildingsService from "./buildings.service.js";

export const listBuildingsHandler = asyncHandler(async (req, res) => {
  const { faculty } = listBuildingsQuerySchema.parse(req.query);
  ok(res, await buildingsService.listBuildings(faculty));
});

export const getBuildingHandler = asyncHandler(async (req, res) => {
  const { id } = buildingIdParamSchema.parse(req.params);
  ok(res, await buildingsService.getBuilding(id));
});

export const getBuildingBarriersHandler = asyncHandler(async (req, res) => {
  const { id } = buildingIdParamSchema.parse(req.params);
  ok(res, await buildingsService.getBuildingBarriers(id));
});
