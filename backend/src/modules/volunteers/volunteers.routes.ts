// Semua endpoint wajib login. Endpoint admin ditambah requireRole(["admin"]).
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer, { MulterError } from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { AppError } from "../../shared/errors.js";
import * as controller from "./volunteers.controller.js";
import {
  applySchema,
  patchMeSchema,
  createAvailabilitySchema,
  nearbyQuerySchema,
  availableQuerySchema,
  rateSchema,
  reviewVolunteerSchema,
} from "./volunteers.schema.js";

const uploadIdentity = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function handleIdentityUploadError(err: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Ukuran dokumen identitas maksimal 5 MB."
        : "Hanya satu berkas dokumen identitas yang diizinkan.";
    return next(new AppError("VALIDATION_ERROR", message, 400, { fieldErrors: { document: [message] } }));
  }
  next(err);
}

export const volunteersRouter = Router();
volunteersRouter.use(requireAuth);

volunteersRouter.post(
  "/identity-document",
  requireRole(["volunteer"]),
  uploadIdentity.single("document"),
  handleIdentityUploadError,
  controller.uploadIdentityHandler,
);
volunteersRouter.get("/me/identity-document", controller.getMyIdentityHandler);
volunteersRouter.get(
  "/:id/identity-document",
  requireRole(["admin"]),
  controller.getIdentityByIdHandler,
);

// Yang boleh mendaftar jadi relawan: pengguna lansia (blind_user /
// mobility_user) yang juga ingin membantu, DAN akun ber-role `volunteer`
// (jalur relawan utama). admin SENGAJA dikecualikan — mendaftar relawan adalah
// aksi end-user, bukan administratif. requireRole berjalan SETELAH requireAuth
// (router.use(requireAuth) di atas) karena bergantung pada req.user.role.
volunteersRouter.post(
  "/apply",
  requireRole(["blind_user", "mobility_user", "volunteer"]),
  validate({ body: applySchema }),
  controller.applyHandler,
);
volunteersRouter.get("/me", controller.getMeHandler);
volunteersRouter.patch("/me", validate({ body: patchMeSchema }), controller.patchMeHandler);

volunteersRouter.post(
  "/availability",
  validate({ body: createAvailabilitySchema }),
  controller.addAvailabilityHandler,
);
volunteersRouter.get("/availability", controller.listAvailabilityHandler);
volunteersRouter.delete("/availability/:id", controller.removeAvailabilityHandler);

volunteersRouter.get("/nearby", validate({ query: nearbyQuerySchema }), controller.nearbyHandler);

// B3 (§11): daftar relawan yang bisa dipilih pengguna. Untuk pengguna peminta,
// bukan relawan, jadi TIDAK memakai requireCapability("canCompanion"). Harus
// berada sebelum route yang memakai "/:id".
volunteersRouter.get("/available", validate({ query: availableQuerySchema }), controller.availableHandler);

volunteersRouter.post("/:id/rate", validate({ body: rateSchema }), controller.rateHandler);
volunteersRouter.patch(
  "/:id/verification",
  requireRole(["admin"]),
  validate({ body: reviewVolunteerSchema }),
  controller.reviewHandler,
);
