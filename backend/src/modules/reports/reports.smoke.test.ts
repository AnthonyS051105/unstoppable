// Smoke test — endpoint corroborate laporan (docs/API_CONTRACT.md §9, task 5).
// Script manual (butuh DB Supabase nyata), DIKECUALIKAN dari `npm test`/vitest
// (lihat vitest.config.ts) — jalankan dengan: npx tsx src/modules/reports/reports.smoke.test.ts
//
// Memverifikasi tiga kasus corroborateReport():
//   1. User lain menguatkan        -> sukses, corroborationCount naik (1 -> 2)
//   2. User sama menguatkan lagi    -> 409 CONFLICT (unique-violation 23505)
//   3. Pelapor menguatkan sendiri   -> 403 FORBIDDEN
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import * as reportsService from "./reports.service.js";

async function runSmokeTest() {
  console.log("Starting corroborate reports smoke test...\n");

  const reporter = await prisma.user.create({
    data: {
      phoneNumber: "+6281299991001",
      name: "Smoke Test Reporter",
      role: "blind_user",
    },
  });

  const corroborator = await prisma.user.create({
    data: {
      phoneNumber: "+6281299991002",
      name: "Smoke Test Corroborator",
      role: "volunteer",
    },
  });

  console.log(`[PASS] Test users created: ${reporter.name} and ${corroborator.name}`);

  // road_reports.location = geography -> harus lewat raw SQL (lihat schema.prisma).
  // corroboration_count default 1 (pelapor pertama), jadi setelah 1 penguatan
  // independen harus jadi 2.
  const [report] = await prisma.$queryRaw<{ id: string; corroborationCount: number }[]>`
    INSERT INTO road_reports (id, reporter_id, location, category, severity, description, status, corroboration_count, created_at)
    VALUES (
      gen_random_uuid(),
      ${reporter.id}::uuid,
      ST_SetSRID(ST_MakePoint(110.3730, -7.7695), 4326)::geography,
      'terhalang', 'medium', 'Smoke test report untuk corroborate', 'active', 1, now()
    )
    RETURNING id, corroboration_count AS "corroborationCount"
  `;
  const reportId = report!.id;
  console.log(`[PASS] Road report created (id=${reportId}), corroborationCount=${report!.corroborationCount}`);

  let failures = 0;

  try {
    // --- Kasus 1: user lain menguatkan -> sukses, count naik ke 2 ---
    const result = await reportsService.corroborateReport(reportId, corroborator.id);
    if (result.corroborationCount === 2) {
      console.log(`[PASS] Case 1: first corroborate OK, corroborationCount=${result.corroborationCount}`);
    } else {
      failures++;
      console.error(`[FAIL] Case 1: expected corroborationCount=2, got ${result.corroborationCount}`);
    }

    // --- Kasus 2: user sama menguatkan lagi -> 409 CONFLICT ---
    try {
      await reportsService.corroborateReport(reportId, corroborator.id);
      failures++;
      console.error("[FAIL] Case 2: expected a CONFLICT error, but call succeeded");
    } catch (err) {
      if (err instanceof AppError && err.code === "CONFLICT" && err.httpStatus === 409) {
        console.log("[PASS] Case 2: second corroborate by same user -> 409 CONFLICT");
      } else {
        failures++;
        console.error("[FAIL] Case 2: expected AppError CONFLICT/409, got:", err);
      }
    }

    // --- Kasus 3: pelapor menguatkan laporannya sendiri -> 403 FORBIDDEN ---
    try {
      await reportsService.corroborateReport(reportId, reporter.id);
      failures++;
      console.error("[FAIL] Case 3: expected a FORBIDDEN error, but call succeeded");
    } catch (err) {
      if (err instanceof AppError && err.code === "FORBIDDEN" && err.httpStatus === 403) {
        console.log("[PASS] Case 3: corroborate own report -> 403 FORBIDDEN");
      } else {
        failures++;
        console.error("[FAIL] Case 3: expected AppError FORBIDDEN/403, got:", err);
      }
    }

    // Count tidak boleh berubah akibat kasus 2 & 3 (keduanya gagal sebelum UPDATE).
    const [after] = await prisma.$queryRaw<{ corroborationCount: number }[]>`
      SELECT corroboration_count AS "corroborationCount" FROM road_reports WHERE id = ${reportId}::uuid
    `;
    if (after!.corroborationCount === 2) {
      console.log(`[PASS] corroborationCount still 2 after failed attempts (no double count)`);
    } else {
      failures++;
      console.error(`[FAIL] expected corroborationCount=2 after failures, got ${after!.corroborationCount}`);
    }

    if (failures === 0) {
      console.log("\n[SUCCESS] All corroborate smoke tests passed (OK / 409 / 403).");
    } else {
      throw new Error(`${failures} smoke assertion(s) failed`);
    }
  } finally {
    // Hapus report dulu (report_user_corroborations ikut terhapus via ON DELETE CASCADE),
    // lalu users.
    await prisma.$executeRaw`DELETE FROM road_reports WHERE id = ${reportId}::uuid`;
    await prisma.user.deleteMany({
      where: { id: { in: [reporter.id, corroborator.id] } },
    });
    await prisma.$disconnect();
    console.log("[CLEANUP] Test data cleaned up.");
  }
}

runSmokeTest().catch((err) => {
  console.error("[FAIL] Smoke test failed with error:", err);
  process.exit(1);
});
