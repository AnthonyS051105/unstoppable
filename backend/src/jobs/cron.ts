// BE-F-06-1 -- kerangka job terjadwal. Jadwal persis tabel backend/docs/SDD.md §9.
// Satu job gagal TIDAK BOLEH menjatuhkan proses (try/catch dibungkus di sini,
// bukan diulang per file) -- lihat CLAUDE.local.md §5.6.
import cron from "node-cron";
import { escalateSos } from "./escalate-sos.job.js";
import { checkStaleSessions } from "./check-stale-sessions.job.js";
import { expireReports } from "./expire-reports.job.js";
import { cleanupLocationPings, cleanupAuditLogs, cleanupNotifications } from "./cleanup.job.js";
import {
  sendCompanionReminders,
  expireCompanionRequests,
  expireCompanionInvites,
} from "./companion-reminders.job.js";

function runJob(name: string, task: () => Promise<void>) {
  return async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[cron:${name}] gagal:`, err);
    }
  };
}

export function registerCronJobs(): void {
  cron.schedule("* * * * *", runJob("escalateSos", escalateSos));
  cron.schedule("* * * * *", runJob("checkStaleSessions", checkStaleSessions));
  cron.schedule("0 3 * * *", runJob("expireReports", expireReports));
  cron.schedule("10 3 * * *", runJob("cleanupLocationPings", cleanupLocationPings));
  cron.schedule("0 0 * * 0", runJob("cleanupAuditLogs", cleanupAuditLogs));
  cron.schedule("20 3 * * *", runJob("cleanupNotifications", cleanupNotifications)); // harian 03:20
  cron.schedule("0 * * * *", runJob("sendCompanionReminders", sendCompanionReminders)); // tiap jam
  cron.schedule("5 * * * *", runJob("expireCompanionRequests", expireCompanionRequests)); // tiap jam
  // Undangan bisa kedaluwarsa 30 menit setelah dibuat, jadi tiap jam terlalu kasar.
  cron.schedule("* * * * *", runJob("expireCompanionInvites", expireCompanionInvites));

  console.log("[cron] Semua job terjadwal terdaftar.");
}
