// JWT access token (15 menit) + refresh token acak dengan rotasi (7 hari,
// disimpan hash). Lihat backend/docs/SDD.md §12.1 dan docs/API_CONTRACT.md §1.4.
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError("INTERNAL_ERROR", "Konfigurasi server tidak lengkap.", 500);
  }
  return secret;
}

export interface AccessTokenPayload {
  sub: string; // userId
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, jwtSecret(), { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, jwtSecret()) as unknown as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError("TOKEN_EXPIRED", "Sesi kedaluwarsa, silakan perbarui token.", 401);
    }
    throw new AppError("UNAUTHENTICATED", "Token tidak valid.", 401);
  }
}

function randomTokenString(): string {
  return crypto.randomBytes(48).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Membuat refresh token baru (plaintext dikembalikan ke klien, hash disimpan). */
export async function issueRefreshToken(userId: string): Promise<string> {
  const plainToken = randomTokenString();
  const tokenHash = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return plainToken;
}

/**
 * Rotasi: validasi token lama, revoke, terbitkan yang baru.
 * Token yang sudah revoked tapi dipakai lagi (indikasi dicuri) -> revoke SEMUA
 * token user tsb (reuse detection), memaksa login ulang.
 */
export async function rotateRefreshToken(plainToken: string) {
  const tokenHash = hashToken(plainToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new AppError("UNAUTHENTICATED", "Refresh token tidak valid.", 401);
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(
      "UNAUTHENTICATED",
      "Refresh token sudah tidak berlaku. Silakan login ulang.",
      401,
    );
  }

  if (existing.expiresAt < new Date()) {
    throw new AppError("TOKEN_EXPIRED", "Refresh token kedaluwarsa. Silakan login ulang.", 401);
  }

  const newPlainToken = randomTokenString();
  const newTokenHash = hashToken(newPlainToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const [created] = await prisma.$transaction([
    prisma.refreshToken.create({
      data: { userId: existing.userId, tokenHash: newTokenHash, expiresAt: newExpiresAt },
    }),
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
  ]);

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { replacedBy: created.id },
  });

  return { userId: existing.userId, newPlainToken };
}

export async function revokeRefreshToken(plainToken: string) {
  const tokenHash = hashToken(plainToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
