// BE-F-06-3 + BE-F-06-4 (separuh) -- SDD §9, tiap jam. companions.service.ts
// sudah selesai (modul Sofi) -- job ini hanya memanggilnya, tidak query Prisma
// langsung (pola sama dengan expire-reports.job.ts, check-stale-sessions.job.ts).
import { prisma } from "../config/prisma.js";
import { getIo } from "../realtime/index.js";
import * as companionsService from "../modules/companions/companions.service.js";

const REMINDER_WINDOW_HOURS = 24;
const REMINDER_ACTION = "companion.reminder_sent";

// Tidak ada kolom "reminder sudah dikirim" di skema (CompanionRequest) --
// perubahan skema lintas-tim, bukan keputusan sepihak di sini. audit_logs
// dipakai sebagai penanda idempotensi (SDD §9: "tandai agar tidak dobel"),
// sama pola dengan perbaikan recordCaregiverNotifications sebelumnya.
async function alreadyReminded(requestId: string): Promise<boolean> {
  const existing = await prisma.auditLog.findFirst({
    where: { action: REMINDER_ACTION, resourceId: requestId },
    select: { id: true },
  });
  return existing !== null;
}

export async function sendCompanionReminders(): Promise<void> {
  const upcoming = await companionsService.findUpcomingConfirmed(REMINDER_WINDOW_HOURS);
  const io = getIo();

  for (const request of upcoming) {
    if (await alreadyReminded(request.id)) continue;

    const payload = { requestId: request.id, scheduledStart: request.scheduledStart.toISOString() };
    io.to(`user:${request.requesterId}`).emit("companion:reminder", payload);
    io.to(`user:${request.selectedVolunteerId}`).emit("companion:reminder", payload);

    await prisma.auditLog.create({
      data: { action: REMINDER_ACTION, resourceType: "companion_request", resourceId: request.id },
    });
  }
}

export async function expireCompanionRequests(): Promise<void> {
  const affected = await companionsService.expireOverdueRequests();
  console.log(`[expireCompanionRequests] ${affected} permintaan pendampingan ditandai expired.`);
}
