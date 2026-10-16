// B14 (§15.3) — rencana perjalanan + pengingat "Mulai". Semua akses prisma di
// sini; kepemilikan & tautan keluarga dicek di service. Kolom geography lewat
// raw SQL ([lng, lat]).
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/errors.js";
import type { CreatePlannedTripInput } from "./trips.schema.js";

type Db = Prisma.TransactionClient | typeof prisma;

const tripColumns = Prisma.sql`
  pt.id,
  pt.destination_name AS "destinationName",
  pt.depart_at AS "departAt",
  pt.profile_id AS "profileId",
  pt.companion_request_id AS "companionRequestId",
  pt.status,
  pt.session_id AS "sessionId",
  ST_AsGeoJSON(pt.destination) AS "destinationGeojson"
`;

interface TripRow {
  id: string;
  destinationName: string;
  departAt: Date;
  profileId: string | null;
  companionRequestId: string | null;
  status: string;
  sessionId: string | null;
  destinationGeojson: string;
  userId?: string;
}

const toTripDto = ({ destinationGeojson, ...rest }: TripRow) => ({
  ...rest,
  destination: JSON.parse(destinationGeojson),
});

async function assertLinked(caregiverId: string, blindUserId: string) {
  const link = await prisma.caregiverRelationship.findFirst({
    where: { caregiverId, blindUserId },
    select: { id: true },
  });
  if (!link) {
    throw new AppError("FORBIDDEN", "Anda tidak tertaut dengan pengguna ini.", 403);
  }
}

export async function createPlannedTrip(actorId: string, input: CreatePlannedTripInput) {
  const userId = input.forUserId ?? actorId;
  if (userId !== actorId) {
    // Keluarga hanya boleh merencanakan untuk lansia yang tertaut dengannya.
    await assertLinked(actorId, userId);
  }
  const [lng, lat] = input.destination.coordinates;
  const [row] = await prisma.$queryRaw<TripRow[]>`
    INSERT INTO planned_trips AS pt (
      id, user_id, destination_name, destination, depart_at, profile_id, status
    )
    VALUES (
      gen_random_uuid(),
      ${userId}::uuid,
      ${input.destinationName},
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${input.departAt},
      ${input.profileId ?? null},
      'planned'
    )
    RETURNING ${tripColumns}
  `;
  return toTripDto(row!);
}

export async function listPlannedTrips(userId: string) {
  // Milik sendiri + milik lansia yang tertaut (keluarga). Satu query dengan
  // union lewat OR pada tautan caregiver.
  const rows = await prisma.$queryRaw<TripRow[]>`
    SELECT ${tripColumns}, pt.user_id AS "userId"
    FROM planned_trips pt
    WHERE pt.status IN ('planned', 'started')
      AND (
        pt.user_id = ${userId}::uuid
        OR pt.user_id IN (
          SELECT cr.blind_user_id FROM caregiver_relationships cr
          WHERE cr.caregiver_id = ${userId}::uuid
        )
      )
    ORDER BY pt.depart_at ASC
  `;
  return rows.map(toTripDto);
}

export async function cancelPlannedTrip(actorId: string, id: string) {
  const trip = await prisma.plannedTrip.findUnique({ where: { id }, select: { userId: true, status: true } });
  if (!trip) {
    throw new AppError("NOT_FOUND", "Rencana perjalanan tidak ditemukan.", 404);
  }
  if (trip.userId !== actorId) {
    await assertLinked(actorId, trip.userId);
  }
  if (trip.status !== "planned") {
    throw new AppError("CONFLICT", "Rencana ini sudah dimulai atau dibatalkan.", 409);
  }
  await prisma.plannedTrip.update({ where: { id }, data: { status: "cancelled" } });
  return { id, status: "cancelled" };
}

// Dipanggil B4 confirmVolunteer: pendampingan confirmed otomatis membuat rencana
// perjalanan dengan companion_request_id terisi (pakai tx yang sama).
export async function createFromCompanion(
  db: Db,
  params: { userId: string; companionRequestId: string; destinationName: string; departAt: Date; lng: number; lat: number },
) {
  await db.$executeRaw`
    INSERT INTO planned_trips (id, user_id, destination_name, destination, depart_at, companion_request_id, status)
    VALUES (
      gen_random_uuid(),
      ${params.userId}::uuid,
      ${params.destinationName},
      ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
      ${params.departAt},
      ${params.companionRequestId}::uuid,
      'planned'
    )
  `;
}

// Dipanggil sessions.startSession: tandai rencana yang dimulai. Eksplisit lewat
// plannedTripId, atau cocok otomatis (tujuan dalam 100 m & depart_at -30/+90 mnt).
export async function markStartedOnSession(
  db: Db,
  params: { userId: string; sessionId: string; plannedTripId?: string | undefined; destLng: number; destLat: number },
) {
  if (params.plannedTripId) {
    await db.$executeRaw`
      UPDATE planned_trips
         SET status = 'started', session_id = ${params.sessionId}::uuid
       WHERE id = ${params.plannedTripId}::uuid
         AND user_id = ${params.userId}::uuid
         AND status = 'planned'
    `;
    return;
  }
  // Pencocokan otomatis: satu rencana planned terdekat yang cocok.
  await db.$executeRaw`
    UPDATE planned_trips
       SET status = 'started', session_id = ${params.sessionId}::uuid
     WHERE id = (
       SELECT pt.id FROM planned_trips pt
       WHERE pt.user_id = ${params.userId}::uuid
         AND pt.status = 'planned'
         AND pt.depart_at BETWEEN now() - interval '30 minutes' AND now() + interval '90 minutes'
         AND ST_DWithin(
           pt.destination,
           ST_SetSRID(ST_MakePoint(${params.destLng}, ${params.destLat}), 4326)::geography,
           100
         )
       ORDER BY abs(extract(epoch FROM (pt.depart_at - now())))
       LIMIT 1
     )
  `;
}

// ---------- job pengingat (B14, tiap menit) ----------

export interface TripReminder {
  id: string;
  userId: string;
  destinationName: string;
  departAt: Date;
}

// depart_at - 15 menit: ingatkan lansia menekan "Mulai". Tandai reminded_at.
export async function dueReminders(): Promise<TripReminder[]> {
  return prisma.$queryRaw<TripReminder[]>`
    WITH flagged AS (
      UPDATE planned_trips pt
         SET reminded_at = now()
       WHERE pt.status = 'planned'
         AND pt.reminded_at IS NULL
         AND pt.depart_at <= now() + interval '15 minutes'
         AND pt.depart_at > now()
      RETURNING pt.id, pt.user_id, pt.destination_name, pt.depart_at
    )
    SELECT id, user_id AS "userId", destination_name AS "destinationName", depart_at AS "departAt" FROM flagged
  `;
}

// depart_at + 30 menit, masih planned: beri tahu lansia & keluarga. Tandai late_notified_at.
export async function dueLateNotifications(): Promise<TripReminder[]> {
  return prisma.$queryRaw<TripReminder[]>`
    WITH flagged AS (
      UPDATE planned_trips pt
         SET late_notified_at = now()
       WHERE pt.status = 'planned'
         AND pt.late_notified_at IS NULL
         AND pt.depart_at + interval '30 minutes' <= now()
      RETURNING pt.id, pt.user_id, pt.destination_name, pt.depart_at
    )
    SELECT id, user_id AS "userId", destination_name AS "destinationName", depart_at AS "departAt" FROM flagged
  `;
}

// depart_at + 3 jam, masih planned -> missed (tanpa notifikasi lagi). Idempoten.
export async function markMissed(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE planned_trips SET status = 'missed'
     WHERE status = 'planned' AND depart_at + interval '3 hours' <= now()
  `;
}
