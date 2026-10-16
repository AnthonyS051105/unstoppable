import { z } from "zod";
import { geoPointSchema } from "../../shared/geo.schema.js";

// B14 (§15.3) — rencana perjalanan. Bisa dibuat lansia atau keluarga tertaut.
export const createPlannedTripSchema = z
  .object({
    destinationName: z.string().trim().min(3).max(200),
    destination: geoPointSchema,
    departAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), "Waktu berangkat harus di masa depan."),
    profileId: z.string().trim().max(50).optional(),
    // Keluarga membantu merencanakan untuk lansia tertaut.
    forUserId: z.string().uuid().optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().uuid() });

export type CreatePlannedTripInput = z.infer<typeof createPlannedTripSchema>;
