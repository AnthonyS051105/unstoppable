// Inti keamanan OTP: generate acak kriptografis, hash SHA-256, TTL 5 menit,
// sekali pakai. Lihat backend/docs/SDD.md §12.1.
import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { maskPhoneNumber } from "../../shared/phone.js";

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

/** Membuat baris OTP baru dan "mengirim" (log di dev, SMS di prod). */
export async function issueOtp(userId: string, phoneNumber: string, purpose = "register") {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.otpVerification.create({
    data: { userId, phoneNumber, otpHash, purpose, expiresAt },
  });

  await deliverOtp(phoneNumber, otp);
  return { expiresInSec: OTP_TTL_MS / 1000 };
}

/** Dev mode (provider SMS belum dikonfigurasi): tulis ke log, jangan blokir development. */
async function deliverOtp(phoneNumber: string, otp: string) {
  const smsProviderConfigured = Boolean(process.env.SMS_PROVIDER_API_KEY);

  if (!smsProviderConfigured) {
    console.warn(`[DEV] OTP untuk ${maskPhoneNumber(phoneNumber)}: ${otp}`);
    return;
  }

  // TODO: integrasi provider SMS sungguhan saat sudah dikonfigurasi.
  throw new AppError("INTERNAL_ERROR", "Provider SMS belum diimplementasikan.", 500);
}

/** Memverifikasi OTP: cocok, belum kedaluwarsa, belum dipakai. Sekali pakai -> langsung consume. */
export async function verifyOtp(userId: string, phoneNumber: string, otp: string) {
  const candidate = await prisma.otpVerification.findFirst({
    where: { userId, phoneNumber, consumedAt: null },
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
