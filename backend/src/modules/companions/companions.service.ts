import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/errors.js";
import type {
  GeoPointInput,
  CreateRequestInput,
  OpenQueryInput,
  OfferInput,
  CheckinInput,
  RespondInput,
} from "./companions.schema.js";
import { DEFAULT_DURATION_MIN, OFFER_STATUS, PENDING_STATUSES, REQUEST_STATUS } from "./companions.types.js";
import * as volunteers from "../volunteers/volunteers.service.js";

type Tx = Prisma.TransactionClient;

const WIB = "Asia/Jakarta";

// Batas waktu jawab undangan langsung (§12.1).
const MIN = 60_000;
const HOUR = 60 * MIN;

export function computeInviteExpiry(scheduledStart: Date, now = new Date()): Date {
  const start = scheduledStart.getTime();
  const t = now.getTime();
  const window = start - t < 24 * HOUR ? 30 * MIN : 12 * HOUR;
  const latest = start - 2 * HOUR;
  // Sangat dekat jadwal: cutoff 2 jam sudah lewat, beri 30 menit tapi jangan lewat start.
  if (latest <= t + 10 * MIN) return new Date(Math.min(t + 30 * MIN, start));
  return new Date(Math.min(t + window, latest));
}

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
  invitedVolunteerId: string | null;
  inviteExpiresAt: Date | null;
  scheduledStart: Date;
  status: string;
}

// SELECT ... FOR UPDATE: transaksi lain pada request yang sama menunggu sampai
// transaksi ini selesai. Inilah yang mencegah race condition (SDD §7.2).
async function lockRequest(tx: Tx, requestId: string): Promise<LockedRequest> {
  const [row] = await tx.$queryRaw<LockedRequest[]>`
    SELECT id,
           requester_id AS "requesterId",
           selected_volunteer_id AS "selectedVolunteerId",
           invited_volunteer_id AS "invitedVolunteerId",
           invite_expires_at AS "inviteExpiresAt",
           scheduled_start AS "scheduledStart",
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

// Deteksi pelanggaran EXCLUDE constraint excl_confirmed_volunteer_no_overlap
// (Task 16g). Postgres memakai SQLSTATE 23P01 (exclusion_violation). Prisma 7
// bisa membungkusnya sebagai PrismaClientKnownRequestError (meta/code) atau
// error driver mentah -- jadi dicek berlapis: kode 23P01, atau sebutan nama
// constraint di pesan error. Robust terhadap bentuk pembungkus apa pun.
function isExclusionViolation(err: unknown): boolean {
  const CONSTRAINT = "excl_confirmed_volunteer_no_overlap";
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (err.meta ?? {}) as { code?: unknown; constraint?: unknown };
    if (meta.code === "23P01") return true;
    if (typeof meta.constraint === "string" && meta.constraint.includes(CONSTRAINT)) return true;
  }
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (code === "23P01") return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("23P01") || message.includes(CONSTRAINT);
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
  const invited = input.invitedVolunteerId;
  let inviteExpiresAt: Date | null = null;

  if (invited) {
    if (invited === requesterId) {
      throw new AppError("VOLUNTEER_UNAVAILABLE", "Anda tidak dapat mengundang diri sendiri.", 422);
    }
    // Titik yang dicek = destinationLocation, sama dengan listOpen & findAvailable.
    const [lng, lat] = input.destinationLocation.coordinates;
    const slot = {
      lng,
      lat,
      start: input.scheduledStart,
      durationMin: input.estimatedDurationMin ?? DEFAULT_DURATION_MIN,
    };
    if (!(await volunteers.isAvailableForSlot(prisma, invited, slot))) {
      throw new AppError(
        "VOLUNTEER_UNAVAILABLE",
        "Relawan ini tidak tersedia untuk jadwal dan lokasi tersebut. Anda bisa menyiarkan permintaan ke semua relawan.",
        422,
      );
    }
    inviteExpiresAt = computeInviteExpiry(input.scheduledStart);
  }

  // scheduled_end = scheduled_start + durasi (default DEFAULT_DURATION_MIN).
  // Disimpan sebagai kolom nyata supaya constraint EXCLUDE anti-overlap bisa
  // membangun tstzrange dari dua kolom timestamptz polos (Task 16g) --
  // aritmetika interval tidak immutable di dalam ekspresi index.
  const [row] = await prisma.$queryRaw<(RequestRow & { requesterName: string; invitedVolunteerId: string | null; inviteExpiresAt: Date | null })[]>`
    WITH inserted AS (
      INSERT INTO companion_requests AS cr (
        id, requester_id, destination_name, destination_location,
        meeting_point_location, meeting_point_note, scheduled_start, scheduled_end,
        estimated_duration_min, assistance_types, notes, status,
        invited_volunteer_id, invite_expires_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${requesterId}::uuid,
        ${input.destinationName},
        ${pointSql(input.destinationLocation)},
        ${nullablePointSql(input.meetingPointLocation)},
        ${input.meetingPointNote ?? null},
        ${input.scheduledStart},
        ${input.scheduledStart}::timestamptz + (COALESCE(${input.estimatedDurationMin ?? null}::int, ${DEFAULT_DURATION_MIN}) * interval '1 minute'),
        ${input.estimatedDurationMin ?? null},
        ARRAY[${Prisma.join(input.assistanceTypes)}]::text[],
        ${input.notes ?? null},
        ${invited ? REQUEST_STATUS.invited : REQUEST_STATUS.open},
        ${invited ?? null}::uuid,
        ${inviteExpiresAt},
        now()
      )
      RETURNING *
    )
    SELECT ${requestColumns},
           cr.invited_volunteer_id AS "invitedVolunteerId",
           cr.invite_expires_at AS "inviteExpiresAt",
           u.name AS "requesterName"
    FROM inserted cr
    JOIN users u ON u.id = cr.requester_id
  `;
  const { requesterName, invitedVolunteerId, inviteExpiresAt: expiresAt, ...rest } = row!;
  return { ...toRequestDto(rest), requesterName, invitedVolunteerId, inviteExpiresAt: expiresAt };
}

// ---------- 2. request milik sendiri ----------

const mineSelect = {
  id: true,
  destinationName: true,
  scheduledStart: true,
  status: true,
  selectedVolunteerId: true,
  selectedVolunteer: { select: { id: true, name: true } },
  invitedVolunteer: { select: { id: true, name: true } },
  inviteExpiresAt: true,
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

// Dipakai bersama oleh select (alur broadcast) dan respond (undangan langsung).
// Menjaga terjemahan 23P01 -> 409 di satu tempat.
async function confirmVolunteer(tx: Tx, request: LockedRequest, volunteerId: string) {
  // Lonjakan terakhir anti-race (Task 16g): hasScheduleClash memakai data yang
  // terbaca SEBELUM transaksi lain commit, jadi dua requester yang memilih
  // relawan sama untuk slot bentrok bisa dua-duanya lolos cek itu. EXCLUDE
  // constraint excl_confirmed_volunteer_no_overlap (migrasi 20261015000000)
  // menolak baris kedua secara atomic -> exclusion_violation (23P01).
  if (await hasScheduleClash(tx, request.id, volunteerId)) {
    throw new AppError("CONFLICT", "Relawan ini sudah terkonfirmasi pada pendampingan lain di jam yang sama.", 409);
  }
  let scheduledStart: Date;
  try {
    ({ scheduledStart } = await tx.companionRequest.update({
      where: { id: request.id },
      data: { status: REQUEST_STATUS.confirmed, selectedVolunteerId: volunteerId, inviteExpiresAt: null },
      select: { scheduledStart: true },
    }));
  } catch (err) {
    if (isExclusionViolation(err)) {
      throw new AppError("CONFLICT", "Relawan ini sudah terkonfirmasi pada pendampingan lain di jam yang sama.", 409);
    }
    throw err;
  }
  const volunteer = await tx.user.findUniqueOrThrow({ where: { id: volunteerId }, select: { id: true, name: true } });
  // Caregiver tertaut requester -- kontrak §12 & §15.3: companion:confirmed
  // dikirim ke relawan + caregiver.
  const links = await tx.caregiverRelationship.findMany({
    where: { blindUserId: request.requesterId },
    select: { caregiverId: true },
  });
  return { volunteer, scheduledStart, caregiverIds: links.map((l) => l.caregiverId) };
}

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
    const notSelected = offers.filter((o) => o.id !== offerId);

    await tx.companionOffer.update({ where: { id: offerId }, data: { status: OFFER_STATUS.selected } });
    await tx.companionOffer.updateMany({
      where: { id: { in: notSelected.map((o) => o.id) } },
      data: { status: OFFER_STATUS.notSelected },
    });

    const { volunteer, scheduledStart, caregiverIds } = await confirmVolunteer(tx, request, chosen.volunteerId);

    return {
      volunteer,
      scheduledStart,
      notSelectedVolunteerIds: notSelected.map((o) => o.volunteerId),
      caregiverIds,
    };
  });
}

// ---------- 6b. undangan langsung: respond / broadcast / listInvites ----------

export async function respond(volunteerId: string, requestId: string, { accept, reason }: RespondInput) {
  return prisma.$transaction(async (tx: Tx) => {
    const request = await lockRequest(tx, requestId);
    if (request.invitedVolunteerId !== volunteerId) {
      throw new AppError("FORBIDDEN", "Undangan ini bukan untuk Anda.", 403);
    }
    if (request.status !== REQUEST_STATUS.invited) {
      throw new AppError("CONFLICT", "Undangan ini sudah dijawab atau tidak berlaku lagi.", 409);
    }
    // Job kedaluwarsa berjalan tiap menit; jangan pernah menerima jawaban setelah batas waktu.
    if (request.inviteExpiresAt && request.inviteExpiresAt <= new Date()) {
      throw new AppError("INVITE_EXPIRED", "Batas waktu menjawab undangan ini sudah lewat.", 410);
    }

    if (!accept) {
      await tx.companionRequest.update({
        where: { id: requestId },
        data: { status: REQUEST_STATUS.inviteDeclined, inviteExpiresAt: null },
      });
      const volunteer = await tx.user.findUniqueOrThrow({ where: { id: volunteerId }, select: { id: true, name: true } });
      return { status: REQUEST_STATUS.inviteDeclined, requesterId: request.requesterId, volunteer, reason };
    }

    const confirmed = await confirmVolunteer(tx, request, volunteerId);
    return { status: REQUEST_STATUS.confirmed, requesterId: request.requesterId, ...confirmed };
  });
}

export async function broadcast(requesterId: string, requestId: string) {
  return prisma.$transaction(async (tx: Tx) => {
    const request = await lockRequest(tx, requestId);
    if (request.requesterId !== requesterId) {
      throw new AppError("FORBIDDEN", "Hanya pemilik permintaan yang dapat menyiarkannya.", 403);
    }
    const from: string[] = [REQUEST_STATUS.inviteDeclined, REQUEST_STATUS.inviteExpired];
    if (!from.includes(request.status)) {
      throw new AppError("CONFLICT", "Permintaan ini tidak dapat disiarkan ulang.", 409);
    }
    if (request.scheduledStart <= new Date()) {
      throw new AppError("CONFLICT", "Jadwal permintaan ini sudah lewat. Buat permintaan baru.", 409);
    }
    // invitedVolunteerId dibiarkan untuk riwayat (§12.1).
    await tx.companionRequest.update({
      where: { id: requestId },
      data: { status: REQUEST_STATUS.open, inviteExpiresAt: null },
    });
    return { status: REQUEST_STATUS.open };
  });
}

export async function listInvites(volunteerId: string) {
  const rows = await prisma.$queryRaw<(RequestRow & { inviteExpiresAt: Date; requesterName: string })[]>`
    SELECT ${requestColumns},
           cr.invite_expires_at AS "inviteExpiresAt",
           u.name AS "requesterName"
    FROM companion_requests cr
    JOIN users u ON u.id = cr.requester_id
    WHERE cr.invited_volunteer_id = ${volunteerId}::uuid
      AND cr.status = ${REQUEST_STATUS.invited}
      AND cr.invite_expires_at > now()
    ORDER BY cr.invite_expires_at ASC
  `;
  // Jangan kirim requester.id atau kontak pengguna sebelum confirmed. Nama depan cukup.
  return rows.map(({ requesterName, ...row }) => ({ ...toRequestDto(row), requester: { name: requesterName } }));
}

export interface ExpiredInvite {
  requestId: string;
  requesterId: string;
  volunteer: { id: string; name: string };
}

// Idempoten: run kedua tidak menemukan baris 'invited' yang sudah lewat batas waktu.
export async function expireInvites(): Promise<ExpiredInvite[]> {
  const rows = await prisma.$queryRaw<{ requestId: string; requesterId: string; volunteerId: string; volunteerName: string }[]>`
    UPDATE companion_requests cr
       SET status = ${REQUEST_STATUS.inviteExpired}, updated_at = now()
      FROM users u
     WHERE u.id = cr.invited_volunteer_id
       AND cr.status = ${REQUEST_STATUS.invited}
       AND cr.invite_expires_at <= now()
    RETURNING cr.id AS "requestId", cr.requester_id AS "requesterId", u.id AS "volunteerId", u.name AS "volunteerName"
  `;
  return rows.map((r) => ({
    requestId: r.requestId,
    requesterId: r.requesterId,
    volunteer: { id: r.volunteerId, name: r.volunteerName },
  }));
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
    const cancellable: string[] = [...PENDING_STATUSES, REQUEST_STATUS.confirmed];
    if (!cancellable.includes(request.status)) {
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

// expireCompanionRequests (SDD §9): permintaan menunggu yang jadwalnya sudah
// lewat -> expired. Termasuk undangan (invited/invite_declined/invite_expired)
// yang jadwalnya lewat, bukan hanya 'open'. Idempoten alami -- filter status
// membuat run kedua tidak mengubah apa-apa.
export async function expireOverdueRequests(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE companion_requests SET status = ${REQUEST_STATUS.expired}, updated_at = now()
    WHERE status IN (${Prisma.join(PENDING_STATUSES as readonly string[])}) AND scheduled_start < now()
  `;
}
