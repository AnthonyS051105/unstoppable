import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { maskPhoneNumber } from "../../shared/phone.js";
import { maskEmail, sendOtpViaEmail } from "./email.service.js";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 menit
const OTP_LENGTH = 6;

/** OTP 6 digit acak kriptografis (bukan Math.random()). */
export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  return crypto.randomInt(0, max).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export interface OtpTarget {
  email?: string | null;
  phoneNumber?: string | null;
}

/** Membuat baris OTP baru dan mengirim (Gmail SMTP jika email, atau log di dev mode). */
export async function issueOtp(
  userId: string,
  target: OtpTarget | string,
  purpose = "register",
) {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  let email: string | null = null;
  let phoneNumber: string | null = null;

  if (typeof target === "string") {
    if (target.includes("@")) {
      email = target;
    } else {
      phoneNumber = target;
    }
  } else {
    email = target.email ?? null;
    phoneNumber = target.phoneNumber ?? null;
  }

  await prisma.otpVerification.create({
    data: { userId, email, phoneNumber, otpHash, purpose, expiresAt },
  });

  await deliverOtp({ email, phoneNumber }, otp);
  return { expiresInSec: OTP_TTL_MS / 1000 };
}

/** Mengirimkan OTP ke Email via Gmail SMTP jika ada email, atau cetak ke log dev sebagai fallback aman. */
async function deliverOtp(target: OtpTarget, otp: string) {
  if (target.email) {
    const sent = await sendOtpViaEmail(target.email, otp);
    if (sent) return;
    console.warn(`[DEV] OTP untuk email ${maskEmail(target.email)}: ${otp}`);
    return;
  }

  if (target.phoneNumber) {
    const smsProviderConfigured = Boolean(process.env.SMS_PROVIDER_API_KEY);
    if (smsProviderConfigured) {
      throw new AppError("INTERNAL_ERROR", "Provider SMS belum diimplementasikan.", 500);
    }
    console.warn(`[DEV] OTP untuk ${maskPhoneNumber(target.phoneNumber)}: ${otp}`);
  }
}

/** Memverifikasi OTP: cocok, belum kedaluwarsa, belum dipakai. Sekali pakai -> langsung consume. */
export async function verifyOtp(
  userId: string,
  target: OtpTarget | string,
  otp: string,
) {
  let email: string | null = null;
  let phoneNumber: string | null = null;

  if (typeof target === "string") {
    if (target.includes("@")) {
      email = target;
    } else {
      phoneNumber = target;
    }
  } else {
    email = target.email ?? null;
    phoneNumber = target.phoneNumber ?? null;
  }

  const whereClause: any = { userId, consumedAt: null };
  if (email) {
    whereClause.email = email;
  } else if (phoneNumber) {
    whereClause.phoneNumber = phoneNumber;
  }

  const candidate = await prisma.otpVerification.findFirst({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  if (!candidate) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Tidak ada permintaan OTP aktif. Silakan minta OTP baru.",
      400,
    );
  }
  if (candidate.expiresAt < new Date()) {
    throw new AppError("VALIDATION_ERROR", "Kode OTP sudah kedaluwarsa. Silakan minta OTP baru.", 400);
  }

  const otpHash = hashOtp(otp);
  if (otpHash !== candidate.otpHash) {
    await prisma.otpVerification.update({
      where: { id: candidate.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("VALIDATION_ERROR", "Kode OTP salah.", 400);
  }

  // Sekali pakai: tandai consumed dalam operasi yang sama supaya tidak bisa dipakai ulang.
  await prisma.otpVerification.update({
    where: { id: candidate.id },
    data: { consumedAt: new Date() },
  });
}
