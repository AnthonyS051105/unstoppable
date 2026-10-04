import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/errors.js";
import type {
  GeoPointInput,
  CreateRequestInput,
  OpenQueryInput,
  OfferInput,
  CheckinInput,
} from "./companions.schema.js";
import { DEFAULT_DURATION_MIN, OFFER_STATUS, REQUEST_STATUS } from "./companions.types.js";

type Tx = Prisma.TransactionClient;

const WIB = "Asia/Jakarta";

// ---------- helper SQL ----------

const pointSql = ({ coordinates: [lng, lat] }: GeoPointInput) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

const nullablePointSql = (point?: GeoPointInput) => (point ? pointSql(point) : Prisma.sql`NULL`);

// Alias hanya berasal dari literal di file ini, bukan input pengguna, jadi Prisma.raw aman.
const endsAt = (alias: "cr" | "busy") =>
  Prisma.raw(
    `${alias}.scheduled_start + make_interval(mins => COALESCE(${alias}.estimated_duration_min, ${DEFAULT_DURATION_MIN}))`,
  );

// Pengecekan bentrok jadwal (SDD §7.1, BR-69). Kandidat selalu bernama alias "cr".
const clashesWithConfirmed = (volunteerId: string) => Prisma.sql`
  EXISTS (
    SELECT 1 FROM companion_requests busy
    WHERE busy.selected_volunteer_id = ${volunteerId}::uuid
      AND busy.status = ${REQUEST_STATUS.confirmed}
      AND tstzrange(busy.scheduled_start, ${endsAt("busy")})
          && tstzrange(cr.scheduled_start, ${endsAt("cr")})
  )`;

const requestColumns = Prisma.sql`
  cr.id,
  cr.destination_name AS "destinationName",
  cr.meeting_point_note AS "meetingPointNote",
  cr.scheduled_start AS "scheduledStart",
  cr.estimated_duration_min AS "estimatedDurationMin",
  cr.assistance_types AS "assistanceTypes",
  cr.notes,
  cr.status,
  ST_AsGeoJSON(cr.destination_location) AS "destinationGeojson",
  ST_AsGeoJSON(cr.meeting_point_location) AS "meetingGeojson"
`;

interface RequestRow {
  id: string;
  destinationName: string;
  meetingPointNote: string | null;
  scheduledStart: Date;
  estimatedDurationMin: number | null;
  assistanceTypes: string[];
  notes: string | null;
  status: string;
  destinationGeojson: string;
  meetingGeojson: string | null;
  distanceM?: number;
}

const toRequestDto = ({ destinationGeojson, meetingGeojson, ...rest }: RequestRow) => ({
  ...rest,
  destinationLocation: JSON.parse(destinationGeojson),
  meetingPointLocation: meetingGeojson ? JSON.parse(meetingGeojson) : null,
});

// ---------- helper aturan ----------

interface LockedRequest {
  id: string;
  requesterId: string;
  selectedVolunteerId: string | null;
  status: string;
}

// SELECT ... FOR UPDATE: transaksi lain pada request yang sama menunggu sampai
// transaksi ini selesai. Inilah yang mencegah race condition (SDD §7.2).
async function lockRequest(tx: Tx, requestId: string): Promise<LockedRequest> {
  const [row] = await tx.$queryRaw<LockedRequest[]>`
    SELECT id,
           requester_id AS "requesterId",
           selected_volunteer_id AS "selectedVolunteerId",
           status
    FROM companion_requests
    WHERE id = ${requestId}::uuid
    FOR UPDATE
  `;
  if (!row) {
    throw new AppError("NOT_FOUND", "Permintaan pendampingan tidak ditemukan.", 404);
  }
  return row;
}

function assertParticipant(request: LockedRequest, userId: string) {
  if (userId !== request.requesterId && userId !== request.selectedVolunteerId) {
    throw new AppError("FORBIDDEN", "Anda bukan pihak dalam pendampingan ini.", 403);
  }
}

async function hasScheduleClash(tx: Tx, requestId: string, volunteerId: string) {
  const [row] = await tx.$queryRaw<{ clash: boolean }[]>`
    SELECT ${clashesWithConfirmed(volunteerId)} AS clash
    FROM companion_requests cr
    WHERE cr.id = ${requestId}::uuid
  `;
  return row?.clash ?? false;
}

// ---------- 1. buat request ----------

export async function createRequest(requesterId: string, input: CreateRequestInput) {
  const [row] = await prisma.$queryRaw<RequestRow[]>`
    INSERT INTO companion_requests AS cr (
      id, requester_id, destination_name, destination_location,
      meeting_point_location, meeting_point_note, scheduled_start,
      estimated_duration_min, assistance_types, notes, status, updated_at
    )
    VALUES (
      gen_random_uuid(),
      ${requesterId}::uuid,
      ${input.destinationName},
      ${pointSql(input.destinationLocation)},
      ${nullablePointSql(input.meetingPointLocation)},
      ${input.meetingPointNote ?? null},
      ${input.scheduledStart},
      ${input.estimatedDurationMin ?? null},
      ARRAY[${Prisma.join(input.assistanceTypes)}]::text[],
      ${input.notes ?? null},
      ${REQUEST_STATUS.open},
      now()
    )
    RETURNING ${requestColumns}
  `;
  return toRequestDto(row!);
}

// ---------- 2. request milik sendiri ----------

const mineSelect = {
  id: true,
  destinationName: true,
  scheduledStart: true,
  status: true,
  selectedVolunteerId: true,
  selectedVolunteer: { select: { id: true, name: true } },
  _count: { select: { offers: true } },
  checkins: { where: { checkinType: "complete" }, select: { actorId: true } },
} satisfies Prisma.CompanionRequestSelect;

type MineRow = Prisma.CompanionRequestGetPayload<{ select: typeof mineSelect }>;

export async function listMine(requesterId: string) {
  const rows: MineRow[] = await prisma.companionRequest.findMany({
    where: { requesterId },
    orderBy: { scheduledStart: "desc" },
    select: mineSelect,
  });

  return rows.map(({ _count, checkins, selectedVolunteerId, ...request }: MineRow) => {
    const checkedIn = new Set(checkins.map((c) => c.actorId));
    return {
      ...request,
      offerCount: _count.offers,
      checkins: {
        requester: checkedIn.has(requesterId),
        volunteer: selectedVolunteerId !== null && checkedIn.has(selectedVolunteerId),
      },
    };
  });
}

// ---------- 3. request terbuka untuk relawan ----------

export async function listOpen(volunteerId: string, { lng, lat, radiusM }: OpenQueryInput) {
  const nearOrigin =
    lng !== undefined && lat !== undefined
      ? Prisma.sql`AND ST_DWithin(
          cr.destination_location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}::float8
        )`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<RequestRow[]>`
    SELECT ${requestColumns},
           ROUND(MIN(ST_Distance(va.center_point, cr.destination_location)))::int AS "distanceM"
    FROM companion_requests cr
    JOIN volunteer_availability va
      ON va.volunteer_id = ${volunteerId}::uuid
     AND va.is_active
     AND ST_DWithin(va.center_point, cr.destination_location, va.radius_meters)
     AND (va.day_of_week IS NULL
          OR va.day_of_week = EXTRACT(DOW FROM cr.scheduled_start AT TIME ZONE ${WIB}))
     AND (va.start_time IS NULL
          OR (cr.scheduled_start AT TIME ZONE ${WIB})::time BETWEEN va.start_time AND va.end_time)
    JOIN volunteer_profiles vp ON vp.user_id = va.volunteer_id AND vp.is_active
    WHERE cr.status = ${REQUEST_STATUS.open}
      AND cr.scheduled_start > now()
      AND cr.requester_id <> ${volunteerId}::uuid
      AND NOT ${clashesWithConfirmed(volunteerId)}
      ${nearOrigin}
    GROUP BY cr.id
    ORDER BY cr.scheduled_start ASC
  `;
  return rows.map(toRequestDto);
}

// ---------- 4. menawar ----------

export async function createOffer(volunteerId: string, requestId: string, input: OfferInput) {
  return prisma.$transaction(async (tx: Tx) => {
    const request = await lockRequest(tx, requestId);
    if (request.status !== REQUEST_STATUS.open) {
      throw new AppError("CONFLICT", "Permintaan ini sudah tidak menerima tawaran.", 409);
    }
    if (request.requesterId === volunteerId) {
      throw new AppError("FORBIDDEN", "Anda tidak dapat menawar permintaan sendiri.", 403);
    }

    const existing = await tx.companionOffer.findUnique({
      where: { requestId_volunteerId: { requestId, volunteerId } },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("CONFLICT", "Anda sudah pernah menawar permintaan ini.", 409);
    }
    if (await hasScheduleClash(tx, requestId, volunteerId)) {
      throw new AppError("CONFLICT", "Jadwal Anda bentrok dengan pendampingan lain yang sudah terkonfirmasi.", 409);
    }

    const offer = await tx.companionOffer.create({
      data: { requestId, volunteerId, message: input.message ?? null },
      select: { id: true, message: true, createdAt: true, volunteer: { select: { id: true, name: true } } },
    });
    const { id: offerId, ...rest } = offer;
    return { requesterId: request.requesterId, offer: { offerId, ...rest } };
  });
}

// ---------- 5. daftar tawaran (pemilik request) ----------

const offerSelect = {
  id: true,
  message: true,
  createdAt: true,
  volunteer: {
    select: {
      id: true,
      name: true,
      volunteerProfile: { select: { ratingAvg: true, totalHelps: true, verificationStatus: true } },
    },
  },
} satisfies Prisma.CompanionOfferSelect;

type OfferRow = Prisma.CompanionOfferGetPayload<{ select: typeof offerSelect }>;

export async function listOffers(requesterId: string, requestId: string) {
  const request = await prisma.companionRequest.findUnique({
    where: { id: requestId },
    select: { requesterId: true },
  });
  if (!request) {
    throw new AppError("NOT_FOUND", "Permintaan pendampingan tidak ditemukan.", 404);
  }
  if (request.requesterId !== requesterId) {
    throw new AppError("FORBIDDEN", "Hanya pemilik permintaan yang dapat melihat tawaran.", 403);
  }

  const offers: OfferRow[] = await prisma.companionOffer.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" },
    select: offerSelect,
  });

  return offers.map(({ id, message, createdAt, volunteer: { volunteerProfile: profile, ...volunteer } }: OfferRow) => ({
    offerId: id,
    volunteer: {
      ...volunteer,
      ratingAvg: Number(profile?.ratingAvg ?? 0),
      totalHelps: profile?.totalHelps ?? 0,
      verificationStatus: profile?.verificationStatus ?? null,
    },
    message,
    createdAt,
  }));
}

// ---------- 6. pilih relawan ----------

export async function selectVolunteer(requesterId: string, requestId: string, offerId: string) {
  return prisma.$transaction(async (tx: Tx) => {
    const request = await lockRequest(tx, requestId);
    if (request.requesterId !== requesterId) {
      throw new AppError("FORBIDDEN", "Hanya pemilik permintaan yang dapat memilih relawan.", 403);
    }
    if (request.status !== REQUEST_STATUS.open) {
      throw new AppError("CONFLICT", "Permintaan ini sudah dikonfirmasi atau ditutup.", 409);
    }

    const offers = await tx.companionOffer.findMany({
      where: { requestId, status: OFFER_STATUS.offered },
      select: { id: true, volunteerId: true },
    });
    const chosen = offers.find((o) => o.id === offerId);
    if (!chosen) {
      throw new AppError("NOT_FOUND", "Tawaran tidak ditemukan.", 404);
    }
    // Relawan bisa menawar beberapa request yang jamnya berimpit, lalu dipilih di salah satunya dulu.
    if (await hasScheduleClash(tx, requestId, chosen.volunteerId)) {
      throw new AppError("CONFLICT", "Relawan ini sudah terkonfirmasi pada pendampingan lain di jam yang sama.", 409);
    }
    const notSelected = offers.filter((o) => o.id !== offerId);

    await tx.companionOffer.update({ where: { id: offerId }, data: { status: OFFER_STATUS.selected } });
    await tx.companionOffer.updateMany({
      where: { id: { in: notSelected.map((o) => o.id) } },
      data: { status: OFFER_STATUS.notSelected },
    });
    const { scheduledStart } = await tx.companionRequest.update({
      where: { id: requestId },
      data: { status: REQUEST_STATUS.confirmed, selectedVolunteerId: chosen.volunteerId },
      select: { scheduledStart: true },
    });
    const volunteer = await tx.user.findUniqueOrThrow({
      where: { id: chosen.volunteerId },
      select: { id: true, name: true },
    });

    return { volunteer, scheduledStart, notSelectedVolunteerIds: notSelected.map((o) => o.volunteerId) };
  });
}

// ---------- 7. check-in dua arah ----------

export async function checkin(actorId: string, requestId: string, { checkinType, location }: CheckinInput) {
  return prisma.$transaction(async (tx: Tx) => {
    const request = await lockRequest(tx, requestId);
    assertParticipant(request, actorId);
    const { requesterId, selectedVolunteerId } = request;
    if (request.status !== REQUEST_STATUS.confirmed || !selectedVolunteerId) {
      throw new AppError("CONFLICT", "Check-in hanya bisa dilakukan pada pendampingan yang terkonfirmasi.", 409);
    }

    const inserted = await tx.$executeRaw`
      INSERT INTO companion_checkins (id, request_id, actor_id, checkin_type, location)
      VALUES (gen_random_uuid(), ${requestId}::uuid, ${actorId}::uuid, ${checkinType}, ${nullablePointSql(location)})
      ON CONFLICT (request_id, actor_id, checkin_type) DO NOTHING
    `;
    if (inserted === 0) {
      throw new AppError("CONFLICT", "Anda sudah melakukan check-in ini.", 409);
    }

    if (checkinType !== "complete") {
      return { status: request.status };
    }

    const done = await tx.companionCheckin.findMany({
      where: { requestId, checkinType: "complete" },
      select: { actorId: true },
    });
    const actors = new Set(done.map((c) => c.actorId));
    if (!actors.has(requesterId) || !actors.has(selectedVolunteerId)) {
      return { status: request.status };
    }

    await markCompleted(tx, requestId, selectedVolunteerId);
    return { status: REQUEST_STATUS.completed };
  });
}

async function markCompleted(tx: Tx, requestId: string, volunteerId: string) {
  await tx.companionRequest.update({ where: { id: requestId }, data: { status: REQUEST_STATUS.completed } });
  // Formula ratingAvg di modul volunteers berbobot totalHelps.
  await tx.volunteerProfile.update({ where: { userId: volunteerId }, data: { totalHelps: { increment: 1 } } });
}

// ---------- 8. batal ----------

export async function cancel(actorId: string, requestId: string, reason: string) {
  return prisma.$transaction(async (tx: Tx) => {
    const request = await lockRequest(tx, requestId);
    assertParticipant(request, actorId);
    if (request.status !== REQUEST_STATUS.open && request.status !== REQUEST_STATUS.confirmed) {
      throw new AppError("CONFLICT", "Permintaan ini sudah selesai atau dibatalkan.", 409);
    }

    await tx.companionRequest.update({
      where: { id: requestId },
      data: { status: REQUEST_STATUS.cancelled, cancelledById: actorId, cancelReason: reason },
    });
    // BR-76: hanya pembatalan sepihak oleh relawan yang tercatat.
    if (actorId === request.selectedVolunteerId) {
      await tx.volunteerProfile.update({ where: { userId: actorId }, data: { cancelCount: { increment: 1 } } });
    }
    return { status: REQUEST_STATUS.cancelled };
  });
}

// ---------- 9. job terjadwal (BE-F-06-3/06-4, dipanggil jobs/companion-reminders.job.ts) ----------

export interface UpcomingConfirmed {
  id: string;
  requesterId: string;
  selectedVolunteerId: string;
  scheduledStart: Date;
}

// H-1: confirmed yang scheduledStart-nya dalam 24 jam ke depan (SDD §9).
export async function findUpcomingConfirmed(withinHours: number): Promise<UpcomingConfirmed[]> {
  return prisma.$queryRaw<UpcomingConfirmed[]>`
    SELECT id, requester_id AS "requesterId", selected_volunteer_id AS "selectedVolunteerId",
           scheduled_start AS "scheduledStart"
    FROM companion_requests
    WHERE status = ${REQUEST_STATUS.confirmed}
      AND selected_volunteer_id IS NOT NULL
      AND scheduled_start BETWEEN now() AND now() + (${withinHours} || ' hours')::interval
  `;
}

// expireCompanionRequests (SDD §9): open yang waktunya sudah lewat -> expired.
// Idempoten alami -- filter WHERE status='open' membuat run kedua tidak
// mengubah apa-apa (sama pola reports.service.ts#expireOverdueReports).
export async function expireOverdueRequests(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE companion_requests SET status = ${REQUEST_STATUS.expired}
    WHERE status = ${REQUEST_STATUS.open} AND scheduled_start < now()
  `;
}
