import { z } from "zod";
import { geoPointSchema } from "../../shared/geo.schema.js";
import { ASSISTANCE_TYPES, CHECKIN_TYPES } from "./companions.types.js";

export const createRequestSchema = z
  .object({
    destinationName: z.string().trim().min(3).max(200),
    destinationLocation: geoPointSchema,
    meetingPointLocation: geoPointSchema.optional(),
    meetingPointNote: z.string().trim().max(200).optional(),
    scheduledStart: z.coerce.date().refine((d) => d.getTime() > Date.now(), "Jadwal harus di masa depan."),
    estimatedDurationMin: z.number().int().min(15).max(720).optional(),
    assistanceTypes: z.array(z.enum(ASSISTANCE_TYPES)).min(1),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const openQuerySchema = z
  .object({
    lng: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    radiusM: z.coerce.number().positive().max(5000).default(1000),
  })
  .refine(({ lng, lat }) => (lng === undefined) === (lat === undefined), {
    message: "lng dan lat harus diisi bersamaan.",
    path: ["lng"],
  });

export const offerSchema = z.object({ message: z.string().trim().max(500).optional() }).strict();
export const selectSchema = z.object({ offerId: z.string().uuid() }).strict();
export const checkinSchema = z
  .object({ checkinType: z.enum(CHECKIN_TYPES), location: geoPointSchema.optional() })
  .strict();
export const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
export const idParamSchema = z.object({ id: z.string().uuid() });

export type GeoPointInput = z.infer<typeof geoPointSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type OpenQueryInput = z.infer<typeof openQuerySchema>;
export type OfferInput = z.infer<typeof offerSchema>;
export type SelectInput = z.infer<typeof selectSchema>;
export type CheckinInput = z.infer<typeof checkinSchema>;
export type CancelInput = z.infer<typeof cancelSchema>;
