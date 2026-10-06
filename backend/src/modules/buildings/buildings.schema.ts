import { z } from "zod";

export const listBuildingsQuerySchema = z.object({
  faculty: z.string().trim().min(1).optional(),
});

export const buildingIdParamSchema = z.object({
  id: z.uuid("id gedung harus berupa UUID"),
});
