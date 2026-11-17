import { z } from "zod";

const geoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ]),
});

export const recommendMultimodalSchema = z.object({
  origin: geoPointSchema,
  destination: geoPointSchema,
  profileId: z.string().min(1).optional(),
  demoContext: z.boolean().optional().default(false),
  requestedDepartureIso: z.string().min(1).optional(),
  maxWalkMeters: z.number().finite().min(10).max(5000).optional(),
  preferFewerTransfers: z.boolean().optional().default(false),
});

export type RecommendMultimodalInput = z.infer<typeof recommendMultimodalSchema>;
