import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateOtp, hashOtp, verifyOtp } from "../otp.js";
import { prisma } from "../../../config/prisma.js";
import { AppError } from "../../../shared/errors.js";

vi.mock("../../../config/prisma.js", () => ({
  prisma: {
    otpVerification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const userId = "user-1";
const phone = "081234567890";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOtp", () => {
  it("menghasilkan 6 digit angka", () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("menghasilkan nilai berbeda antar pemanggilan (acak)", () => {
    const results = new Set(Array.from({ length: 20 }, () => generateOtp()));
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("hashOtp", () => {
  it("hash konsisten untuk input yang sama", () => {
    expect(hashOtp("123456")).toBe(hashOtp("123456"));
  });

  it("hash berbeda untuk input berbeda", () => {
    expect(hashOtp("123456")).not.toBe(hashOtp("654321"));
  });

  it("tidak mengembalikan OTP plaintext-nya sendiri", () => {
    expect(hashOtp("123456")).not.toBe("123456");
  });
});

describe("verifyOtp", () => {
  it("menolak kalau tidak ada OTP aktif untuk user tsb", async () => {
    vi.mocked(prisma.otpVerification.findFirst).mockResolvedValue(null);

    await expect(verifyOtp(userId, phone, "111111")).rejects.toThrow(AppError);
    await expect(verifyOtp(userId, phone, "111111")).rejects.toThrow(
      "Tidak ada permintaan OTP aktif",
    );
  });

  it("menolak kalau OTP sudah kedaluwarsa (TTL terlampaui)", async () => {
    vi.mocked(prisma.otpVerification.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: hashOtp("111111"),
      expiresAt: new Date(Date.now() - 1000),
      consumedAt: null,
    } as never);

    await expect(verifyOtp(userId, phone, "111111")).rejects.toThrow("kedaluwarsa");
  });

  it("menolak kalau kode salah dan mencatat attempts", async () => {
    vi.mocked(prisma.otpVerification.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: hashOtp("111111"),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } as never);

    await expect(verifyOtp(userId, phone, "999999")).rejects.toThrow("Kode OTP salah.");
    expect(prisma.otpVerification.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { attempts: { increment: 1 } },
    });
  });

  it("berhasil dan menandai consumedAt kalau kode benar & belum expired", async () => {
    vi.mocked(prisma.otpVerification.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: hashOtp("111111"),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } as never);

    await verifyOtp(userId, phone, "111111");

    expect(prisma.otpVerification.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("sekali pakai: query hanya mencari baris yang consumedAt masih null", async () => {
    vi.mocked(prisma.otpVerification.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: hashOtp("111111"),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    } as never);

    await verifyOtp(userId, phone, "111111");

    expect(prisma.otpVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, phoneNumber: phone, consumedAt: null },
      }),
    );
  });
});
