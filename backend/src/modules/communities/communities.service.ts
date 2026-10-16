import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { recordAuditLog } from "../../shared/audit-log.service.js";
import { findNearbyReports } from "../reports/reports.service.js";
import type { CommunitiesQueryInput, CreateCommunityInput } from "./communities.schema.js";

interface CommunityListRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  memberCount: number;
  joined: boolean;
  distanceM: number;
}

export async function listCommunities(userId: string, query: CommunitiesQueryInput) {
  const rows = await prisma.$queryRaw<CommunityListRow[]>`
    SELECT
      c.id,
      c.slug,
      c.name,
      c.description,
      c.icon,
      COUNT(cm.user_id)::int AS "memberCount",
      EXISTS (
        SELECT 1
        FROM community_members mine
        WHERE mine.community_id = c.id
          AND mine.user_id = ${userId}::uuid
      ) AS joined,
      ROUND(ST_Distance(
        c.center_point,
        ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography
      ))::int AS "distanceM"
    FROM communities c
    LEFT JOIN community_members cm ON cm.community_id = c.id
    GROUP BY c.id
    ORDER BY "distanceM" ASC, c.name ASC
  `;

  return rows;
}

export async function getCommunity(userId: string, communityId: string) {
  const [row] = await prisma.$queryRaw<
    Array<{
      id: string;
      slug: string;
      name: string;
      description: string;
      icon: string;
      memberCount: number;
      myRole: string | null;
    }>
  >`
    SELECT
      c.id,
      c.slug,
      c.name,
      c.description,
      c.icon,
      COUNT(cm.user_id)::int AS "memberCount",
      (
        SELECT mine.role
        FROM community_members mine
        WHERE mine.community_id = c.id
          AND mine.user_id = ${userId}::uuid
      ) AS "myRole"
    FROM communities c
    LEFT JOIN community_members cm ON cm.community_id = c.id
    WHERE c.id = ${communityId}::uuid
    GROUP BY c.id
  `;

  if (!row) {
    throw new AppError("NOT_FOUND", "Komunitas tidak ditemukan.", 404);
  }

  return row;
}

export async function joinCommunity(userId: string, communityId: string) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { id: true },
  });
  if (!community) {
    throw new AppError("NOT_FOUND", "Komunitas tidak ditemukan.", 404);
  }

  await prisma.$executeRaw`
    INSERT INTO community_members (community_id, user_id, role, joined_at)
    VALUES (${communityId}::uuid, ${userId}::uuid, 'member', now())
    ON CONFLICT (community_id, user_id) DO NOTHING
  `;

  return { communityId, joined: true };
}

export async function leaveCommunity(userId: string, communityId: string) {
  const affected = await prisma.$executeRaw`
    DELETE FROM community_members
    WHERE community_id = ${communityId}::uuid
      AND user_id = ${userId}::uuid
  `;

  if (affected === 0) {
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      select: { id: true },
    });
    if (!community) {
      throw new AppError("NOT_FOUND", "Komunitas tidak ditemukan.", 404);
    }
  }

  return { communityId, left: affected > 0 };
}

export async function listCommunityReports(communityId: string) {
  const [community] = await prisma.$queryRaw<
    Array<{ lng: number; lat: number; radiusM: number }>
  >`
    SELECT
      ST_X(center_point::geometry) AS lng,
      ST_Y(center_point::geometry) AS lat,
      radius_meters AS "radiusM"
    FROM communities
    WHERE id = ${communityId}::uuid
  `;

  if (!community) {
    throw new AppError("NOT_FOUND", "Komunitas tidak ditemukan.", 404);
  }

  return findNearbyReports({
    lng: community.lng,
    lat: community.lat,
    radiusM: community.radiusM,
    status: "active",
  });
}

export async function createCommunity(
  adminId: string,
  input: CreateCommunityInput,
) {
  const [lng, lat] = input.centerPoint.coordinates;
  const [community] = await prisma.$queryRaw<
    Array<{ id: string; slug: string; name: string; description: string; icon: string; radiusMeters: number }>
  >`
    INSERT INTO communities (
      id, slug, name, description, icon, center_point, radius_meters, created_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      ${input.slug},
      ${input.name},
      ${input.description},
      ${input.icon},
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${input.radiusMeters},
      ${adminId}::uuid,
      now()
    )
    RETURNING
      id,
      slug,
      name,
      description,
      icon,
      radius_meters AS "radiusMeters"
  `;

  if (!community) {
    throw new AppError("INTERNAL_ERROR", "Gagal membuat komunitas.", 500);
  }

  await recordAuditLog({
    actorId: adminId,
    action: "community.create",
    resourceType: "community",
    resourceId: community.id,
    metadata: { slug: community.slug },
  });

  return community;
}
