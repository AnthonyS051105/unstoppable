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

export type PlanRouteInput = z.infer<typeof planRouteSchema>;
export type CompareRouteInput = z.infer<typeof compareRouteSchema>;
