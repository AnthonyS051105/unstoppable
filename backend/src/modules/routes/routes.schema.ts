// Skema Zod untuk Route Service (docs/API_CONTRACT.md §5).
// validate({ body }) atau .parse() di controller -- ZodError ditangkap
// middleware/error-handler.ts.
import { z } from "zod";

// GeoJSON = selalu [longitude, latitude] (docs/API_CONTRACT.md §1.2) --
// pola sama persis reports.schema.ts#geoPointSchema.
const geoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

export const planRouteSchema = z.object({
  origin: geoPointSchema,
  destination: geoPointSchema,
  profileId: z.string().min(1).optional(),
  includeNarration: z.boolean().optional(),
});

export const compareRouteSchema = z.object({
  origin: geoPointSchema,
  destination: geoPointSchema,
  profileIds: z.array(z.string().min(1)).min(2),
});

// Saved routes (docs/API_CONTRACT.md §5). edgeIds datang sebagai string[]
// (BigInt diserialisasi jadi string di response /routes/plan, jadi FE
// mengirim balik bentuk yang sama) -- dikonversi ke BigInt di service.
// Hanya digit yang diterima supaya tidak ada string sembarang masuk ke
// kolom bigint[] (BigInt("abc") melempar -> ditangkap zod sebagai 400).
const bigIntStringSchema = z.string().regex(/^\d+$/, "edgeId harus berupa angka");

export const saveRouteSchema = z.object({
  name: z.string().min(1, "name wajib diisi").max(120),
  origin: geoPointSchema,
  destination: geoPointSchema,
  edgeIds: z.array(bigIntStringSchema).default([]),
  profileId: z.string().min(1).optional(),
});

export type PlanRouteInput = z.infer<typeof planRouteSchema>;
export type CompareRouteInput = z.infer<typeof compareRouteSchema>;
export type SaveRouteInput = z.infer<typeof saveRouteSchema>;
