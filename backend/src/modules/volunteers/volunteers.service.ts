// Semua akses data relawan ada di sini. Controller tidak boleh menyentuh prisma
// langsung (aturan CLAUDE.md backend §3). Kolom geography wajib raw query.
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/errors.js";
import { recordAuditLog } from "../../shared/audit-log.service.js";
import type {
  ApplyInput,
  PatchVolunteerMeInput,
  CreateAvailabilityInput,
  NearbyQueryInput,
  RateInput,
  ReviewVolunteerInput,
} from "./volunteers.schema.js";

const NEARBY_LIMIT = 50;

const profileSelect = {
  verificationStatus: true,
  canCompanion: true,
  canMapData: true,
  ratingAvg: true,
  totalHelps: true,
  isActive: true,
} satisfies Prisma.VolunteerProfileSelect;

type ProfileRow = Prisma.VolunteerProfileGetPayload<{ select: typeof profileSelect }>;

const toProfileDto = (profile: ProfileRow) => ({ ...profile, ratingAvg: Number(profile.ratingAvg) });

export async function getProfile(userId: string) {
  const profile = await prisma.volunteerProfile.findUnique({ where: { userId }, select: profileSelect });
  if (!profile) {
    throw new AppError("NOT_FOUND", "Anda belum mengajukan diri sebagai relawan.", 404);
  }
  return toProfileDto(profile);
}

export async function apply(userId: string, input: ApplyInput) {
  try {
    // canCompanion/canMapData sengaja tidak diisi dari input: default skema = false.
    const profile = await prisma.volunteerProfile.create({
      data: {
        userId,
        motivation: input.motivation,
        idCardUrl: input.idCardUrl,
        serviceAreaNote: input.serviceAreaNote ?? null,
      },
      select: profileSelect,
    });
    return toProfileDto(profile);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("CONFLICT", "Anda sudah pernah mengajukan diri sebagai relawan.", 409);
    }
    throw err;
  }
}

export async function updateMe(userId: string, input: PatchVolunteerMeInput) {
  const { count } = await prisma.volunteerProfile.updateMany({
    where: { userId },
    data: { isActive: input.isActive },
  });
  if (count === 0) {
    throw new AppError("NOT_FOUND", "Anda belum mengajukan diri sebagai relawan.", 404);
  }
  return getProfile(userId);
}

const availabilityColumns = Prisma.sql`
  id,
  radius_meters AS "radiusMeters",
  day_of_week AS "dayOfWeek",
  to_char(start_time, 'HH24:MI') AS "startTime",
  to_char(end_time, 'HH24:MI') AS "endTime",
  is_active AS "isActive",
  ST_AsGeoJSON(center_point) AS geojson
`;

interface AvailabilityRow {
  id: string;
  radiusMeters: number;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
  geojson: string;
}

const toAvailabilityDto = ({ geojson, ...rest }: AvailabilityRow) => ({
  ...rest,
  centerPoint: JSON.parse(geojson),
});

export async function addAvailability(volunteerId: string, input: CreateAvailabilityInput) {
  const [lng, lat] = input.centerPoint.coordinates;
  const [row] = await prisma.$queryRaw<AvailabilityRow[]>`
    INSERT INTO volunteer_availability (
      id, volunteer_id, center_point, radius_meters, day_of_week, start_time, end_time
    )
    VALUES (
      gen_random_uuid(),
      ${volunteerId}::uuid,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${input.radiusMeters},
      ${input.dayOfWeek ?? null},
      ${input.startTime ?? null}::time,
      ${input.endTime ?? null}::time
    )
    RETURNING ${availabilityColumns}
  `;
  return toAvailabilityDto(row!);
}

export async function listAvailability(volunteerId: string) {
  const rows = await prisma.$queryRaw<AvailabilityRow[]>`
    SELECT ${availabilityColumns}
    FROM volunteer_availability
    WHERE volunteer_id = ${volunteerId}::uuid
    ORDER BY created_at ASC
  `;
  return rows.map(toAvailabilityDto);
}

export async function removeAvailability(volunteerId: string, availabilityId: string) {
  const { count } = await prisma.volunteerAvailability.deleteMany({
    where: { id: availabilityId, volunteerId },
  });
  if (count === 0) {
    throw new AppError("NOT_FOUND", "Jadwal ketersediaan tidak ditemukan.", 404);
  }
}

export interface NearbyVolunteer {
  id: string;
  name: string;
  ratingAvg: number;
  totalHelps: number;
  distanceM: number;
}

export async function findNearby({ lng, lat, radiusM }: NearbyQueryInput): Promise<NearbyVolunteer[]> {
  return prisma.$queryRaw<NearbyVolunteer[]>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS point
    )
    SELECT
      u.id,
      u.name,
      vp.rating_avg::float8 AS "ratingAvg",
      vp.total_helps AS "totalHelps",
      ROUND(MIN(va.center_point <-> o.point)) AS "distanceM"
    FROM volunteer_availability va
    CROSS JOIN origin o
    JOIN volunteer_profiles vp ON vp.user_id = va.volunteer_id
    JOIN users u ON u.id = va.volunteer_id
    WHERE va.is_active
      AND vp.is_active
      AND vp.verification_status = 'verified'
      AND ST_DWithin(va.center_point, o.point, LEAST(va.radius_meters, ${radiusM}::float8))
    GROUP BY u.id, u.name, vp.rating_avg, vp.total_helps
    ORDER BY "distanceM" ASC
    LIMIT ${NEARBY_LIMIT}
  `;
}

const ALREADY_RATED = "Anda sudah memberi rating untuk pendampingan ini.";

export async function rateVolunteer(requesterId: string, volunteerId: string, input: RateInput) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const request = await tx.companionRequest.findFirst({
      where: { id: input.requestId, requesterId, selectedVolunteerId: volunteerId },
      select: { status: true, requesterRating: true },
    });
    if (!request) {
      throw new AppError("NOT_FOUND", "Pendampingan tidak ditemukan.", 404);
    }
    if (request.status !== "completed") {
      throw new AppError("CONFLICT", "Pendampingan belum selesai, belum bisa diberi rating.", 409);
    }
    if (request.requesterRating !== null) {
      throw new AppError("CONFLICT", ALREADY_RATED, 409);
    }

    // Guard atomik: dua request bersamaan lolos cek di atas, tapi hanya satu yang
    // berhasil mengubah baris dengan requesterRating masih NULL.
    const { count } = await tx.companionRequest.updateMany({
      where: { id: input.requestId, requesterRating: null },
      data: { requesterRating: input.rating },
    });
    if (count === 0) {
      throw new AppError("CONFLICT", ALREADY_RATED, 409);
    }

    // totalHelps sudah termasuk pendampingan ini (dinaikkan saat completed).
    await tx.$executeRaw`
      UPDATE volunteer_profiles
      SET rating_avg = ROUND(
        (rating_avg * GREATEST(total_helps - 1, 0) + ${input.rating}::numeric) / GREATEST(total_helps, 1),
        2
      )
      WHERE user_id = ${volunteerId}::uuid
    `;

    const { ratingAvg } = await tx.volunteerProfile.findUniqueOrThrow({
      where: { userId: volunteerId },
      select: { ratingAvg: true },
    });
    return { ratingAvg: Number(ratingAvg) };
  });
}

export async function reviewVolunteer(adminId: string, volunteerId: string, input: ReviewVolunteerInput) {
  const verified = input.verificationStatus === "verified";
  const canCompanion = verified && input.canCompanion;
  const canMapData = verified && input.canMapData;

  const { count } = await prisma.volunteerProfile.updateMany({
    where: { userId: volunteerId },
    data: {
      verificationStatus: input.verificationStatus,
      canCompanion,
      canMapData,
      verifiedAt: verified ? new Date() : null,
    },
  });
  if (count === 0) {
    throw new AppError("NOT_FOUND", "Relawan tidak ditemukan.", 404);
  }

  await recordAuditLog({
    actorId: adminId,
    action: "volunteer.review",
    targetUserId: volunteerId,
    resourceType: "volunteer_profile",
    resourceId: volunteerId,
    metadata: { verificationStatus: input.verificationStatus, canCompanion, canMapData },
  });

  return getProfile(volunteerId);
}
