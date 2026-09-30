import { Router } from "express";
import multer, { MulterError } from "multer";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { AppError } from "../../shared/errors.js";
import { nearbyQuerySchema, alongRouteQuerySchema } from "./reports.schema.js";
import {
  createReportHandler,
  nearbyReportsHandler,
  alongRouteReportsHandler,
  corroborateReportHandler,
} from "./reports.controller.js";

// Foto ditahan di memori (buffer) lalu diteruskan ke Supabase Storage --
// tidak pernah ditulis ke disk lokal. Batas ukuran dijaga di sini (5 MB/foto)
// supaya request besar ditolak sebelum masuk service.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
});

// multer melempar MulterError (bukan AppError/ZodError) saat batas
// ukuran/jumlah file dilanggar -- middleware/error-handler.ts (dipakai semua
// modul) tidak mengenalinya secara eksplisit, jadi tanpa ini pengguna akan
// menerima 500 generik padahal ini murni kesalahan input mereka. Ditangani
// lokal di sini (bukan mengubah error-handler.ts bersama) supaya tetap masuk
// sebagai 400 VALIDATION_ERROR yang jelas.
function handleUploadError(err: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Ukuran foto maksimal 5 MB per file." : "Maksimal 3 foto per laporan.";
    return next(new AppError("VALIDATION_ERROR", message, 400, { fieldErrors: { photos: [message] } }));
  }
  next(err);
}

export const reportsRouter = Router();

// createReportSchema divalidasi manual di controller (bukan lewat middleware
// validate()) karena body-nya adalah field "data" berisi JSON STRING di
// dalam multipart/form-data, bukan JSON murni di req.body -- middleware
// validate() generik mengasumsikan req.body sudah berbentuk objek.
reportsRouter.post("/", requireAuth, upload.array("photos", 3), handleUploadError, createReportHandler);

reportsRouter.get("/nearby", validate({ query: nearbyQuerySchema }), nearbyReportsHandler);
reportsRouter.get("/along-route", validate({ query: alongRouteQuerySchema }), alongRouteReportsHandler);
reportsRouter.post("/:id/corroborate", requireAuth, corroborateReportHandler);
