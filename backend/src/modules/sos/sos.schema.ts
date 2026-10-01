// Skema Zod untuk SOS Service (docs/API_CONTRACT.md §14).
// validate({ body }) melempar ZodError langsung -- ditangkap middleware/error-handler.ts.
import { z } from "zod";
import { SOS_TRIGGER_TYPES, SOS_RESPONSE_STATUSES, SOS_CANCEL_REASONS } from "./sos.types.js";

const geoPointSchema = z.object({
  type: z.literal("Point"),
  // GeoJSON = selalu [longitude, latitude] (docs/API_CONTRACT.md §1.2).
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

export const triggerSosSchema = z.object({
  sessionId: z.string().uuid().nullish(),
  triggerType: z.enum(SOS_TRIGGER_TYPES),
  location: geoPointSchema,
  audioRecordingUrl: z.string().url().optional(),
});

export const cancelSosSchema = z.object({
  reason: z.enum(SOS_CANCEL_REASONS).default("false_alarm"),
});

export const respondSosSchema = z.object({
  responseStatus: z.enum(SOS_RESPONSE_STATUSES),
});

export type TriggerSosInput = z.infer<typeof triggerSosSchema>;
export type CancelSosInput = z.infer<typeof cancelSosSchema>;
export type RespondSosInput = z.infer<typeof respondSosSchema>;
