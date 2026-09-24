// Rate limit per nomor telepon untuk endpoint OTP (SDD §3.3):
//   verify-otp  : 5x / 15 menit per nomor
//   resend-otp  : 3x / jam per nomor
// Implementasi in-memory sederhana (cukup untuk skala hackathon single-instance;
// kalau nanti multi-instance, ganti store ke Redis yang sudah dipakai project ini).
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

function createPhoneRateLimiter(windowMs: number, max: number) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber : null;
    if (!phoneNumber) {
      return next(); // biarkan Zod validasi body; bukan tanggung jawab limiter ini
    }

    const now = Date.now();
    const bucket = buckets.get(phoneNumber);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(phoneNumber, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      return next(
        new AppError("RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi nanti.", 429, {
          retryAfterSec,
        }),
      );
    }

    bucket.count += 1;
    next();
  };
}

export const verifyOtpLimiter = createPhoneRateLimiter(15 * 60 * 1000, 5);
export const resendOtpLimiter = createPhoneRateLimiter(60 * 60 * 1000, 3);
