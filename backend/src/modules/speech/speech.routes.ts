import { Router } from "express";
import multer, { MulterError } from "multer";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireTraveler } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { AppError } from "../../shared/errors.js";
import { synthesizeSchema } from "./speech.schema.js";
import * as speechController from "./speech.controller.js";

// Sama dengan batas MAX_AUDIO_BYTES di voice-microservices/app/config.py --
// tolak upload besar sebelum sampai ke microservice.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// multer melempar MulterError (bukan AppError/ZodError), pola sama seperti
// reports.routes.ts -- tanpa ini pengguna dapat 500 generik, bukan 400 jelas.
function handleUploadError(err: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (err instanceof MulterError) {
    return next(new AppError("VALIDATION_ERROR", "Ukuran audio maksimal 10 MB.", 400));
  }
  next(err);
}

const router = Router();

router.post(
  "/synthesize",
  requireAuth,
  requireTraveler,
  validate({ body: synthesizeSchema }),
  speechController.synthesize,
);
router.post(
  "/transcribe",
  requireAuth,
  requireTraveler,
  upload.single("audio"),
  handleUploadError,
  speechController.transcribe,
);

export default router;
