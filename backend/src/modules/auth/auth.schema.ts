import { z } from "zod";

const phoneNumberSchema = z
  .string()
  .regex(/^08[0-9]{8,11}$/, "Nomor telepon tidak valid.");

const emailSchema = z
  .string()
  .email("Format email tidak valid.");

export const registerSchema = z
  .object({
    email: emailSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
    name: z.string().min(2).max(100),
    role: z.enum(["blind_user", "mobility_user", "caregiver", "volunteer"]),
    password: z.string().min(8, "Kata sandi minimal 8 karakter."),
  })
  .refine((data) => Boolean(data.email || data.phoneNumber), {
    message: "Email atau nomor telepon wajib diisi.",
    path: ["email"],
  });

export const verifyOtpSchema = z
  .object({
    email: emailSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
    otp: z.string().length(6).regex(/^\d+$/, "OTP harus 6 digit angka."),
  })
  .refine((data) => Boolean(data.email || data.phoneNumber), {
    message: "Email atau nomor telepon wajib diisi.",
    path: ["email"],
  });

export const resendOtpSchema = z
  .object({
    email: emailSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
  })
  .refine((data) => Boolean(data.email || data.phoneNumber), {
    message: "Email atau nomor telepon wajib diisi.",
    path: ["email"],
  });

export const loginSchema = z
  .object({
    email: emailSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
    password: z.string().min(1),
  })
  .refine((data) => Boolean(data.email || data.phoneNumber), {
    message: "Email atau nomor telepon wajib diisi.",
    path: ["email"],
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
