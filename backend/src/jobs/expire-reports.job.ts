// BE-F-06-4 (separuh) -- SDD §9, harian 03:00.
import { expireOverdueReports } from "../modules/reports/reports.service.js";

export async function expireReports(): Promise<void> {
  const affected = await expireOverdueReports();
  console.log(`[expireReports] ${affected} laporan ditandai expired.`);
}
