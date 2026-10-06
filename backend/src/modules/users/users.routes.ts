// Semua endpoint di sini wajib login (requireAuth) — data milik user sendiri.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./users.controller.js";
import { patchMeSchema, addCaregiverSchema } from "./users.schema.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get("/me", controller.getMeHandler);
usersRouter.patch("/me", validate({ body: patchMeSchema }), controller.patchMeHandler);

usersRouter.post(
  "/me/caregivers",
  validate({ body: addCaregiverSchema }),
  controller.addCaregiverHandler,
);
usersRouter.get("/me/caregivers", controller.listCaregiversHandler);
usersRouter.delete("/me/caregivers/:id", controller.removeCaregiverHandler);

// Hanya caregiver yang punya dependents (API_CONTRACT §3). `admin` ikut
// diizinkan karena di modul lain admin diperlakukan sebagai superuser
// (lihat requireCaregiver di middleware/rbac.ts). requireRole berjalan SETELAH
// requireAuth karena bergantung pada req.user.role.
usersRouter.get(
  "/me/dependents",
  requireRole(["caregiver", "admin"]),
  controller.listDependentsHandler,
);
