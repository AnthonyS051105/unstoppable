// CRUD murni. TIDAK ADA logic bobot routing di sini — itu wilayah Nafal
// (route-service / weight-builder.ts). Service ini hanya membaca & menyimpan
// pilihan profil + toleranceOverrides milik user.
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import type { PutAccessibilityInput } from "./accessibility-profiles.schema.js";

// weightConfig SENGAJA tidak di-select — detail internal Route Service,
// tidak boleh dikirim ke frontend (docs/API_CONTRACT.md §4).
const PUBLIC_PROFILE_SELECT = {
  id: true,
  label: true,
  primaryChannel: true,
  displayOrder: true,
} as const;

export function listProfiles() {
  return prisma.accessibilityProfile.findMany({
    select: PUBLIC_PROFILE_SELECT,
    orderBy: { displayOrder: "asc" },
  });
}

export function getUserAccessibility(userId: string) {
  return prisma.userAccessibilityProfile.findMany({
    where: { userId },
    select: {
      profileId: true,
      isPrimary: true,
      toleranceOverrides: true,
      profile: { select: { label: true } },
    },
  });
}

export async function replaceUserAccessibility(userId: string, input: PutAccessibilityInput) {
  await assertProfileIdsExist(input.profiles.map((p) => p.profileId));
  assertAtMostOnePrimary(input.profiles);

  // Ganti seluruh set profil user dalam satu transaksi: kalau salah satu
  // langkah gagal, tidak ada perubahan sebagian yang tersimpan.
  await prisma.$transaction([
    prisma.userAccessibilityProfile.deleteMany({ where: { userId } }),
    prisma.userAccessibilityProfile.createMany({
      data: input.profiles.map((p) => ({
        userId,
        profileId: p.profileId,
        isPrimary: p.isPrimary,
        toleranceOverrides: p.toleranceOverrides ?? undefined,
      })),
    }),
  ]);

  return getUserAccessibility(userId);
}

async function assertProfileIdsExist(profileIds: string[]) {
  const found = await prisma.accessibilityProfile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((f: { id: string }) => f.id));
  const unknown = profileIds.filter((id) => !foundIds.has(id));

  if (unknown.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Ada profil aksesibilitas yang tidak dikenal.",
      400,
      { unknownProfileIds: unknown },
    );
  }
}

function assertAtMostOnePrimary(profiles: PutAccessibilityInput["profiles"]) {
  const primaryCount = profiles.filter((p) => p.isPrimary).length;
  if (primaryCount > 1) {
    throw new AppError("VALIDATION_ERROR", "Hanya boleh ada satu profil primer.", 400, {
      primaryCount,
    });
  }
}
