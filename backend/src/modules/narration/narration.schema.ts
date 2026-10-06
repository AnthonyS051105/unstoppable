// Skema Zod untuk Narration Service (docs/API_CONTRACT.md §6).
// Hanya memvalidasi field dari RouteStep (modules/routes/routes.types.ts)
// yang benar-benar dipakai narration.service.ts -- bukan seluruh bentuk
// RouteStep (startPoint/attributes tidak relevan untuk narasi).
import { z } from "zod";

const stepWarningSchema = z.object({
  type: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
});

const narrationStepSchema = z.object({
  order: z.number(),
  instruction: z.string().min(1),
  distanceM: z.number(),
  warnings: z.array(stepWarningSchema).default([]),
});

export const narrateRouteSchema = z.object({
  steps: z.array(narrationStepSchema).min(1, "steps tidak boleh kosong"),
  profileId: z.string().min(1).optional(),
});

export type NarrateRouteInput = z.infer<typeof narrateRouteSchema>;
