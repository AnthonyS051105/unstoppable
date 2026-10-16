// BE-F-06-6 -- dead man's switch (implementasi asli, berbasis node-cron).
// Dijalankan dari jobs/cron.ts tiap menit. Port dari backend/docs/SDD.md §9.
//
// v1.4.1 (B11, §15.3) -- ditambah aturan siklus hidup sesi: tiba otomatis,
// terlambat, cek keadaan lansia yang dijeda, terhenti, dan batas waktu. Query
// ada di sessions.service.ts; notifikasi dikirim lewat notifyInbox (kotak
// notifikasi + socket; pengganti notify()/push B13 yang di luar cakupan).
import { getIo } from "../realtime/index.js";
import { broadcastSessionCheck } from "../realtime/session.handlers.js";
import * as sessionsService from "../modules/sessions/sessions.service.js";
import * as sosService from "../modules/sos/sos.service.js";
import { notifyInbox } from "../modules/notifications/notifications.service.js";

const CHECK_THRESHOLD_MIN = 3;
const SOS_THRESHOLD_MIN = 8;

// Kirim session:ended ke pengguna + keluarga (tanpa koordinat, §15.3).
async function notifySessionEnded(s: sessionsService.EndedSession) {
  const watchers = await sessionsService.statusWatchersOf(s.userId);
  await notifyInbox([s.userId, ...watchers], {
    type: "session",
    event: "session:ended",
    title: s.endedReason === "arrived_auto" ? "Perjalanan selesai" : "Perjalanan berakhir",
    body:
      s.endedReason === "arrived_auto"
        ? `Anda tiba di ${s.destinationName ?? "tujuan"}.`
        : `Perjalanan ke ${s.destinationName ?? "tujuan"} berakhir.`,
    url: "/monitor",
    payload: { sessionId: s.sessionId, destinationName: s.destinationName, status: s.status, endedReason: s.endedReason },
  });
}

export async function checkStaleSessions(): Promise<void> {
  const io = getIo();

  // --- B11: siklus hidup sesi (dijalankan sebelum dead man's switch) ---

  // 1. Tiba otomatis -> completed/arrived_auto.
  for (const s of await sessionsService.autoEndArrivedSessions()) {
    await notifySessionEnded(s);
    console.log(`[checkStaleSessions] sesi ${s.sessionId} tiba otomatis (arrived_auto).`);
  }

  // 2. Terlambat (PRD P6) -> session:overdue ke pengguna & keluarga.
  for (const s of await sessionsService.markOverdueSessions()) {
    const watchers = await sessionsService.statusWatchersOf(s.userId);
    await notifyInbox([s.userId, ...watchers], {
      type: "session",
      event: "session:overdue",
      title: "Masih dalam perjalanan?",
      body: `Perjalanan ke ${s.destinationName ?? "tujuan"} sepertinya lebih lama dari perkiraan.`,
      url: "/monitor",
      payload: { sessionId: s.sessionId, destinationName: s.destinationName, estimatedArrival: s.estimatedArrival },
    });
  }

  // 3. Cek keadaan ke lansia yang dijeda (layar terkunci) setelah batas wajar.
  for (const s of await sessionsService.markWellbeingChecks()) {
    await notifyInbox([s.userId], {
      type: "session",
      event: "session:wellbeing-check",
      title: `Sudah sampai di ${s.destinationName ?? "tujuan"}?`,
      body: "Tekan salah satu: Sudah sampai, Saya baik-baik saja, atau Butuh bantuan.",
      url: `/monitor?session=${s.sessionId}`,
      payload: { sessionId: s.sessionId, destinationName: s.destinationName },
    });
  }

  // 4. Keluarga diberi tahu kalau cek keadaan tak dijawab (masih dijeda).
  for (const s of await sessionsService.markStalledSessions()) {
    const watchers = await sessionsService.statusWatchersOf(s.userId);
    if (watchers.length === 0) continue;
    await notifyInbox(watchers, {
      type: "session",
      event: "session:stalled",
      title: "Belum ada kabar dari perjalanan",
      body: `Aplikasi tidak aktif dan belum ada jawaban. Anda bisa menelepon atau meminta bantuan relawan.`,
      url: "/monitor",
      payload: { sessionId: s.sessionId, reason: "app_hidden", lastSeenAt: s.lastSeenAt },
    });
  }

  // 5. Batas waktu -> cancelled/timeout.
  for (const s of await sessionsService.timeoutOverrunSessions()) {
    await notifySessionEnded(s);
    console.log(`[checkStaleSessions] sesi ${s.sessionId} melewati batas waktu (timeout).`);
  }

  // --- Dead man's switch lama: hanya untuk sesi yang TIDAK dijeda ---
  // (findStaleSessions sudah mengecualikan paused_at IS NOT NULL).

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
