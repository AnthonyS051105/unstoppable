// Skema Zod untuk Speech Service (docs/API_CONTRACT.md §6).
import { z } from "zod";

export const synthesizeSchema = z.object({
  text: z.string().min(1).max(2000),
  speedPercent: z.number().int().min(50).max(200).optional(),
  lang: z.string().optional(),
});

export type SynthesizeInput = z.infer<typeof synthesizeSchema>;
