// Unit test MURNI (vitest, prisma di-mock) untuk getUserAccessibility.
// Memverifikasi Task 11 §3: bentuk FLAT { profileId, label, isPrimary,
// toleranceOverrides } — konsisten dengan GET /users/me, tidak lagi nested
// profile.label. Konsumen internal (routes.service) hanya baca
// profileId/isPrimary/toleranceOverrides, jadi flattening aman.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserAccessibility } from "./accessibility-profiles.service.js";
import { prisma } from "../../config/prisma.js";

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    userAccessibilityProfile: {
      findMany: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserAccessibility", () => {
  it("mengembalikan bentuk flat label (bukan nested profile.label)", async () => {
    vi.mocked(prisma.userAccessibilityProfile.findMany).mockResolvedValue([
      {
        profileId: "wheelchair",
        isPrimary: true,
        toleranceOverrides: { max_steps: 3 },
        profile: { label: "Pengguna kursi roda" },
      },
    ] as never);

    const result = await getUserAccessibility("user-1");

    expect(result).toEqual([
      {
        profileId: "wheelchair",
        label: "Pengguna kursi roda",
        isPrimary: true,
        toleranceOverrides: { max_steps: 3 },
      },
    ]);
    expect((result[0] as Record<string, unknown>).profile).toBeUndefined();
  });

  it("mempertahankan field yang dipakai routes.service (profileId, isPrimary, toleranceOverrides)", async () => {
    vi.mocked(prisma.userAccessibilityProfile.findMany).mockResolvedValue([
      {
        profileId: "blind",
        isPrimary: false,
        toleranceOverrides: null,
        profile: { label: "Tunanetra" },
      },
    ] as never);

    const [row] = await getUserAccessibility("user-1");
    expect(row?.profileId).toBe("blind");
    expect(row?.isPrimary).toBe(false);
    expect(row?.toleranceOverrides).toBeNull();
  });
});
