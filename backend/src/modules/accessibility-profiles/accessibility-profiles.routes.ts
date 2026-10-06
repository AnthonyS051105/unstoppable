// GET /profiles publik (docs/API_CONTRACT.md §4: boleh diakses tanpa login,
// dipakai saat onboarding). GET/PUT /users/me/accessibility wajib login —
// data milik user yang sedang masuk.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./accessibility-profiles.controller.js";
import { putAccessibilitySchema } from "./accessibility-profiles.schema.js";

export const accessibilityProfilesRouter = Router();
accessibilityProfilesRouter.get("/profiles", controller.listProfilesHandler);

export const userAccessibilityRouter = Router();
userAccessibilityRouter.use(requireAuth);
userAccessibilityRouter.get("/me/accessibility", controller.getMyAccessibilityHandler);
userAccessibilityRouter.put(
  "/me/accessibility",
  validate({ body: putAccessibilitySchema }),
  controller.putMyAccessibilityHandler,
);
