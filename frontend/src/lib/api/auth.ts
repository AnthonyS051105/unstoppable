// Auth endpoints (API_CONTRACT §2).
import { jsonBody, publicApi } from "@/lib/api-client";
import type { AuthResult, RegisterRequest, RegisterResult } from "@/types/api";

export const register = (body: RegisterRequest) => publicApi<RegisterResult>("/auth/register", jsonBody(body));

export const verifyOtp = (identifier: string, otp: string) => {
  const isEmail = identifier.includes("@");
  return publicApi<AuthResult>(
    "/auth/verify-otp",
    jsonBody(isEmail ? { email: identifier, otp } : { phoneNumber: identifier, otp }),
  );
};

export const resendOtp = (identifier: string) => {
  const isEmail = identifier.includes("@");
  return publicApi<{ expiresInSec: number }>(
    "/auth/resend-otp",
    jsonBody(isEmail ? { email: identifier } : { phoneNumber: identifier }),
  );
};

export const login = (identifier: string, password: string) => {
  const isEmail = identifier.includes("@");
  return publicApi<AuthResult>(
    "/auth/login",
    jsonBody(isEmail ? { email: identifier, password } : { phoneNumber: identifier, password }),
  );
};
