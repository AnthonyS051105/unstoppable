// SOS Service -- docs/API_CONTRACT.md §14, backend/docs/SDD.md §2 (kalau ada).
// Controller tidak boleh menyentuh Prisma langsung (backend/CLAUDE.local.md §3)
// -- semua akses data lewat fungsi-fungsi di file ini.
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { VOLUNTEER_SEARCH_TIERS_M, type SosResponseStatus } from "./sos.types.js";

interface TriggerSosParams {
  userId: string;
  sessionId: string | null | undefined;
  triggerType: string;
  lng: number;
  lat: number;
  audioRecordingUrl: string | undefined;
}

interface CreatedSosIncident {
  id: string;
  status: string;
  createdAt: Date;
}

export async function triggerSos(params: TriggerSosParams): Promise<CreatedSosIncident> {
  const [incident] = await prisma.$queryRaw<CreatedSosIncident[]>`
    INSERT INTO sos_incidents (id, session_id, user_id, trigger_type, location, audio_recording_url, status, created_at)
    VALUES (gen_random_uuid(), ${params.sessionId ?? null}::uuid, ${params.userId}::uuid, ${params.triggerType},
            ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
            ${params.audioRecordingUrl ?? null}, 'active', now())
    RETURNING id, status, created_at AS "createdAt"`;
  if (!incident) {
    throw new AppError("INTERNAL_ERROR", "Gagal membuat insiden SOS. Silakan coba lagi.", 500);
  }
  return incident;
}

export async function cancelSos(sosId: string, userId: string, reason: string): Promise<void> {
  const affected = await prisma.$executeRaw`
    UPDATE sos_incidents SET status = 'cancelled', resolved_at = now()
    WHERE id = ${sosId}::uuid AND user_id = ${userId}::uuid AND status IN ('active', 'responded')`;
  if (affected === 0) {
    throw new AppError(
      "NOT_FOUND",
      "SOS tidak ditemukan, bukan milik Anda, atau sudah tidak aktif.",
      404,
      { reason },
    );
  }
}

export async function respondToSos(
  sosId: string,
  volunteerId: string,
  responseStatus: SosResponseStatus,
): Promise<{ id: string; sosId: string; volunteerId: string; responseStatus: string; respondedAt: Date }> {
  const incident = await prisma.sosIncident.findUnique({
    where: { id: sosId },
    select: { id: true, status: true },
  });
  if (!incident) {
    throw new AppError("NOT_FOUND", "SOS tidak ditemukan.", 404);
  }
  if (incident.status === "resolved" || incident.status === "cancelled" || incident.status === "false_alarm") {
    throw new AppError("CONFLICT", "SOS ini sudah tidak aktif, respons tidak bisa dikirim.", 409);
  }

  const response = await prisma.sosResponse.upsert({
    where: { sosId_volunteerId: { sosId, volunteerId } },
    update: { responseStatus, respondedAt: new Date() },
    create: { sosId, volunteerId, responseStatus },
  });

  if (responseStatus === "accepted" && incident.status === "active") {
    await prisma.sosIncident.update({ where: { id: sosId }, data: { status: "responded" } });
  }

  return response;
}

export async function getCaregiverIds(userId: string): Promise<string[]> {
  const links = await prisma.caregiverRelationship.findMany({
    where: { blindUserId: userId },
    select: { caregiverId: true },
  });
  return links.map((l: { caregiverId: string }) => l.caregiverId);
}

// BE-F-04-1 -- pencarian relawan radius bertingkat. Dicocokkan terhadap
// VolunteerAvailability (wilayah layanan relawan: centerPoint + radiusMeters),
// bukan lokasi GPS real-time relawan -- skema belum menyimpan itu (gap
// diketahui, lihat sos.types.ts). Tier diperbesar sampai ada kandidat atau
// tier terakhir habis, supaya SOS di area kurang relawan tetap dapat calon
// penolong alih-alih notifiedVolunteers: 0 begitu saja.
export async function findNearbyVolunteerIds(lng: number, lat: number): Promise<string[]> {
  for (const radiusM of VOLUNTEER_SEARCH_TIERS_M) {
    const rows = await prisma.$queryRaw<{ volunteerId: string }[]>`
      SELECT DISTINCT va.volunteer_id AS "volunteerId"
      FROM volunteer_availability va
      JOIN volunteer_profiles vp ON vp.user_id = va.volunteer_id
      WHERE va.is_active = TRUE
        AND vp.is_active = TRUE
        AND vp.verification_status = 'verified'
        AND ST_DWithin(
          va.center_point,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          LEAST(va.radius_meters, ${radiusM})
        )
    `;
    if (rows.length > 0) {
      return rows.map((r: { volunteerId: string }) => r.volunteerId);
    }
  }
  return [];
}

// BE-F-04-2 -- catat notifikasi ke caregiver per insiden (untuk GET /status & audit).
export async function recordCaregiverNotifications(sosId: string, caregiverIds: string[]): Promise<void> {
  if (caregiverIds.length === 0) return;
  await prisma.caregiverNotification.createMany({
    data: caregiverIds.map((caregiverId) => ({
      sosId,
      caregiverId,
      channel: "socket",
      deliveryStatus: "sent",
      sentAt: new Date(),
    })),
  });
}

interface SosStatusResult {
  id: string;
  status: string;
  escalationLevel: number;
  createdAt: Date;
  resolvedAt: Date | null;
  responders: Array<{
    id: string;
    name: string;
    status: string;
    respondedAt: Date;
  }>;
}

export async function getSosStatus(sosId: string): Promise<SosStatusResult> {
  const incident = await prisma.sosIncident.findUnique({
    where: { id: sosId },
    include: {
      responses: {
        include: { volunteer: { select: { id: true, name: true } } },
        orderBy: { respondedAt: "desc" },
      },
    },
  });
  if (!incident) {
    throw new AppError("NOT_FOUND", "SOS tidak ditemukan.", 404);
  }

  return {
    id: incident.id,
    status: incident.status,
    escalationLevel: incident.escalationLevel,
    createdAt: incident.createdAt,
    resolvedAt: incident.resolvedAt,
    responders: incident.responses.map((r: (typeof incident.responses)[number]) => ({
      id: r.volunteer.id,
      name: r.volunteer.name,
      status: r.responseStatus,
      respondedAt: r.respondedAt,
    })),
  };
}

// Dipakai controller (izin GET /status) & realtime/sos.handlers.ts (sos:respond
// via socket) -- tahu pemilik insiden tanpa menarik seluruh status.
export async function getSosOwnerId(sosId: string): Promise<string | null> {
  const incident = await prisma.sosIncident.findUnique({ where: { id: sosId }, select: { userId: true } });
  return incident?.userId ?? null;
}
