// Semua akses Prisma untuk profil user & relasi caregiver ada di sini.
// Controller tidak boleh menyentuh prisma langsung (aturan CLAUDE.md backend §3).
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/errors.js";
import { maskPhoneNumber } from "../../shared/phone.js";
import type { PatchMeInput, AddCaregiverInput } from "./users.schema.js";

const meInclude = {
  blindProfile: true,
  volunteerProfile: true,
  accessibilityProfiles: {
    select: {
      profileId: true,
      isPrimary: true,
      toleranceOverrides: true,
      profile: { select: { label: true } },
    },
  },
} satisfies Prisma.UserInclude;

type MeRow = Prisma.UserGetPayload<{ include: typeof meInclude }>;

export async function getMe(userId: string) {
  const user: MeRow = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: meInclude,
  });

  return {
    id: user.id,
    name: user.name,
    phoneNumber: maskPhoneNumber(user.phoneNumber),
    role: user.role,
    profilePhotoUrl: user.profilePhotoUrl,
    accessibilityProfiles: user.accessibilityProfiles.map((p) => ({
      profileId: p.profileId,
      label: p.profile.label,
      isPrimary: p.isPrimary,
      toleranceOverrides: p.toleranceOverrides,
    })),
    volunteerProfile: user.volunteerProfile
      ? {
          verificationStatus: user.volunteerProfile.verificationStatus,
          canCompanion: user.volunteerProfile.canCompanion,
          canMapData: user.volunteerProfile.canMapData,
          ratingAvg: Number(user.volunteerProfile.ratingAvg),
          totalHelps: user.volunteerProfile.totalHelps,
          isActive: user.volunteerProfile.isActive,
        }
      : null,
    blindProfile: user.blindProfile
      ? {
          ttsSpeedPercent: user.blindProfile.ttsSpeedPercent,
          ttsVoiceLang: user.blindProfile.ttsVoiceLang,
          emergencyContactName: user.blindProfile.emergencyContactName,
          // Nomor darurat ikut di-mask seperti phoneNumber (API_CONTRACT §3).
          // Null-safe: jangan panggil maskPhoneNumber pada null.
          emergencyContactPhone: user.blindProfile.emergencyContactPhone
            ? maskPhoneNumber(user.blindProfile.emergencyContactPhone)
            : null,
          onboardingCompleted: user.blindProfile.onboardingCompleted,
          motionCalibrationData: user.blindProfile.motionCalibrationData,
        }
      : null,
  };
}

export async function updateMe(userId: string, input: PatchMeInput) {
  const { blindProfile, ...userFields } = input;

  // Zod menandai field opsional sebagai `T | undefined` (exactOptionalPropertyTypes
  // membedakan itu dari key yang tidak ada sama sekali). Runtime-nya aman — Zod
  // tidak pernah menyertakan key yang tidak dikirim user — jadi di sini cukup
  // di-assert ke tipe input Prisma, bukan direstrukturisasi ulang.
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (Object.keys(userFields).length > 0) {
      await tx.user.update({ where: { id: userId }, data: userFields as Prisma.UserUpdateInput });
    }
    if (blindProfile) {
      await tx.blindUserProfile.upsert({
        where: { userId },
        create: { userId, ...blindProfile } as Prisma.BlindUserProfileUncheckedCreateInput,
        update: blindProfile as Prisma.BlindUserProfileUpdateInput,
      });
    }
  });

  return getMe(userId);
}

const caregiverRelationshipSelect = {
  id: true,
  relationshipType: true,
  locationSharingMode: true,
  createdAt: true,
  caregiver: { select: { id: true, name: true, phoneNumber: true } },
} satisfies Prisma.CaregiverRelationshipSelect;

type CaregiverRelationshipRow = Prisma.CaregiverRelationshipGetPayload<{
  select: typeof caregiverRelationshipSelect;
}>;

function toCaregiverDto(rel: CaregiverRelationshipRow) {
  return {
    id: rel.id,
    relationshipType: rel.relationshipType,
    locationSharingMode: rel.locationSharingMode,
    createdAt: rel.createdAt,
    caregiver: {
      id: rel.caregiver.id,
      name: rel.caregiver.name,
      phoneNumber: maskPhoneNumber(rel.caregiver.phoneNumber),
    },
  };
}

export async function addCaregiver(blindUserId: string, input: AddCaregiverInput) {
  const caregiver = await prisma.user.findUnique({ where: { phoneNumber: input.caregiverPhone } });
  if (!caregiver) {
    throw new AppError("VALIDATION_ERROR", "Nomor telepon caregiver tidak ditemukan.", 400);
  }
  if (caregiver.role !== "caregiver") {
    throw new AppError("VALIDATION_ERROR", "Nomor telepon tersebut bukan akun caregiver.", 400);
  }
  if (caregiver.id === blindUserId) {
    throw new AppError("VALIDATION_ERROR", "Tidak bisa menautkan diri sendiri sebagai caregiver.", 400);
  }

  try {
    const rel = await prisma.caregiverRelationship.create({
      data: {
        blindUserId,
        caregiverId: caregiver.id,
        relationshipType: input.relationshipType,
        locationSharingMode: input.locationSharingMode,
      },
      select: caregiverRelationshipSelect,
    });
    return toCaregiverDto(rel);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("CONFLICT", "Caregiver ini sudah ditautkan sebelumnya.", 409);
    }
    throw err;
  }
}

export async function listCaregivers(blindUserId: string) {
  const rels = await prisma.caregiverRelationship.findMany({
    where: { blindUserId },
    select: caregiverRelationshipSelect,
    orderBy: { createdAt: "asc" },
  });
  return rels.map(toCaregiverDto);
}

export async function removeCaregiver(blindUserId: string, relationshipId: string) {
  const rel = await prisma.caregiverRelationship.findUnique({ where: { id: relationshipId } });
  if (!rel || rel.blindUserId !== blindUserId) {
    throw new AppError("NOT_FOUND", "Relasi caregiver tidak ditemukan.", 404);
  }
  await prisma.caregiverRelationship.delete({ where: { id: relationshipId } });
}

const dependentSelect = {
  relationshipType: true,
  locationSharingMode: true,
  blindUser: {
    select: {
      id: true,
      name: true,
      travelSessions: {
        where: { status: "active" },
        select: { id: true, status: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.CaregiverRelationshipSelect;

type DependentRow = Prisma.CaregiverRelationshipGetPayload<{ select: typeof dependentSelect }>;

export async function listDependents(caregiverId: string) {
  const rels = await prisma.caregiverRelationship.findMany({
    where: { caregiverId },
    select: dependentSelect,
  });

  return rels.map((rel: DependentRow) => ({
    userId: rel.blindUser.id,
    name: rel.blindUser.name,
    relationshipType: rel.relationshipType,
    locationSharingMode: rel.locationSharingMode,
    activeSession: rel.blindUser.travelSessions[0] ?? null,
  }));
}

// Dipakai socket handler Nafal (bukan endpoint HTTP). `includeSosOnly: true`
// dipanggil saat SOS aktif untuk sesi ini — caregiver bermode 'sos_only' baru
// berhak melihat lokasi saat itu. Di luar SOS, hanya mode 'always' yang boleh.
export async function watchersOf(sessionId: string, opts: { includeSosOnly?: boolean } = {}) {
  const session = await prisma.travelSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  if (!session) return [];

  const modes = opts.includeSosOnly ? ["always", "sos_only"] : ["always"];

  return prisma.caregiverRelationship.findMany({
    where: { blindUserId: session.userId, locationSharingMode: { in: modes } },
    select: { caregiverId: true, locationSharingMode: true },
  });
}
