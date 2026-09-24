import { ok, created, noContent } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import * as authService from "./auth.service.js";

export const registerHandler = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  created(res, result);
});

export const verifyOtpHandler = asyncHandler(async (req, res) => {
  const result = await authService.verifyOtpAndActivate(req.body);
  ok(res, result);
});

export const resendOtpHandler = asyncHandler(async (req, res) => {
  const result = await authService.resendOtp(req.body.phoneNumber);
  ok(res, result);
});

export const loginHandler = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  ok(res, result);
});

export const refreshHandler = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken);
  ok(res, result);
});

export const logoutHandler = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  noContent(res);
});
