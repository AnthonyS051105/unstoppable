import { z } from "zod";

const phoneNumberSchema = z
  .string()
  .regex(/^08[0-9]{8,11}$/, "Nomor telepon tidak valid.");

export const registerSchema = z.object({
  phoneNumber: phoneNumberSchema,
  name: z.string().min(2).max(100),
  role: z.enum(["blind_user", "mobility_user", "caregiver", "volunteer"]),
  password: z.string().min(8, "Kata sandi minimal 8 karakter."),
});

export const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().length(6).regex(/^\d+$/, "OTP harus 6 digit angka."),
});

export const resendOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const loginSchema = z.object({
  phoneNumber: phoneNumberSchema,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
