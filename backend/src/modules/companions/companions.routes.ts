import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./companions.controller.js";
import {
  createRequestSchema,
  openQuerySchema,
  offerSchema,
  selectSchema,
  checkinSchema,
  cancelSchema,
} from "./companions.schema.js";

export const companionsRouter = Router();
companionsRouter.use(requireAuth);

const canCompanion = requireCapability("canCompanion");

companionsRouter.post("/requests", validate({ body: createRequestSchema }), controller.createRequestHandler);
companionsRouter.get("/requests", controller.listMineHandler);
companionsRouter.get("/open", canCompanion, validate({ query: openQuerySchema }), controller.listOpenHandler);

companionsRouter.post("/requests/:id/offer", canCompanion, validate({ body: offerSchema }), controller.offerHandler);
companionsRouter.get("/requests/:id/offers", controller.listOffersHandler);
companionsRouter.post("/requests/:id/select", validate({ body: selectSchema }), controller.selectHandler);
companionsRouter.post("/requests/:id/checkin", validate({ body: checkinSchema }), controller.checkinHandler);
companionsRouter.post("/requests/:id/cancel", validate({ body: cancelSchema }), controller.cancelHandler);
