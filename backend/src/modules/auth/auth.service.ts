import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { maskPhoneNumber } from "../../shared/phone.js";
import { maskEmail } from "./email.service.js";
import { issueOtp, verifyOtp as verifyOtpCode } from "./otp.js";
import { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from "./token.js";
import type { RegisterInput, VerifyOtpInput, LoginInput } from "./auth.schema.js";

const BCRYPT_COST = 10;

export async function register(input: RegisterInput) {
  if (input.email) {
    const existingEmail = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingEmail) {
      throw new AppError("CONFLICT", "Alamat email sudah terdaftar.", 409);
    }
  }

  if (input.phoneNumber) {
    const existingPhone = await prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber } });
    if (existingPhone) {
      throw new AppError("CONFLICT", "Nomor telepon sudah terdaftar.", 409);
    }
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      email: input.email ?? null,
      phoneNumber: input.phoneNumber ?? null,
      name: input.name,
      role: input.role,
      passwordHash,
    },
  });

  const targetIdentifier = user.email || user.phoneNumber || "";
  const { expiresInSec } = await issueOtp(user.id, targetIdentifier, "register");

  return {
    userId: user.id,
    otpSentTo: user.email ? maskEmail(user.email) : maskPhoneNumber(user.phoneNumber || ""),
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
      email: user.email,
      phoneNumber: user.phoneNumber,
      phoneVerified: user.phoneVerified,
    },
  };
}

export async function verifyOtpAndActivate(input: VerifyOtpInput) {
  const identifier = input.email || input.phoneNumber || "";
  const user = input.email
    ? await prisma.user.findUnique({ where: { email: input.email } })
    : await prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber! } });

  if (!user) {
    throw new AppError("VALIDATION_ERROR", input.email ? "Alamat email tidak ditemukan." : "Nomor telepon tidak ditemukan.", 400);
  }

  await verifyOtpCode(user.id, identifier, input.otp);

  if (!user.phoneVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
  }

  return buildAuthResult(user.id);
}

export async function resendOtp(identifier: string) {
  const isEmail = identifier.includes("@");
  const user = await prisma.user.findUnique({
    where: isEmail ? { email: identifier } : { phoneNumber: identifier },
  });

  if (!user) {
    throw new AppError("VALIDATION_ERROR", isEmail ? "Alamat email tidak ditemukan." : "Nomor telepon tidak ditemukan.", 400);
  }
  if (user.phoneVerified) {
    throw new AppError("CONFLICT", isEmail ? "Alamat email sudah terverifikasi." : "Nomor telepon sudah terverifikasi.", 409);
  }

  return issueOtp(user.id, isEmail ? user.email! : user.phoneNumber!, "register");
}

export async function login(input: LoginInput) {
  const user = input.email
    ? await prisma.user.findUnique({ where: { email: input.email } })
    : await prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber! } });

  if (!user || !user.passwordHash) {
    throw new AppError("UNAUTHENTICATED", input.email ? "Email atau kata sandi salah." : "Nomor telepon atau kata sandi salah.", 401);
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError("UNAUTHENTICATED", input.email ? "Email atau kata sandi salah." : "Nomor telepon atau kata sandi salah.", 401);
  }
  if (!user.phoneVerified) {
    throw new AppError("FORBIDDEN", input.email ? "Alamat email belum diverifikasi." : "Nomor telepon belum diverifikasi.", 403);
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
