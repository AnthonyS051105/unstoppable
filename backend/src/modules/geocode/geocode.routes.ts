import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { geocodeLimiter } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./geocode.controller.js";
import { reverseQuerySchema, searchQuerySchema } from "./geocode.schema.js";

const geocodeRouter = Router();
geocodeRouter.use(requireAuth, geocodeLimiter);
geocodeRouter.get("/search", validate({ query: searchQuerySchema }), controller.searchHandler);
geocodeRouter.get("/reverse", validate({ query: reverseQuerySchema }), controller.reverseHandler);

export default geocodeRouter;
