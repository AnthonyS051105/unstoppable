// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3: "controller tidak boleh menyentuh database langsung"). Tidak ada
// Prisma/raw SQL di sini.
import { AppError } from "../../shared/errors.js";
import { ok, created } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { serializeBigInt } from "../../shared/bigint.js";
import { getIo } from "../../realtime/index.js";
import { broadcastReportNearby } from "../../realtime/report.handlers.js";
import * as sessionsService from "../sessions/sessions.service.js";
import { createReportSchema, type NearbyQueryInput, type AlongRouteQueryInput } from "./reports.schema.js";
import { REPORT_NEARBY_RADIUS_M } from "./reports.types.js";
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
  const reporterId = req.user!.id;
  const report = await reportsService.createReport({
    reporterId,
    input,
    photos: files.map((file) => ({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    })),
  });

  // §15.3 report:nearby -- beri tahu pengguna yang sedang dalam perjalanan di
  // sekitar lokasi laporan (pelapor sendiri dikecualikan di service). Dilakukan
  // setelah laporan tersimpan; kegagalan notifikasi tidak boleh membatalkan
  // pembuatan laporan yang sudah sukses (asyncHandler meneruskan error, tapi
  // laporan sudah persisten -- sama prinsipnya dengan recordCaregiverNotifications).
  const [lng, lat] = input.location.coordinates;
  const nearbyUserIds = await sessionsService.findActiveSessionUsersNear(
    lng,
    lat,
    REPORT_NEARBY_RADIUS_M,
    reporterId,
  );
  if (nearbyUserIds.length > 0) {
    broadcastReportNearby(getIo(), nearbyUserIds, {
      reportId: report.id,
      coordinates: [lng, lat],
      category: report.category,
      severity: report.severity,
    });
  }

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
