// Auth endpoints (API_CONTRACT §2).
import { jsonBody, publicApi } from "@/lib/api-client";
import type { AuthResult, RegisterRequest, RegisterResult } from "@/types/api";

export const register = (body: RegisterRequest) => publicApi<RegisterResult>("/auth/register", jsonBody(body));

export const verifyOtp = (phoneNumber: string, otp: string) => publicApi<AuthResult>("/auth/verify-otp", jsonBody({ phoneNumber, otp }));

export const resendOtp = (phoneNumber: string) =>
  publicApi<{ expiresInSec: number }>("/auth/resend-otp", jsonBody({ phoneNumber }));

export const login = (phoneNumber: string, password: string) => publicApi<AuthResult>("/auth/login", jsonBody({ phoneNumber, password }));
