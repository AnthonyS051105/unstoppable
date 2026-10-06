// Rentang toleranceOverrides: docs/DATA_MODEL.md §3 "Rentang nilai valid
// toleranceOverrides" — satu-satunya sumber kebenaran. Dipakai juga di
// weight-builder.ts (Nafal, BE-F-01-3); kalau angka di sini berubah, ubah
// juga di sana dan di tabel DATA_MODEL.md, jangan biarkan menyimpang.
//
// Catatan `max_steps`: rentang 0–30 bukan standar aksesibilitas resmi (tidak
// ada rujukan Permen PUPR untuk batas jumlah anak tangga) — murni keputusan
// produk, provisional, wajib disetel ulang setelah uji pengguna nyata (PRD 11.3).
import { z } from "zod";

const toleranceOverridesSchema = z
  .object({
    max_steps: z.number().int().min(0).max(30),
    max_slope_percent: z.number().min(0).max(15),
    min_width_cm: z.number().int().min(0).max(200),
    avoid_uncovered: z.boolean(),
  })
  .partial()
  .strict(); // field asing di luar 4 ini ditolak, bukan diabaikan diam-diam

const profileSelectionSchema = z.object({
  profileId: z.string().min(1),
  isPrimary: z.boolean(),
  toleranceOverrides: toleranceOverridesSchema.optional(),
});

export const putAccessibilitySchema = z.object({
  profiles: z
    .array(profileSelectionSchema)
    .min(1, "Minimal satu profil aksesibilitas harus dipilih."),
});

export type ToleranceOverrides = z.infer<typeof toleranceOverridesSchema>;
export type PutAccessibilityInput = z.infer<typeof putAccessibilitySchema>;
