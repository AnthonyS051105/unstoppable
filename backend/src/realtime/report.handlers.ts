// Report realtime gateway -- docs/API_CONTRACT.md §15.3 report:nearby.
// Dipanggil dari modules/reports/reports.controller.ts setelah laporan baru
// tersimpan (pola sama dengan sos.handlers.ts: controller memanggil helper di
// sini, bukan sebaliknya). Tidak ada event client->server untuk kategori ini.
import type { Server } from "socket.io";

export interface ReportNearbyPayload {
  reportId: string;
  coordinates: [number, number];
  category: string;
  severity: string;
}

// §15.3 report:nearby -- { reportId, coordinates, category, severity } ke
// pengguna yang sedang dalam perjalanan (sesi aktif) di sekitar lokasi laporan.
// userIds sudah difilter di sessions.service#findActiveSessionUsersNear sebelum
// sampai sini (termasuk mengecualikan pelapor). Dikirim ke room personal
// user:{id} supaya menjangkau semua perangkat pengguna (konvensi room §15.1).
export function broadcastReportNearby(io: Server, userIds: string[], payload: ReportNearbyPayload) {
  for (const id of userIds) {
    io.to(`user:${id}`).emit("report:nearby", payload);
  }
}
