// !! DATA DUMMY UNTUK DEVELOPMENT LOKAL -- BUKAN HASIL SURVEI LAPANGAN !!
// Koordinat & kondisi di bawah DIKARANG untuk menguji auto-link radius 15 m
// dan endpoint nearby/along-route secara lokal. Jangan pernah dijalankan
// terhadap database produksi/staging -- lihat CLAUDE.md §5.3 &
// docs/DATA_MODEL.md §6.3 ("*.dev.seed.ts" wajib surveyedAt = null).
//
// Prasyarat: jalankan accessibility-profiles.seed.ts dan pilot-area.seed.ts
// (untuk path_edges/path_nodes) dulu -- seed ini butuh minimal satu edge
// approved untuk didemokan auto-link-nya.
//
// Jalankan: npx tsx prisma/road-reports.dev.seed.ts
import { prisma } from "../src/config/prisma.js";

async function main() {
  const reporter = await prisma.user.findFirst({ where: { role: "mobility_user" } });
  const nearestEdge = await prisma.$queryRaw<{ id: bigint; lng: number; lat: number }[]>`
    SELECT id, ST_X(ST_StartPoint(geometry::geometry)) AS lng, ST_Y(ST_StartPoint(geometry::geometry)) AS lat
    FROM path_edges
    WHERE status = 'approved'
    LIMIT 1
  `;

  if (!reporter || nearestEdge.length === 0) {
    console.log("[dev.seed] Lewati road-reports.dev.seed: butuh minimal 1 user & 1 path_edge approved.");
    return;
  }

  const edge = nearestEdge[0]!;

  // Titik ini sengaja digeser sedikit (~5-10 m) dari titik awal edge supaya
  // menguji auto-link ST_DWithin 15 m, bukan menempel persis di edge.
  await prisma.$executeRaw`
    INSERT INTO road_reports (id, reporter_id, location, category, severity, description, status, created_at)
    VALUES (
      gen_random_uuid(),
      ${reporter.id}::uuid,
      ST_SetSRID(ST_MakePoint(${edge.lng + 0.00008}, ${edge.lat + 0.00005}), 4326)::geography,
      'terhalang',
      'medium',
      '[DATA DUMMY DEV] Motor parkir menghalangi jalur -- bukan laporan asli.',
      'active',
      now()
    )
  `;

  console.log("[dev.seed] 1 dummy road report dibuat dekat path_edge #%s.", edge.id);
}

main()
  .catch((err) => {
    console.error("[dev.seed] Gagal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
