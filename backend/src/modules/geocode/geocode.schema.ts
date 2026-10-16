import { z } from "zod";

export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(3).max(120),
    lng: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    limit: z.coerce.number().int().min(1).max(10).default(6),
  })
  .refine(({ lng, lat }) => (lng === undefined) === (lat === undefined), {
    message: "lng dan lat harus diisi bersamaan.",
    path: ["lng"],
  });

export const reverseQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type ReverseQueryInput = z.infer<typeof reverseQuerySchema>;
