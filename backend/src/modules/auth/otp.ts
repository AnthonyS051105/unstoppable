import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { maskPhoneNumber } from "../../shared/phone.js";
import { sendOtpViaWhatsApp } from "./whatsapp.service.js";

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

/** Mengirimkan OTP ke WhatsApp via OpenWA Gateway jika aktif, atau cetak ke log dev sebagai fallback aman. */
async function deliverOtp(phoneNumber: string, otp: string) {
  // Coba kirim via OpenWA gateway jika diaktifkan di environment
  const sent = await sendOtpViaWhatsApp(phoneNumber, otp);
  if (sent) {
    return;
  }

  // Jika provider SMS terkonfigurasi di masa depan
  const smsProviderConfigured = Boolean(process.env.SMS_PROVIDER_API_KEY);
  if (smsProviderConfigured) {
    throw new AppError("INTERNAL_ERROR", "Provider SMS belum diimplementasikan.", 500);
  }

  // Dev mode fallback: log OTP aman dengan nomor yang tersamarkan
  console.warn(`[DEV] OTP untuk ${maskPhoneNumber(phoneNumber)}: ${otp}`);
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
