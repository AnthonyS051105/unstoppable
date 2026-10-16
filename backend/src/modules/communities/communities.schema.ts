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

export const postPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export const createPostSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().min(3).max(1000),
  })
  .strict();

export const flagPostSchema = z
  .object({
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

export const moderationSchema = z
  .object({
    status: z.enum(["hidden", "visible"]),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    startsAt: z.coerce.date().refine((date) => date.getTime() > Date.now(), "Agenda harus di masa depan."),
    locationNote: z.string().trim().max(300).optional(),
    location: geoPointSchema.optional(),
  })
  .strict();

export const eventIdSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
});

export type PostPageQueryInput = z.infer<typeof postPageQuerySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type FlagPostInput = z.infer<typeof flagPostSchema>;
export type ModerationInput = z.infer<typeof moderationSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;

export type CommunitiesQueryInput = z.infer<typeof communitiesQuerySchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
