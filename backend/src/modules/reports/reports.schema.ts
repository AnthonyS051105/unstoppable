// Skema Zod untuk Road Report Service (docs/API_CONTRACT.md §9).
// validate({ body/query }) melempar ZodError langsung -- ditangkap
// middleware/error-handler.ts (lihat formatZodIssues di sana).
import { z } from "zod";
import { REPORT_CATEGORIES, REPORT_SEVERITIES, REPORT_STATUSES } from "./reports.types.js";

const geoPointSchema = z.object({
  type: z.literal("Point"),
  // GeoJSON = selalu [longitude, latitude] (docs/API_CONTRACT.md §1.2).
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

// Body ini divalidasi manual di controller (bukan lewat middleware validate())
// karena datang sebagai field "data" berisi JSON STRING di dalam
// multipart/form-data, bukan objek JSON murni di req.body -- lihat
// reports.controller.ts.
export const createReportSchema = z.object({
  location: geoPointSchema,
  category: z.enum(REPORT_CATEGORIES),
  severity: z.enum(REPORT_SEVERITIES),
  description: z.string().trim().min(1).max(1000).optional(),
  edgeId: z.string().regex(/^\d+$/, "edgeId harus berupa angka").optional(),
});

export const nearbyQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radiusM: z.coerce.number().positive().max(5000).default(1000),
  status: z.enum(REPORT_STATUSES).default("active"),
});

export const alongRouteQuerySchema = z.object({
  edgeIds: z
    .string()
    .min(1, "edgeIds tidak boleh kosong")
    .transform((value) => value.split(",").map((id) => id.trim()))
    .pipe(z.array(z.string().regex(/^\d+$/, "setiap edgeId harus berupa angka")).min(1)),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type NearbyQueryInput = z.infer<typeof nearbyQuerySchema>;
export type AlongRouteQueryInput = z.infer<typeof alongRouteQuerySchema>;
