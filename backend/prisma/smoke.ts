// Smoke test: ORM insert + PostGIS raw query. Run: npx tsx prisma/smoke.ts
import { prisma } from "../src/config/prisma";

async function main() {
  const user = await prisma.user.create({
    data: { phoneNumber: "+6281200000000", name: "Smoke", role: "blind" },
  });

  // Spatial column: geography needs raw SQL (Unsupported type).
  await prisma.$executeRaw`
    INSERT INTO road_reports (id, reporter_id, location, category, severity, status, created_at)
    VALUES (gen_random_uuid(), ${user.id}::uuid,
            ST_SetSRID(ST_MakePoint(110.3695, -7.7710), 4326)::geography,
            'obstruction', 'high', 'active', now())`;

  const near = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM road_reports
    WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(110.37, -7.77), 4326)::geography, 500)`;

  console.assert(Number(near[0].n) === 1, "expected 1 report within 500m");
  console.log("ok: report within 500m =", Number(near[0].n));

  await prisma.user.delete({ where: { id: user.id } }); // cascades the report
  await prisma.$disconnect();
}

main();
