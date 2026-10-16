import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/errors.js";
import { recordAuditLog } from "../../shared/audit-log.service.js";
import * as trips from "../trips/trips.service.js";

type TransactionClient = Prisma.TransactionClient;

export interface StartSessionParams {
  userId: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  destinationName?: string;
  edgeIds?: Array<number | bigint | string>;
  profileId?: string;
  estimatedArrival?: string | Date;
  plannedTripId?: string; // B14: tandai rencana perjalanan ini sudah dimulai.
}

export interface LocationPingParams {
  sessionId: string;
  userId: string;
  lat: number;
  lng: number;
  accuracyM?: number | undefined;
}

export interface ArrivalCheck {
  sessionId: string;
  userId: string;
  destinationName: string | null;
  autoEndAt: Date;
}

export interface SessionEventRecord {
  id: string;
  userId: string;
  destinationName: string | null;
  status: string;
  endedReason: string | null;
  endedAt: Date;
}

interface SessionRow {
  id: string;
  userId: string;
  destinationName: string | null;
  profileId: string | null;
  status: string;
  startedAt: Date;
  estimatedArrival: Date | null;
}

export interface StartedSession {
  session: SessionRow;
  replacedSessions: SessionEventRecord[];
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

export async function getUserName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return user?.name ?? null;
}

export async function startSession(params: StartSessionParams): Promise<StartedSession> {
  const edgeIds = (params.edgeIds ?? []).map((id) => BigInt(id));

  const started = await prisma.$transaction(async (tx: TransactionClient) => {
    const replacedSessions = await tx.$queryRaw<SessionEventRecord[]>`
      UPDATE travel_sessions
      SET
        status = 'cancelled',
        ended_at = now(),
        ended_reason = 'replaced'
      WHERE user_id = ${params.userId}::uuid
        AND status = 'active'
      RETURNING
        id,
        user_id AS "userId",
        destination_name AS "destinationName",
        status,
        ended_reason AS "endedReason",
        ended_at AS "endedAt"
    `;

    const [session] = await tx.$queryRaw<SessionRow[]>`
      INSERT INTO travel_sessions (
        id, user_id, origin, destination, destination_name, edge_ids, profile_id,
        estimated_arrival, status, started_at
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

    if (!session) {
      throw new AppError("INTERNAL_ERROR", "Gagal memulai sesi perjalanan.", 500);
    }

    return { session, replacedSessions };
  });

  // B14: tandai rencana perjalanan yang dimulai (eksplisit atau cocok otomatis).
  // Di luar transaksi: kegagalan pencocokan tidak boleh menggagalkan mulai perjalanan.
  try {
    await trips.markStartedOnSession(prisma, {
      userId: params.userId,
      sessionId: started.session.id,
      plannedTripId: params.plannedTripId,
      destLng: params.destination.lng,
      destLat: params.destination.lat,
    });
  } catch (err) {
    console.error("[startSession] gagal menandai rencana perjalanan:", err instanceof Error ? err.message : err);
  }

  return started;
}

export function clampArrivalRadius(accuracyM?: number): number {
  const ARRIVAL_MIN_M = 25;
  const ARRIVAL_MAX_M = 60;
  return Math.min(Math.max(accuracyM ?? ARRIVAL_MIN_M, ARRIVAL_MIN_M), ARRIVAL_MAX_M);
}

export interface RecordedLocationPing {
  id: string;
  sessionId: string;
  recordedAt: Date;
}

export interface LocationPingResult {
  ping: RecordedLocationPing;
  arrivalCheck: ArrivalCheck | null;
}

export async function recordLocationPing(
  params: LocationPingParams,
): Promise<LocationPingResult | null> {
  return prisma.$transaction(async (tx: TransactionClient) => {
    const [activeSession] = await tx.$queryRaw<
      { userId: string; destinationName: string | null }[]
    >`
      SELECT
        user_id AS "userId",
        destination_name AS "destinationName"
      FROM travel_sessions
      WHERE id = ${params.sessionId}::uuid
        AND user_id = ${params.userId}::uuid
        AND status = 'active'
      FOR UPDATE
    `;

    if (!activeSession) return null;

    const [ping] = await tx.$queryRaw<RecordedLocationPing[]>`
      INSERT INTO location_pings (session_id, location, accuracy_m, recorded_at)
      VALUES (
        ${params.sessionId}::uuid,
        ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
        ${params.accuracyM ?? null},
        now()
      )
      RETURNING
        id::text,
        session_id AS "sessionId",
        recorded_at AS "recordedAt"
    `;

    if (!ping) {
      throw new AppError("INTERNAL_ERROR", "Gagal mencatat lokasi sesi.", 500);
    }

    await tx.$executeRaw`
      UPDATE travel_sessions
      SET
        last_ping_at = now(),
        paused_at = NULL
      WHERE id = ${params.sessionId}::uuid
        AND user_id = ${params.userId}::uuid
        AND status = 'active'
    `;

    const radiusM = clampArrivalRadius(params.accuracyM);
    const [arrivalCheck] = await tx.$queryRaw<ArrivalCheck[]>`
      UPDATE travel_sessions
      SET arrival_prompted_at = now()
      WHERE id = ${params.sessionId}::uuid
        AND user_id = ${params.userId}::uuid
        AND status = 'active'
        AND arrival_prompted_at IS NULL
        AND (arrival_snooze_until IS NULL OR arrival_snooze_until < now())
        AND ST_DWithin(
          destination,
          ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
          ${radiusM}
        )
      RETURNING
        id AS "sessionId",
        user_id AS "userId",
        destination_name AS "destinationName",
        now() + interval '2 minutes' AS "autoEndAt"
    `;

    return {
      ping,
      arrivalCheck: arrivalCheck ?? null,
    };
  });
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
    SET
      last_ping_at = now(),
      paused_at = NULL
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid AND status = 'active'
  `;
  return affected > 0;
}

export async function endSession(
  sessionId: string,
  userId: string,
  status: "completed" | "cancelled" | "sos_triggered" = "completed",
  destinationName?: string,
  endedReason: "user" | "arrived_auto" | "timeout" | "replaced" | "sos" = "user",
) {
  const [ended] = await prisma.$queryRaw<SessionEventRecord[]>`
    UPDATE travel_sessions
    SET
      status = ${status},
      destination_name = COALESCE(${destinationName ?? null}, destination_name),
      ended_at = now(),
      ended_reason = ${endedReason}
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'active'
    RETURNING
      id,
      user_id AS "userId",
      destination_name AS "destinationName",
      status,
      ended_reason AS "endedReason",
      ended_at AS "endedAt"
  `;

  if (!ended) return null;

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

  return {
    sessionId,
    status: ended.status,
    endedReason: ended.endedReason,
    destinationName: ended.destinationName,
    endedAt: ended.endedAt,
    userId: ended.userId,
  };
}

export async function pauseSession(sessionId: string, userId: string) {
  const [paused] = await prisma.$queryRaw<{ id: string; pausedAt: Date }[]>`
    UPDATE travel_sessions
    SET paused_at = now()
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'active'
    RETURNING id, paused_at AS "pausedAt"
  `;
  return paused ?? null;
}

export async function resumeSession(sessionId: string, userId: string) {
  const [resumed] = await prisma.$queryRaw<{ id: string; lastPingAt: Date }[]>`
    UPDATE travel_sessions
    SET paused_at = NULL, last_ping_at = now()
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'active'
    RETURNING id, last_ping_at AS "lastPingAt"
  `;
  return resumed ?? null;
}

export async function respondToArrival(
  sessionId: string,
  userId: string,
  arrived: boolean,
) {
  if (arrived) {
    return {
      type: "ended" as const,
      session: await endSession(sessionId, userId, "completed", undefined, "user"),
    };
  }

  const [snoozed] = await prisma.$queryRaw<{ id: string; arrivalSnoozeUntil: Date }[]>`
    UPDATE travel_sessions
    SET
      arrival_prompted_at = NULL,
      arrival_snooze_until = now() + interval '5 minutes'
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'active'
    RETURNING id, arrival_snooze_until AS "arrivalSnoozeUntil"
  `;

  return {
    type: "snoozed" as const,
    session: snoozed ?? null,
  };
}

export async function acknowledgeWellbeing(
  sessionId: string,
  userId: string,
  status: "ok",
): Promise<boolean> {
  // `wellbeing_check_at` is used as the next-check deadline by the lifecycle job.
  const affected = await prisma.$executeRaw`
    UPDATE travel_sessions
    SET wellbeing_check_at = now() + interval '15 minutes'
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'active'
      AND paused_at IS NOT NULL
  `;
  return affected > 0;
}

export async function getLatestSessionLocation(sessionId: string, userId: string) {
  const [location] = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
    SELECT
      ST_X(COALESCE(lp.location, ts.origin)::geometry) AS lng,
      ST_Y(COALESCE(lp.location, ts.origin)::geometry) AS lat
    FROM travel_sessions ts
    LEFT JOIN LATERAL (
      SELECT location
      FROM location_pings
      WHERE session_id = ts.id
      ORDER BY recorded_at DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE ts.id = ${sessionId}::uuid
      AND ts.user_id = ${userId}::uuid
      AND ts.status = 'active'
  `;
  return location ?? null;
}

export async function submitSessionFeedback(
  sessionId: string,
  userId: string,
  rating: 1 | 3 | 5,
) {
  const session = await prisma.travelSession.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      status: true,
      feedbackRating: true,
    },
  });

  if (!session || session.userId !== userId) {
    throw new AppError("NOT_FOUND", "Sesi tidak ditemukan.", 404);
  }

  if (session.status !== "completed") {
    throw new AppError(
      "CONFLICT",
      "Feedback hanya dapat diberikan setelah perjalanan selesai.",
      409,
    );
  }

  if (session.feedbackRating !== null) {
    throw new AppError(
      "CONFLICT",
      "Feedback untuk perjalanan ini sudah dikirim.",
      409,
    );
  }

  const affected = await prisma.$executeRaw`
    UPDATE travel_sessions
    SET feedback_rating = ${rating}
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'completed'
      AND feedback_rating IS NULL
  `;

  if (affected !== 1) {
    throw new AppError(
      "CONFLICT",
      "Feedback untuk perjalanan ini sudah dikirim.",
      409,
    );
  }

  return { sessionId, rating };
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
  // kolom session_id, jadi hitung dalam rentang sesi memakai clock database
  // yang sama untuk created_at, started_at, ended_at, dan now().
  const [reportsResult] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM road_reports
    WHERE reporter_id = ${session.userId}::uuid
      AND created_at >= ${session.startedAt}
      AND created_at <= COALESCE(${session.endedAt ?? null}::timestamptz, now())
  `;
  const reportsSubmitted = reportsResult?.count ?? 0;

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
