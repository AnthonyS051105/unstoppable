import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { maskPhoneNumber } from "../../shared/phone.js";
import { issueOtp, verifyOtp as verifyOtpCode } from "./otp.js";
import { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from "./token.js";
import type { RegisterInput, VerifyOtpInput, LoginInput } from "./auth.schema.js";

const BCRYPT_COST = 10;

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber } });
  if (existing) {
    throw new AppError("CONFLICT", "Nomor telepon sudah terdaftar.", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      phoneNumber: input.phoneNumber,
      name: input.name,
      role: input.role,
      passwordHash,
    },
  });

  const { expiresInSec } = await issueOtp(user.id, user.phoneNumber, "register");

  return {
    userId: user.id,
    otpSentTo: maskPhoneNumber(user.phoneNumber),
    expiresInSec,
  };
}

async function buildAuthResult(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      phoneVerified: user.phoneVerified,
    },
  };
}

export async function verifyOtpAndActivate(input: VerifyOtpInput) {
  const user = await prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber } });
  if (!user) {
    throw new AppError("VALIDATION_ERROR", "Nomor telepon tidak ditemukan.", 400);
  }

  await verifyOtpCode(user.id, user.phoneNumber, input.otp);

  if (!user.phoneVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
  }

  return buildAuthResult(user.id);
}

export async function resendOtp(phoneNumber: string) {
  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) {
    throw new AppError("VALIDATION_ERROR", "Nomor telepon tidak ditemukan.", 400);
  }
  if (user.phoneVerified) {
    throw new AppError("CONFLICT", "Nomor telepon sudah terverifikasi.", 409);
  }

  return issueOtp(user.id, user.phoneNumber, "register");
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber } });
  if (!user || !user.passwordHash) {
    throw new AppError("UNAUTHENTICATED", "Nomor telepon atau kata sandi salah.", 401);
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError("UNAUTHENTICATED", "Nomor telepon atau kata sandi salah.", 401);
  }
  if (!user.phoneVerified) {
    throw new AppError("FORBIDDEN", "Nomor telepon belum diverifikasi.", 403);
  }

  return buildAuthResult(user.id);
}

export async function refresh(refreshToken: string) {
  const { userId, newPlainToken } = await rotateRefreshToken(refreshToken);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  return { accessToken, refreshToken: newPlainToken };
}

export async function logout(refreshToken: string) {
  await revokeRefreshToken(refreshToken);
}
