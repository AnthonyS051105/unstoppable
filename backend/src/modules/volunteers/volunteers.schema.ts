import { z } from "zod";
import { geoPointSchema } from "../../shared/geo.schema.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam harus HH:MM.");

export const applySchema = z.object({
  motivation: z.string().trim().min(10).max(1000),
  idCardUrl: z.string().url(),
  serviceAreaNote: z.string().trim().max(200).optional(),
});

export const patchMeSchema = z.object({ isActive: z.boolean() }).strict();

export const createAvailabilitySchema = z
  .object({
    centerPoint: geoPointSchema,
    radiusMeters: z.number().int().min(100).max(10000).default(3000),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
  })
  .strict()
  .refine(
    ({ startTime, endTime }) =>
      startTime === undefined ? endTime === undefined : endTime !== undefined && startTime < endTime,
    { message: "startTime dan endTime harus diisi bersamaan, dan startTime harus lebih awal.", path: ["startTime"] },
  );

export const nearbyQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radiusM: z.coerce.number().positive().max(5000).default(1000),
});

export const rateSchema = z
  .object({ requestId: z.string().uuid(), rating: z.number().int().min(1).max(5) })
  .strict();

export const reviewVolunteerSchema = z
  .object({
    verificationStatus: z.enum(["verified", "rejected"]),
    canCompanion: z.boolean().default(false),
    canMapData: z.boolean().default(false),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().uuid() });

export type ApplyInput = z.infer<typeof applySchema>;
export type PatchVolunteerMeInput = z.infer<typeof patchMeSchema>;
export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export type NearbyQueryInput = z.infer<typeof nearbyQuerySchema>;
export type RateInput = z.infer<typeof rateSchema>;
export type ReviewVolunteerInput = z.infer<typeof reviewVolunteerSchema>;
