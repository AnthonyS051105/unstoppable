import { z } from "zod";
import { geoPointSchema } from "../../shared/geo.schema.js";

export const communitiesQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
});

export const communityIdSchema = z.object({
  id: z.string().uuid(),
});

export const createCommunitySchema = z
  .object({
    slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(3).max(150),
    description: z.string().trim().min(3).max(1000),
    icon: z.string().trim().min(1).max(50).default("users"),
    centerPoint: geoPointSchema,
    radiusMeters: z.number().int().min(200).max(20000).default(3000),
  })
  .strict();

export type CommunitiesQueryInput = z.infer<typeof communitiesQuerySchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
