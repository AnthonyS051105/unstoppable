import { z } from "zod";

// B12b (§15.4) — daftar notifikasi terpaginasi (paginasi §1.1).
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export const idParamSchema = z.object({ id: z.string().uuid() });

export type ListQueryInput = z.infer<typeof listQuerySchema>;
