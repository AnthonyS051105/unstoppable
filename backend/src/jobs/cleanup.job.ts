// BE-F-06-5 -- SDD §9. Operasi generik lintas-modul (hapus data lama
// berdasarkan umur), tidak ada logika bisnis modul tertentu di sini -- raw SQL
// langsung, pola sama seperti graph.service.ts memanggil pgr_connectedComponents
// tanpa perantara modul lain.
import { prisma } from "../config/prisma.js";

export async function cleanupLocationPings(): Promise<void> {
  const affected = await prisma.$executeRaw`
    DELETE FROM location_pings WHERE recorded_at < now() - interval '7 days'
  `;
  console.log(`[cleanupLocationPings] ${affected} location ping dihapus.`);
}

export async function cleanupAuditLogs(): Promise<void> {
  const affected = await prisma.$executeRaw`
    DELETE FROM audit_logs WHERE created_at < now() - interval '90 days'
  `;
  console.log(`[cleanupAuditLogs] ${affected} audit log dihapus.`);
}
