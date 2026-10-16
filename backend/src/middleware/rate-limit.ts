import rateLimit from "express-rate-limit";
import { AppError } from "../shared/errors.js";

function createRateLimitHandler(windowMs: number, message: string) {
  const retryAfterSec = Math.ceil(windowMs / 1000);
  return (_req: unknown, _res: unknown, next: (err?: unknown) => void) => {
    next(new AppError("RATE_LIMITED", message, 429, { retryAfterSec }));
  };
}

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    15 * 60 * 1000,
    "Too many requests from this IP, please try again after 15 minutes.",
  ),
});

export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
  validate: false,
  handler: createRateLimitHandler(
    60 * 60 * 1000,
    "Too many report submissions from this user (maximum 20 per hour). Please try again later.",
  ),
});

export const sosLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
  validate: false,
  handler: createRateLimitHandler(
    10 * 60 * 1000,
    "Too many SOS requests in a short period. Please try again in a few minutes.",
  ),
});

export const routePlanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
  validate: false,
  handler: createRateLimitHandler(
    60 * 1000,
    "Terlalu banyak permintaan rute dalam waktu singkat. Silakan coba lagi sebentar.",
  ),
});

export const locationPingLimiter = rateLimit({
  windowMs: 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.params?.id as string | undefined) ?? req.user?.id ?? req.ip ?? "anonymous",
  validate: false,
  handler: createRateLimitHandler(
    1000,
    "Location updates are too frequent (maximum 1 time per second).",
  ),
});

// Batas percobaan login per IP dalam 15 menit. Default 5 (aman untuk produksi).
// Bisa dinaikkan lewat env AUTH_LOGIN_MAX saat testing manual yang perlu
// login banyak aktor berulang (mis. AUTH_LOGIN_MAX=100).
const AUTH_LOGIN_MAX = Number(process.env.AUTH_LOGIN_MAX ?? 5);

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isFinite(AUTH_LOGIN_MAX) && AUTH_LOGIN_MAX > 0 ? AUTH_LOGIN_MAX : 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    15 * 60 * 1000,
    "Too many login attempts. Please try again after 15 minutes.",
  ),
});

export const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    typeof req.body?.phoneNumber === "string"
      ? req.body.phoneNumber
      : (req.ip ?? "anonymous"),
  validate: false,
  handler: createRateLimitHandler(
    15 * 60 * 1000,
    "Too many OTP verification attempts. Please try again after 15 minutes.",
  ),
});

export const resendOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    typeof req.body?.phoneNumber === "string"
      ? req.body.phoneNumber
      : (req.ip ?? "anonymous"),
  validate: false,
  handler: createRateLimitHandler(
    60 * 60 * 1000,
    "Too many OTP resend requests. Please try again after 1 hour.",
  ),
});