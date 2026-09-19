import { prisma } from "../config/prisma.js";

export async function triggerSos(userId: string, opts: {
  sessionId?: string;
  triggerType: string; // "manual" | "fall_detection" | "dead_man_switch"
  lat: number;
  lng: number;
  audioRecordingUrl?: string;
}) {
  const [incident] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO sos_incidents (id, session_id, user_id, trigger_type, location, audio_recording_url, status, created_at)
    VALUES (gen_random_uuid(), ${opts.sessionId ?? null}::uuid, ${userId}::uuid, ${opts.triggerType},
            ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography,
            ${opts.audioRecordingUrl ?? null}, 'active', now())
    RETURNING id`;
  return incident;
}

export async function cancelSos(sosId: string, userId: string) {
  return prisma.$executeRaw`
    UPDATE sos_incidents SET status = 'cancelled', resolved_at = now()
    WHERE id = ${sosId}::uuid AND user_id = ${userId}::uuid AND status = 'active'`;
}

export async function respondToSos(sosId: string, volunteerId: string, status: string) {
  return prisma.sosResponse.create({
    data: { sosId, volunteerId, responseStatus: status },
  });
}

export async function getCaregiverIds(userId: string): Promise<string[]> {
  const links = await prisma.caregiverRelationship.findMany({
    where: { blindUserId: userId },
    select: { caregiverId: true },
  });
  return links.map((l: { caregiverId: string }) => l.caregiverId);
}

export async function getSosStatus(sosId: string) {
  return prisma.sosIncident.findUnique({
    where: { id: sosId },
    include: { responses: true, notifications: true },
  });
}
