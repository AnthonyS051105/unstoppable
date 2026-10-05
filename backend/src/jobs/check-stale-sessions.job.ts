// BE-F-06-6 -- dead man's switch (implementasi asli, berbasis node-cron).
// Dijalankan dari jobs/cron.ts tiap menit. Port dari backend/docs/SDD.md §9.
import { getIo } from "../realtime/index.js";
import { broadcastSessionCheck } from "../realtime/session.handlers.js";
import * as sessionsService from "../modules/sessions/sessions.service.js";
import * as sosService from "../modules/sos/sos.service.js";

const CHECK_THRESHOLD_MIN = 3;
const SOS_THRESHOLD_MIN = 8;

export async function checkStaleSessions(): Promise<void> {
  const io = getIo();

  // Threshold 8 menit dulu (lebih diam) -- supaya sesi yang sudah lewat 8
  // menit tidak lagi mendapat session:check 3-menit di run yang sama.
  const criticallyStale = await sessionsService.findStaleSessions(SOS_THRESHOLD_MIN);
  for (const session of criticallyStale) {
    const alreadyTriggered = await sosService.hasActiveDeadManSwitchSos(session.id);
    if (alreadyTriggered) continue; // idempoten -- jangan trigger SOS berulang tiap menit

    const lng = session.lastPingLng ?? session.originLng;
    const lat = session.lastPingLat ?? session.originLat;
    await sosService.triggerSos({
      userId: session.userId,
      sessionId: session.id,
      triggerType: "dead_man_switch",
      lng,
      lat,
      audioRecordingUrl: undefined,
    });
    console.log(`[checkStaleSessions] SOS dead_man_switch dipicu untuk sesi ${session.id}.`);
  }

  const criticalIds = new Set(criticallyStale.map((s) => s.id));
  const mildlyStale = await sessionsService.findStaleSessions(CHECK_THRESHOLD_MIN);
  for (const session of mildlyStale) {
    if (criticalIds.has(session.id)) continue; // sudah ditangani sebagai SOS di atas
    broadcastSessionCheck(io, session.id, {
      sessionId: session.id,
      message: "Belum ada pembaruan lokasi dari sesi perjalanan ini.",
    });
  }
}
