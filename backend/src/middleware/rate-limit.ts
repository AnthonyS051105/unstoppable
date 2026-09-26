import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many requests from this IP, please try again later"
    }
})

export const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many road reports submitted. Please wait before submitting another report.",
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again after 15 minutes.",
  },
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
  message: {
    error: "Too many OTP verification attempts. Please try again after 15 minutes.",
  },
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
  message: {
    error: "Too many OTP resend requests. Please try again after 1 hour.",
  },
});