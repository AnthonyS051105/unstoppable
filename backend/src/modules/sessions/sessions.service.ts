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
      AND ts.paused_at IS NULL
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

// ===========================================================================
// B11 (§15.3) -- helper siklus hidup sesi untuk jobs/check-stale-sessions.job.ts.
// Semua query di sini; job hanya memanggil & mengirim notifikasi. Setiap fungsi
// idempoten lewat penanda (*_notified_at) atau perubahan status, sehingga aman
// dijalankan ulang tiap menit tanpa notifikasi ganda (CLAUDE.md §5.6).
// ===========================================================================

const ARRIVAL_RADIUS_M = 50; // radius dianggap "tiba" saat mengevaluasi ping terakhir

export interface EndedSession {
  sessionId: string;
  userId: string;
  destinationName: string | null;
  status: string;
  endedReason: string;
}

// Tiba otomatis: arrival_prompted_at > 2 menit lalu, belum dijawab, dan ping
// terakhir masih di dalam radius tujuan -> akhiri completed/arrived_auto.
export async function autoEndArrivedSessions(): Promise<EndedSession[]> {
  return prisma.$queryRaw<EndedSession[]>`
    WITH ended AS (
      UPDATE travel_sessions ts
         SET status = 'completed', ended_at = now(), ended_reason = 'arrived_auto'
       WHERE ts.status = 'active'
         AND ts.arrival_prompted_at IS NOT NULL
         AND ts.arrival_prompted_at < now() - interval '2 minutes'
         AND EXISTS (
           SELECT 1 FROM location_pings lp
           WHERE lp.session_id = ts.id
           ORDER BY lp.recorded_at DESC
           LIMIT 1
         )
         AND ST_DWithin(
           ts.destination,
           (SELECT lp.location FROM location_pings lp WHERE lp.session_id = ts.id ORDER BY lp.recorded_at DESC LIMIT 1),
           ${ARRIVAL_RADIUS_M}
         )
      RETURNING ts.id, ts.user_id, ts.destination_name, ts.status, ts.ended_reason
    )
    SELECT id AS "sessionId", user_id AS "userId", destination_name AS "destinationName",
           status, ended_reason AS "endedReason"
    FROM ended
  `;
}

export interface OverdueSession {
  sessionId: string;
  userId: string;
  destinationName: string | null;
  estimatedArrival: Date | null;
}

// Terlambat (PRD P6): estimated_arrival + 20 menit lewat, belum dekat tujuan,
// belum pernah diberi tahu. Tandai overdue_notified_at (idempoten).
export async function markOverdueSessions(): Promise<OverdueSession[]> {
  return prisma.$queryRaw<OverdueSession[]>`
    WITH flagged AS (
      UPDATE travel_sessions ts
         SET overdue_notified_at = now()
       WHERE ts.status = 'active'
         AND ts.paused_at IS NULL
         AND ts.estimated_arrival IS NOT NULL
         AND ts.estimated_arrival + interval '20 minutes' < now()
         AND ts.overdue_notified_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM location_pings lp
           WHERE lp.session_id = ts.id
             AND ST_DWithin(ts.destination, lp.location, ${ARRIVAL_RADIUS_M})
             AND lp.recorded_at > now() - interval '10 minutes'
         )
      RETURNING ts.id, ts.user_id, ts.destination_name, ts.estimated_arrival
    )
    SELECT id AS "sessionId", user_id AS "userId", destination_name AS "destinationName",
           estimated_arrival AS "estimatedArrival"
    FROM flagged
  `;
}

export interface WellbeingCheckSession {
  sessionId: string;
  userId: string;
  destinationName: string | null;
}

// Cek ke lansia: sesi dijeda dan sudah melewati batas_cek, belum pernah dicek.
// batas_cek = COALESCE(estimated_arrival, paused_at + 20 menit) + 10 menit.
// Tandai wellbeing_check_at (idempoten).
export async function markWellbeingChecks(): Promise<WellbeingCheckSession[]> {
  return prisma.$queryRaw<WellbeingCheckSession[]>`
    WITH flagged AS (
      UPDATE travel_sessions ts
         SET wellbeing_check_at = now()
       WHERE ts.status = 'active'
         AND ts.paused_at IS NOT NULL
         AND ts.wellbeing_check_at IS NULL
         AND now() >= (COALESCE(ts.estimated_arrival, ts.paused_at + interval '20 minutes') + interval '10 minutes')
      RETURNING ts.id, ts.user_id, ts.destination_name
    )
    SELECT id AS "sessionId", user_id AS "userId", destination_name AS "destinationName"
    FROM flagged
  `;
}

export interface StalledSession {
  sessionId: string;
  userId: string;
  destinationName: string | null;
  lastSeenAt: Date | null;
}

// Keluarga diberi tahu: cek ke lansia terkirim >= 5 menit lalu, belum dijawab
// (masih dijeda), belum pernah diberi tahu. Tandai stalled_notified_at.
export async function markStalledSessions(): Promise<StalledSession[]> {
  return prisma.$queryRaw<StalledSession[]>`
    WITH flagged AS (
      UPDATE travel_sessions ts
         SET stalled_notified_at = now()
       WHERE ts.status = 'active'
         AND ts.paused_at IS NOT NULL
         AND ts.wellbeing_check_at IS NOT NULL
         AND ts.wellbeing_check_at < now() - interval '5 minutes'
         AND ts.stalled_notified_at IS NULL
      RETURNING ts.id, ts.user_id, ts.destination_name, ts.paused_at
    )
    SELECT id AS "sessionId", user_id AS "userId", destination_name AS "destinationName",
           paused_at AS "lastSeenAt"
    FROM flagged
  `;
}

// Batas waktu: started_at < now() - max(4 jam, 3 x durasi estimasi) ->
// akhiri cancelled/timeout. Durasi estimasi = estimated_arrival - started_at
// bila ada, selain itu 0 (sehingga batas = 4 jam).
export async function timeoutOverrunSessions(): Promise<EndedSession[]> {
  return prisma.$queryRaw<EndedSession[]>`
    WITH ended AS (
      UPDATE travel_sessions ts
         SET status = 'cancelled', ended_at = now(), ended_reason = 'timeout'
       WHERE ts.status = 'active'
         AND ts.started_at < now() - GREATEST(
               interval '4 hours',
               3 * COALESCE(ts.estimated_arrival - ts.started_at, interval '0')
             )
      RETURNING ts.id, ts.user_id, ts.destination_name, ts.status, ts.ended_reason
    )
    SELECT id AS "sessionId", user_id AS "userId", destination_name AS "destinationName",
           status, ended_reason AS "endedReason"
    FROM ended
  `;
}

// Caregiver yang boleh menerima event status (mode != off). Dipakai job B11
// untuk mengirim session:ended/overdue/stalled ke keluarga. Hanya id caregiver.
export async function statusWatchersOf(userId: string): Promise<string[]> {
  const rows = await prisma.caregiverRelationship.findMany({
    where: { blindUserId: userId, locationSharingMode: { not: "off" } },
    select: { caregiverId: true },
  });
  return rows.map((r) => r.caregiverId);
}

// Ping terakhir sesi (lng/lat) -- dipakai SOS "on behalf of" oleh caregiver
// (lokasi diambil dari ping terakhir, bukan lokasi caregiver).
export async function lastPingLocation(sessionId: string): Promise<{ lng: number; lat: number } | null> {
  const [row] = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
    SELECT ST_X(lp.location::geometry) AS lng, ST_Y(lp.location::geometry) AS lat
    FROM location_pings lp
    WHERE lp.session_id = ${sessionId}::uuid
    ORDER BY lp.recorded_at DESC
    LIMIT 1
  `;
  return row ?? null;
}
