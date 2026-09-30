// Skema PATCH /users/me pakai .strict(): kunci di luar name/profilePhotoUrl/
// blindProfile ditolak Zod sendiri (jadi 400 VALIDATION_ERROR lewat
// error-handler.ts) — ini cara kita menolak percobaan mengubah role/
// canMapData/canCompanion tanpa logic khusus (docs/API_CONTRACT.md §3).
import { z } from "zod";

const phoneNumberSchema = z
  .string()
  .regex(/^08[0-9]{8,11}$/, "Nomor telepon tidak valid.");

// Rentang ttsSpeedPercent belum didefinisikan di DATA_MODEL.md — 50-200
// dipakai sebagai batas provisional (mirip catatan max_steps di
// accessibility-profiles.schema.ts). Konfirmasi ke Anthon/Nafal kalau ada
// batas resmi dari sisi TTS microservice.
const blindProfileSchema = z
  .object({
    ttsSpeedPercent: z.number().int().min(50).max(200),
    ttsVoiceLang: z.string().min(2).max(10),
    emergencyContactName: z.string().min(1).max(100),
    emergencyContactPhone: phoneNumberSchema,
    onboardingCompleted: z.boolean(),
    motionCalibrationData: z.record(z.string(), z.unknown()).nullable(),
  })
  .partial()
  .strict();

export const patchMeSchema = z
  .object({
    name: z.string().min(2).max(100),
    profilePhotoUrl: z.string().url().nullable(),
    blindProfile: blindProfileSchema,
  })
  .partial()
  .strict();

export const addCaregiverSchema = z
  .object({
    caregiverPhone: phoneNumberSchema,
    relationshipType: z.enum(["primary", "secondary"]),
    locationSharingMode: z.enum(["always", "sos_only", "off"]).default("sos_only"),
  })
  .strict();

export type PatchMeInput = z.infer<typeof patchMeSchema>;
export type AddCaregiverInput = z.infer<typeof addCaregiverSchema>;
