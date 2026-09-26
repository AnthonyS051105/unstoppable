// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3: "controller tidak boleh menyentuh database langsung"). Tidak ada
// Prisma/raw SQL di sini.
import { AppError } from "../../shared/errors.js";
import { ok, created } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { serializeBigInt } from "../../shared/bigint.js";
import { createReportSchema, type NearbyQueryInput, type AlongRouteQueryInput } from "./reports.schema.js";
import * as reportsService from "./reports.service.js";

const MAX_PHOTOS = 3;

/**
 * POST /api/reports
 * multipart/form-data: field "data" (JSON string, lihat createReportSchema)
 * + field "photos" (maks 3 file, ditangani middleware multer di routes.ts).
 */
export const createReportHandler = asyncHandler(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length > MAX_PHOTOS) {
    throw new AppError("VALIDATION_ERROR", `Maksimal ${MAX_PHOTOS} foto per laporan.`, 400, {
      fieldErrors: { photos: [`Maksimal ${MAX_PHOTOS} foto.`] },
    });
  }

  let rawData: unknown;
  try {
    rawData = JSON.parse(req.body.data ?? "{}");
  } catch {
    throw new AppError("VALIDATION_ERROR", "Field 'data' harus berupa JSON yang valid.", 400, {
      fieldErrors: { data: ["JSON tidak valid."] },
    });
  }

  const input = createReportSchema.parse(rawData);
  const report = await reportsService.createReport({
    reporterId: req.user!.id,
    input,
    photos: files.map((file) => ({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    })),
  });

  created(res, serializeBigInt(report));
});

/**
 * GET /api/reports/nearby?lng=&lat=&radiusM=&status=
 */
export const nearbyReportsHandler = asyncHandler(async (req, res) => {
  const query = req.query as unknown as NearbyQueryInput;
  const reports = await reportsService.findNearbyReports(query);
  ok(res, serializeBigInt(reports));
});

/**
 * GET /api/reports/along-route?edgeIds=101,102,117
 */
export const alongRouteReportsHandler = asyncHandler(async (req, res) => {
  const { edgeIds } = req.query as unknown as AlongRouteQueryInput;
  const reports = await reportsService.findReportsAlongRoute(edgeIds);
  ok(res, serializeBigInt(reports));
});

/**
 * POST /api/reports/:id/corroborate
 */
export const corroborateReportHandler = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const result = await reportsService.corroborateReport(id, req.user!.id);
  ok(res, result);
});
