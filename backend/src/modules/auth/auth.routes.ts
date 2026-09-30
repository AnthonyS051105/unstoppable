import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { verifyOtpLimiter, resendOtpLimiter, authLimiter } from "../../middleware/rate-limit.js";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from "./auth.schema.js";
import {
  registerHandler,
  verifyOtpHandler,
  resendOtpHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
} from "./auth.controller.js";

const router = Router();

router.post("/register", validate({ body: registerSchema }), registerHandler);
router.post("/verify-otp", verifyOtpLimiter, validate({ body: verifyOtpSchema }), verifyOtpHandler);
router.post("/resend-otp", resendOtpLimiter, validate({ body: resendOtpSchema }), resendOtpHandler);
router.post("/login", authLimiter, validate({ body: loginSchema }), loginHandler);
router.post("/refresh", validate({ body: refreshSchema }), refreshHandler);
router.post("/logout", validate({ body: logoutSchema }), logoutHandler);

export default router;
