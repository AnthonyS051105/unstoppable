// Konstanta domain laporan jalan. Nilai enum sinkron dengan docs/GLOSSARY.md
// §3 (road_reports.category / severity, Bahasa Indonesia — pengecualian sadar
// atas konvensi enum berbahasa Inggris, lihat catatan di GLOSSARY.md) dan
// docs/API_CONTRACT.md §9.
export const REPORT_CATEGORIES = [
  "guiding_block_rusak",
  "guiding_block_hilang",
  "terhalang",
  "konstruksi",
  "lift_rusak",
  "ramp_terhalang",
  "permukaan_rusak",
  "genangan",
  "tanpa_penyeberangan",
  "lainnya",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_SEVERITIES = ["low", "medium", "high"] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export const REPORT_STATUSES = ["active", "resolved", "rejected", "expired"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_EDGE_LINK_EFFECTS = ["block", "degrade", "info"] as const;
export type ReportEdgeLinkEffect = (typeof REPORT_EDGE_LINK_EFFECTS)[number];

// Radius auto-link ke edge/node terdekat (docs/API_CONTRACT.md §9,
// pola ST_DWithin di docs/DATA_MODEL.md §4.4).
export const REPORT_LINK_RADIUS_M = 15;

// ---------------------------------------------------------------------------
// Durasi expiresAt per kategori.
//
// CATATAN (keputusan provisional, BUKAN dari dokumen): docs/DATA_MODEL.md §7
// hanya menyebut aturan umum "Obstruksi 7 hari, kerusakan struktural tidak
// kedaluwarsa" — tidak ada tabel durasi per kategori di API_CONTRACT.md,
// DATA_MODEL.md, maupun GLOSSARY.md. Pemetaan di bawah adalah penalaran saya:
// kategori yang sifatnya SEMENTARA/situasional (bisa hilang sendiri) dapat
// durasi; kategori KERUSAKAN STRUKTURAL (butuh perbaikan aktif pengelola
// gedung/kampus) tidak expire otomatis -- ditutup manual lewat verifikasi.
// WAJIB dikonfirmasi ke tim (terutama Nael, pemilik antrean verifikasi)
// sebelum dianggap final -- lihat catatan yang sama di reports.service.ts.
const EXPIRY_HOURS_BY_CATEGORY: Partial<Record<ReportCategory, number>> = {
  terhalang: 7 * 24, // motor parkir, barang -- biasanya dipindah dlm hitungan hari
  genangan: 24, // genangan air -- umumnya surut dlm 1 hari
  konstruksi: 30 * 24, // proyek konstruksi -- biasanya berminggu-minggu
  // guiding_block_rusak, guiding_block_hilang, lift_rusak, ramp_terhalang,
  // permukaan_rusak, tanpa_penyeberangan, lainnya -- TIDAK di-set di sini
  // -> tidak expire otomatis (kerusakan struktural, ditutup manual).
};

export function computeExpiresAt(category: ReportCategory, from: Date = new Date()): Date | null {
  const hours = EXPIRY_HOURS_BY_CATEGORY[category];
  if (!hours) return null;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
