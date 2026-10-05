// Unit test MURNI (vitest, prisma di-mock) untuk users.service.getMe.
// Memverifikasi Task 11 §3:
//   - emergencyContactPhone di-mask saat ada, null tetap null (null-safe)
//   - accessibilityProfiles berbentuk FLAT { profileId, label, isPrimary,
//     toleranceOverrides } sesuai API_CONTRACT §3
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMe } from "./users.service.js";
import { prisma } from "../../config/prisma.js";

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Budi",
    phoneNumber: "081234567890",
    role: "blind_user",
    profilePhotoUrl: null,
    accessibilityProfiles: [
      {
        profileId: "wheelchair",
        isPrimary: true,
        toleranceOverrides: { max_steps: 0 },
        profile: { label: "Pengguna kursi roda" },
      },
    ],
    volunteerProfile: null,
    blindProfile: {
      ttsSpeedPercent: 100,
      ttsVoiceLang: "id-ID",
      emergencyContactName: "Siti",
      emergencyContactPhone: "089876543210",
      onboardingCompleted: true,
      motionCalibrationData: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMe", () => {
  it("mask emergencyContactPhone saat ada", async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(baseUser() as never);

    const me = await getMe("user-1");

    expect(me.blindProfile?.emergencyContactPhone).toBe("0898****3210");
    // phoneNumber utama tetap ter-mask seperti sebelumnya
    expect(me.phoneNumber).toBe("0812****7890");
  });

  it("emergencyContactPhone null tetap null (tidak memanggil mask pada null)", async () => {
    const user = baseUser({
      blindProfile: {
        ttsSpeedPercent: 100,
        ttsVoiceLang: "id-ID",
        emergencyContactName: null,
        emergencyContactPhone: null,
        onboardingCompleted: false,
        motionCalibrationData: null,
      },
    });
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(user as never);

    const me = await getMe("user-1");
    expect(me.blindProfile?.emergencyContactPhone).toBeNull();
  });

  it("accessibilityProfiles berbentuk flat { profileId, label, isPrimary, toleranceOverrides }", async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(baseUser() as never);

    const me = await getMe("user-1");
    expect(me.accessibilityProfiles).toEqual([
      {
        profileId: "wheelchair",
        label: "Pengguna kursi roda",
        isPrimary: true,
        toleranceOverrides: { max_steps: 0 },
      },
    ]);
    // Pastikan TIDAK ada bentuk nested profile.label
    expect(
      (me.accessibilityProfiles[0] as Record<string, unknown>).profile,
    ).toBeUndefined();
  });
});
