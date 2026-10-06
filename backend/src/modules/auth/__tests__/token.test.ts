import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, verifyAccessToken, rotateRefreshToken } from "../token.js";
import { prisma } from "../../../config/prisma.js";
import { AppError } from "../../../shared/errors.js";

vi.mock("../../../config/prisma.js", () => ({
  prisma: {
    refreshToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
});

describe("access token", () => {
  it("sign lalu verify mengembalikan payload yang sama", () => {
    const token = signAccessToken({ sub: "user-1", role: "blind_user" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.role).toBe("blind_user");
  });

  it("token kedaluwarsa melempar AppError TOKEN_EXPIRED", () => {
    const expired = jwt.sign({ sub: "user-1", role: "blind_user" }, "test-secret", {
      algorithm: "HS256",
      expiresIn: "-1s",
    });

    expect(() => verifyAccessToken(expired)).toThrow(AppError);
    try {
      verifyAccessToken(expired);
      expect.unreachable("harus melempar error");
    } catch (err) {
      expect((err as AppError).code).toBe("TOKEN_EXPIRED");
    }
  });

  it("token dengan signature tidak valid ditolak sebagai UNAUTHENTICATED", () => {
    const tampered = jwt.sign({ sub: "user-1", role: "blind_user" }, "secret-yang-salah", {
      algorithm: "HS256",
      expiresIn: "15m",
    });

    try {
      verifyAccessToken(tampered);
      expect.unreachable("harus melempar error");
    } catch (err) {
      expect((err as AppError).code).toBe("UNAUTHENTICATED");
    }
  });
});

describe("rotateRefreshToken", () => {
  it("token tidak dikenal (tidak ada di DB) ditolak sebagai UNAUTHENTICATED", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null);

    try {
      await rotateRefreshToken("token-asing");
      expect.unreachable("harus melempar error");
    } catch (err) {
      expect((err as AppError).code).toBe("UNAUTHENTICATED");
    }
  });

  it("token yang sudah di-revoke sebelumnya (reuse) mencabut semua token user", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 10_000),
    } as never);

    await expect(rotateRefreshToken("stolen-token")).rejects.toThrow(AppError);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("token kedaluwarsa ditolak dengan kode TOKEN_EXPIRED", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    } as never);

    try {
      await rotateRefreshToken("expired-token");
      expect.unreachable("harus melempar error");
    } catch (err) {
      expect((err as AppError).code).toBe("TOKEN_EXPIRED");
    }
  });

  it("token valid dirotasi: baris lama direvoke, baris baru dibuat", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
    } as never);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({ id: "rt-2" } as never);

    const result = await rotateRefreshToken("valid-token");

    expect(result.userId).toBe("user-1");
    expect(typeof result.newPlainToken).toBe("string");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt-1" },
      data: { replacedBy: "rt-2" },
    });
  });
});
