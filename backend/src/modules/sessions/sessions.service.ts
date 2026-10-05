import { prisma } from "../../config/prisma.js";
import { recordAuditLog } from "../../shared/audit-log.service.js";

export interface StartSessionParams {
  userId: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  destinationName?: string;
  edgeIds?: Array<number | bigint | string>;
  profileId?: string;
  estimatedArrival?: string | Date;
}

export interface LocationPingParams {
  sessionId: string;
  lat: number;
  lng: number;
  accuracyM?: number | undefined;
}

export interface StaleSessionCandidate {
  id: string;
  userId: string;
  lastPingAt: Date | null;
  startedAt: Date;
  originLng: number;
  originLat: number;
  lastPingLng: number | null;
  lastPingLat: number | null;
}

// BE-F-06-6 -- kandidat dead man's switch untuk jobs/check-stale-sessions.job.ts.
// Pakai index [status, last_ping_at] yang sudah ada di skema (komentar
// schema.prisma: "dipakai dead man's switch"). Diamnya dihitung dari
// COALESCE(last_ping_at, started_at) -- sesi yang baru mulai dan belum pernah
// ping sekalipun tetap dianggap "diam sejak mulai", bukan diabaikan selamanya.
export async function findStaleSessions(thresholdMinutes: number): Promise<StaleSessionCandidate[]> {
  return prisma.$queryRaw<StaleSessionCandidate[]>`
    SELECT
      ts.id, ts.user_id AS "userId", ts.last_ping_at AS "lastPingAt", ts.started_at AS "startedAt",
      ST_X(ts.origin::geometry) AS "originLng", ST_Y(ts.origin::geometry) AS "originLat",
      ST_X(lp.location::geometry) AS "lastPingLng", ST_Y(lp.location::geometry) AS "lastPingLat"
    FROM travel_sessions ts
    LEFT JOIN LATERAL (
      SELECT location FROM location_pings WHERE session_id = ts.id ORDER BY recorded_at DESC LIMIT 1
    ) lp ON TRUE
    WHERE ts.status = 'active'
      AND COALESCE(ts.last_ping_at, ts.started_at) < now() - (${thresholdMinutes} || ' minutes')::interval
  `;
}

// §15.3 report:nearby -- user yang sedang dalam perjalanan (sesi aktif) dekat
// sebuah titik (lokasi laporan baru). "Dekat" dihitung terhadap posisi terakhir
// user: location ping terbaru kalau ada, jatuh ke origin sesi kalau belum
// pernah ping (pola COALESCE sama dengan findStaleSessions). Reporter sendiri
// dikecualikan supaya tidak menerima notifikasi laporannya sendiri. DISTINCT
// user_id: satu user bisa saja punya >1 sesi aktif (edge case), tetap sekali
// kirim.
export async function findActiveSessionUsersNear(
  lng: number,
  lat: number,
  radiusM: number,
  excludeUserId: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT ts.user_id AS "userId"
    FROM travel_sessions ts
    LEFT JOIN LATERAL (
      SELECT location FROM location_pings WHERE session_id = ts.id ORDER BY recorded_at DESC LIMIT 1
    ) lp ON TRUE
    WHERE ts.status = 'active'
      AND ts.user_id <> ${excludeUserId}::uuid
      AND ST_DWithin(
        COALESCE(lp.location, ts.origin),
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusM}::float8
      )
  `;
  return rows.map((r: { userId: string }) => r.userId);
}

export async function isOwnedBy(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const session = await prisma.travelSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  return session?.userId === userId;
}

// Dipakai realtime/session.handlers.ts (session:join) untuk tahu siapa
// pemilik sesi tanpa menarik seluruh baris -- supaya assertCanViewLocation()
// bisa dipanggil untuk caregiver yang bukan pemilik sesi itu sendiri.
export async function getSessionOwnerId(sessionId: string): Promise<string | null> {
  const session = await prisma.travelSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  return session?.userId ?? null;
}

export async function startSession(params: StartSessionParams) {
  const edgeIds = (params.edgeIds ?? []).map((id) => BigInt(id));

  const [session] = await prisma.$queryRaw<
    {
      id: string;
      userId: string;
      destinationName: string | null;
      profileId: string | null;
      status: string;
      startedAt: Date;
      estimatedArrival: Date | null;
    }[]
  >`
    INSERT INTO travel_sessions (
      id, user_id, origin, destination, destination_name, edge_ids, profile_id, estimated_arrival, status, started_at
    )
    VALUES (
      gen_random_uuid(),
      ${params.userId}::uuid,
      ST_SetSRID(ST_MakePoint(${params.origin.lng}, ${params.origin.lat}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${params.destination.lng}, ${params.destination.lat}), 4326)::geography,
      ${params.destinationName ?? null},
      ${edgeIds}::bigint[],
      ${params.profileId ?? null},
      ${params.estimatedArrival ? new Date(params.estimatedArrival) : null},
      'active',
      now()
    )
    RETURNING 
      id, 
      user_id AS "userId", 
      destination_name AS "destinationName",
      profile_id AS "profileId",
      status, 
      started_at AS "startedAt", 
      estimated_arrival AS "estimatedArrival"
  `;

  return session!;
}

export async function recordLocationPing(params: LocationPingParams) {
  const [ping] = await prisma.$queryRaw<
    { id: string; sessionId: string; recordedAt: Date }[]
  >`
    INSERT INTO location_pings (session_id, location, accuracy_m, recorded_at)
    VALUES (
      ${params.sessionId}::uuid,
      ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
      ${params.accuracyM ?? null},
      now()
    )
    RETURNING id::text, session_id AS "sessionId", recorded_at AS "recordedAt"
  `;

  await prisma.$executeRaw`
    UPDATE travel_sessions
    SET last_ping_at = now()
    WHERE id = ${params.sessionId}::uuid
  `;

  return ping!;
}

// §15.2 session:heartbeat -- menandakan pengguna masih aktif tanpa mengirim
// lokasi. Hanya memperbarui last_ping_at (dead man's switch membaca
// COALESCE(last_ping_at, started_at), lihat findStaleSessions). Dibatasi ke
// sesi aktif milik user pengirim: kepemilikan+status dicek di query itu sendiri
// (WHERE user_id = ... AND status = 'active'), jadi heartbeat dari user lain
// atau untuk sesi yang sudah berakhir tidak berpengaruh. Mengembalikan true
// kalau ada baris yang diperbarui.
export async function recordHeartbeat(sessionId: string, userId: string): Promise<boolean> {
  const affected = await prisma.$executeRaw`
    UPDATE travel_sessions
    SET last_ping_at = now()
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid AND status = 'active'
  `;
  return affected > 0;
}

export async function endSession(
  sessionId: string,
  userId: string,
  status: "completed" | "cancelled" = "completed",
  destinationName?: string,
) {
  const affected = await prisma.$executeRaw`
    UPDATE travel_sessions
    SET status = ${status}, ended_at = now()
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid AND status = 'active'
  `;

  if (affected === 0) {
    return null;
  }

  if (status === "completed") {
    await prisma.$executeRaw`
      INSERT INTO user_place_preferences (id, user_id, place_name, place_location, visit_count, last_visited_at)
      SELECT 
        gen_random_uuid(), 
        ${userId}::uuid, 
        COALESCE(${destinationName ?? null}, destination_name), 
        destination, 
        1, 
        now()
      FROM travel_sessions 
      WHERE id = ${sessionId}::uuid
      AND COALESCE(${destinationName ?? null}, destination_name) IS NOT NULL
      ON CONFLICT DO NOTHING
    `;
  }

  return { sessionId, status };
}

export async function getSessionSummary(sessionId: string, requesterId?: string) {
  const [session] = await prisma.$queryRaw<
    {
      id: string;
      userId: string;
      destinationName: string | null;
      profileId: string | null;
      status: string;
      startedAt: Date;
      endedAt: Date | null;
      durationSeconds: number | null;
      originLat: number;
      originLng: number;
      destLat: number;
      destLng: number;
    }[]
  >`
    SELECT 
      id,
      user_id AS "userId",
      destination_name AS "destinationName",
      profile_id AS "profileId",
      status,
      started_at AS "startedAt",
      ended_at AS "endedAt",
      ROUND(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)))::int AS "durationSeconds",
      ST_Y(origin::geometry) AS "originLat",
      ST_X(origin::geometry) AS "originLng",
      ST_Y(destination::geometry) AS "destLat",
      ST_X(destination::geometry) AS "destLng"
    FROM travel_sessions
    WHERE id = ${sessionId}::uuid
  `;

  if (!session) {
    return null;
  }

  const [distanceResult] = await prisma.$queryRaw<
    { totalMeters: number; pingCount: number }[]
  >`
    SELECT 
      COALESCE(
        ROUND(
          ST_Length(
            ST_MakeLine(location::geometry ORDER BY recorded_at)::geography
          )
        ), 0
      )::int AS "totalMeters",
      COUNT(*)::int AS "pingCount"
    FROM location_pings
    WHERE session_id = ${sessionId}::uuid
  `;

  const sosIncidents = await prisma.sosIncident.findMany({
    where: { sessionId },
    select: {
      id: true,
      triggerType: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  // Kontrak §13: summary memuat `reportsSubmitted`. RoadReport tidak punya
  // kolom session_id, jadi "laporan yang disubmit saat sesi" dihitung sebagai
  // laporan milik pemilik sesi yang dibuat dalam rentang waktu sesi
  // (started_at .. COALESCE(ended_at, now())).
  const reportsSubmitted = await prisma.roadReport.count({
    where: {
      reporterId: session.userId,
      createdAt: {
        gte: session.startedAt,
        lte: session.endedAt ?? new Date(),
      },
    },
  });

  if (requesterId && requesterId !== session.userId) {
    await recordAuditLog({
      actorId: requesterId,
      action: "view_session_summary",
      targetUserId: session.userId,
    });
  }

  const distanceMeters = distanceResult?.totalMeters ?? 0;
  const durationSeconds = session.durationSeconds ?? 0;

  return {
    ...session,
    distanceMeters,
    distanceM: distanceMeters,
    durationMin: Math.max(1, Math.round(durationSeconds / 60)),
    pingCount: distanceResult?.pingCount ?? 0,
    reportsSubmitted,
    sosIncidents,
    sosTriggered: sosIncidents.length > 0,
    completedAt: session.endedAt,
  };
}