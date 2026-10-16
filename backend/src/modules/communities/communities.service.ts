import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { notify } from "../../shared/notify.js";
import { recordAuditLog } from "../../shared/audit-log.service.js";
import { findNearbyReports } from "../reports/reports.service.js";
import type {
  CommunitiesQueryInput,
  CreateCommunityInput,
  CreateEventInput,
  CreatePostInput,
  FlagPostInput,
  ModerationInput,
  PostPageQueryInput,
} from "./communities.schema.js";

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

const unsafePhonePattern = /(?:\+62|62|0)8[0-9\s-]{7,}/i;
const unsafeUrlPattern = /\b(?:https?:\/\/|www\.)\S+/i;

function containsUnsafeContact(value: string): boolean {
  return unsafePhonePattern.test(value) || unsafeUrlPattern.test(value);
}

function assertPostContentSafe(input: CreatePostInput): void {
  const content = [input.title, input.body].filter(Boolean).join(" ");
  if (containsUnsafeContact(content)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Demi keamanan, jangan bagikan nomor telepon atau tautan di diskusi.",
      400,
    );
  }
}

async function assertCommunityMember(userId: string, communityId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { role: true },
  });
  if (!membership) {
    throw new AppError("FORBIDDEN", "Anda harus mengikuti komunitas ini terlebih dahulu.", 403);
  }
  return membership;
}

export async function listPosts(
  userId: string,
  communityId: string,
  query: PostPageQueryInput,
) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { id: true },
  });
  if (!community) throw new AppError("NOT_FOUND", "Komunitas tidak ditemukan.", 404);

  const where = { communityId, status: "visible" as const };
  const [total, rows] = await prisma.$transaction([
    prisma.communityPost.count({ where }),
    prisma.communityPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      select: {
        id: true,
        title: true,
        body: true,
        authorId: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    }),
  ]);

  return {
    data: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      author: row.author,
      createdAt: row.createdAt,
      isMine: row.authorId === userId,
    })),
    meta: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    },
  };
}

export async function createPost(
  userId: string,
  communityId: string,
  input: CreatePostInput,
) {
  assertPostContentSafe(input);
  await assertCommunityMember(userId, communityId);

  return prisma.communityPost.create({
    data: {
      communityId,
      authorId: userId,
      title: input.title ?? null,
      body: input.body,
    },
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });
}

export async function deletePost(userId: string, postId: string) {
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });
  if (!post) throw new AppError("NOT_FOUND", "Kiriman tidak ditemukan.", 404);
  if (post.authorId !== userId) {
    throw new AppError("FORBIDDEN", "Hanya penulis yang dapat menghapus kiriman ini.", 403);
  }

  await prisma.communityPost.delete({ where: { id: postId } });
  return { deleted: true, id: postId };
}

export async function flagPost(userId: string, postId: string, input: FlagPostInput) {
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) throw new AppError("NOT_FOUND", "Kiriman tidak ditemukan.", 404);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityPostFlag.create({
        data: { postId, reporterId: userId, reason: input.reason },
      });
      const flagCount = await tx.communityPostFlag.count({ where: { postId } });
      await tx.communityPost.update({
        where: { id: postId },
        data: {
          flagCount,
          ...(flagCount >= 3
            ? { status: "hidden", hiddenReason: "auto_flag" }
            : {}),
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "Anda sudah melaporkan kiriman ini.", 409);
    }
    throw error;
  }

  const updated = await prisma.communityPost.findUniqueOrThrow({
    where: { id: postId },
    select: { id: true, flagCount: true, status: true },
  });
  return updated;
}

async function assertModeratorOrAdmin(
  userId: string,
  userRole: string,
  communityId: string,
) {
  if (userRole === "admin") return;
  const membership = await assertCommunityMember(userId, communityId);
  if (membership.role !== "moderator") {
    throw new AppError("FORBIDDEN", "Anda bukan moderator komunitas ini.", 403);
  }
}

export async function moderatePost(
  userId: string,
  userRole: string,
  postId: string,
  input: ModerationInput,
) {
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { communityId: true },
  });
  if (!post) throw new AppError("NOT_FOUND", "Kiriman tidak ditemukan.", 404);

  await assertModeratorOrAdmin(userId, userRole, post.communityId);
  const updated = await prisma.communityPost.update({
    where: { id: postId },
    data: {
      status: input.status,
      hiddenById: input.status === "hidden" ? userId : null,
      hiddenReason: input.reason,
    },
    select: { id: true, status: true, hiddenReason: true },
  });

  await recordAuditLog({
    actorId: userId,
    action: "community.post_moderation",
    resourceType: "community_post",
    resourceId: postId,
    metadata: { status: input.status, reason: input.reason },
  });

  return updated;
}

async function communityMemberIds(communityId: string): Promise<string[]> {
  const members = await prisma.communityMember.findMany({
    where: { communityId },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

async function assertEventCreatorPermission(
  userId: string,
  userRole: string,
  communityId: string,
) {
  if (userRole === "admin") return;

  const membership = await assertCommunityMember(userId, communityId);
  if (membership.role === "moderator") return;

  const volunteer = await prisma.volunteerProfile.findUnique({
    where: { userId },
    select: { verificationStatus: true },
  });
  if (userRole !== "volunteer" || volunteer?.verificationStatus !== "verified") {
    throw new AppError("FORBIDDEN", "Anda tidak berhak membuat agenda komunitas.", 403);
  }
}

export async function listEvents(communityId: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      communityId: string;
      title: string;
      description: string | null;
      startsAt: Date;
      locationNote: string | null;
      locationGeojson: string | null;
      createdById: string;
      cancelledAt: Date | null;
    }>
  >`
    SELECT
      id,
      community_id AS "communityId",
      title,
      description,
      starts_at AS "startsAt",
      location_note AS "locationNote",
      ST_AsGeoJSON(location) AS "locationGeojson",
      created_by AS "createdById",
      cancelled_at AS "cancelledAt"
    FROM community_events
    WHERE community_id = ${communityId}::uuid
      AND starts_at >= now()
      AND cancelled_at IS NULL
    ORDER BY starts_at ASC
  `;

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { id: true },
  });
  if (!community) throw new AppError("NOT_FOUND", "Komunitas tidak ditemukan.", 404);

  return rows.map(({ locationGeojson, ...row }) => ({
    ...row,
    location: locationGeojson ? JSON.parse(locationGeojson) : null,
  }));
}

export async function createEvent(
  userId: string,
  userRole: string,
  communityId: string,
  input: CreateEventInput,
) {
  await assertEventCreatorPermission(userId, userRole, communityId);
  const [lng, lat] = input.location?.coordinates ?? [null, null];

  const [event] = await prisma.$queryRaw<
    Array<{
      id: string;
      communityId: string;
      title: string;
      description: string | null;
      startsAt: Date;
      locationNote: string | null;
      locationGeojson: string | null;
    }>
  >`
    INSERT INTO community_events (
      id, community_id, title, description, starts_at, location_note, location, created_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      ${communityId}::uuid,
      ${input.title},
      ${input.description ?? null},
      ${input.startsAt},
      ${input.locationNote ?? null},
      CASE
        WHEN ${lng}::float8 IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      END,
      ${userId}::uuid,
      now()
    )
    RETURNING
      id,
      community_id AS "communityId",
      title,
      description,
      starts_at AS "startsAt",
      location_note AS "locationNote",
      ST_AsGeoJSON(location) AS "locationGeojson"
  `;

  if (!event) throw new AppError("INTERNAL_ERROR", "Gagal membuat agenda komunitas.", 500);

  const memberIds = await communityMemberIds(communityId);
  await notify(memberIds, {
    type: "community",
    event: "community:event",
    title: "Agenda komunitas baru",
    body: event.title,
    payload: {
      communityId,
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
    },
  });

  return {
    id: event.id,
    communityId: event.communityId,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    locationNote: event.locationNote,
    location: event.locationGeojson ? JSON.parse(event.locationGeojson) : null,
  };
}

export async function cancelEvent(
  userId: string,
  userRole: string,
  communityId: string,
  eventId: string,
) {
  const event = await prisma.communityEvent.findUnique({
    where: { id: eventId },
    select: { communityId: true, createdById: true, title: true, startsAt: true },
  });
  if (!event || event.communityId !== communityId) {
    throw new AppError("NOT_FOUND", "Agenda komunitas tidak ditemukan.", 404);
  }

  if (userRole !== "admin" && event.createdById !== userId) {
    const membership = await assertCommunityMember(userId, communityId);
    if (membership.role !== "moderator") {
      throw new AppError("FORBIDDEN", "Anda tidak berhak membatalkan agenda ini.", 403);
    }
  }

  const cancelledAt = new Date();
  await prisma.communityEvent.update({
    where: { id: eventId },
    data: { cancelledAt },
  });

  await notify(await communityMemberIds(communityId), {
    type: "community",
    event: "community:event",
    title: "Agenda komunitas dibatalkan",
    body: event.title,
    payload: {
      communityId,
      eventId,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      cancelledAt: cancelledAt.toISOString(),
    },
  });

  return { id: eventId, cancelled: true, cancelledAt };
}
