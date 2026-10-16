import { z } from "zod";
import { geoPointSchema } from "../../shared/geo.schema.js";

const latLngSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

export const sessionPointSchema = z.union([geoPointSchema, latLngSchema]);

export const startSessionSchema = z
  .object({
    origin: sessionPointSchema,
    destination: sessionPointSchema,
    destinationName: z.string().trim().max(200).optional(),
    edgeIds: z
      .array(z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]))
      .optional(),
    profileId: z.string().trim().min(1).max(30).optional(),
    estimatedArrival: z.coerce.date().optional(),
    plannedTripId: z.string().uuid().optional(), // B14
  })
  .strict();

export const locationUpdateSchema = z
  .object({
    location: sessionPointSchema,
    accuracyM: z.number().finite().min(0).max(10000).optional(),
  })
  .strict();

export const endSessionSchema = z
  .object({
    status: z.enum(["completed", "cancelled"]).default("completed"),
    destinationName: z.string().trim().max(200).optional(),
  })
  .strict()
  .optional()
  .default(() => ({ status: "completed" as const }));

export const arrivalSchema = z
  .object({
    arrived: z.boolean(),
  })
  .strict();

export const pauseSchema = z
  .object({})
  .strict()
  .optional()
  .default(() => ({}));

export const wellbeingSchema = z
  .object({
    status: z.enum(["arrived", "ok", "help"]),
  })
  .strict();

export const feedbackSchema = z
  .object({
    rating: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  })
  .strict();

export type SessionPointInput = z.infer<typeof sessionPointSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
export type EndSessionInput = z.infer<typeof endSessionSchema>;
export type ArrivalInput = z.infer<typeof arrivalSchema>;
export type WellbeingInput = z.infer<typeof wellbeingSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
