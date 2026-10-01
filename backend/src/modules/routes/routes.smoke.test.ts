// Smoke test murni untuk weight-builder.ts -- TIDAK butuh DB, buildCostExpression
// adalah fungsi murni (string in, string out). Jalankan: npx tsx src/modules/routes/routes.smoke.test.ts
import { buildCostExpression, clampInt, clampNumber } from "./weight-builder.js";
import type { WeightConfig } from "./routes.types.js";

const wheelchairConfig: WeightConfig = {
  baseCostPerMeter: 1.0,
  blockers: [
    { field: "hasStairs", op: "eq", value: true },
    { field: "widthCm", op: "lt", value: 90 },
    { field: "slopePercent", op: "gt", value: 12 },
  ],
  multipliers: {
    surfaceType: { paving: 1.0, keramik: 1.1, tanah: 1.8 },
    slopePercent: [
      { max: 5, factor: 1.0 },
      { max: 8, factor: 1.4 },
      { max: 12, factor: 2.5 },
    ],
  },
  penalties: { noGuidingBlock: 0, guidingBlockDamaged: 0, perStep: 0, uncovered: 5, reportDegrade: 80, reportBlock: null },
  allowedOverrides: ["maxSlopePercent", "minWidthCm"],
};

const blindConfig: WeightConfig = {
  ...wheelchairConfig,
  blockers: [],
  penalties: { noGuidingBlock: 40, guidingBlockDamaged: 80, perStep: 6, uncovered: 0, reportDegrade: 120, reportBlock: null },
  allowedOverrides: ["maxSteps"],
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

function main() {
  // 1. wheelchair: hasStairs harus jadi blocker (-1), bukan dihitung sebagai cost normal.
  const wheelchairExpr = buildCostExpression(wheelchairConfig, {});
  assert(wheelchairExpr.includes("e.has_stairs = TRUE"), "wheelchair cost expr mengandung blocker has_stairs");
  assert(wheelchairExpr.includes("THEN -1"), "wheelchair cost expr menghasilkan -1 untuk blocker");
  assert(wheelchairExpr.includes("e.width_cm < 90"), "wheelchair cost expr mengandung blocker widthCm");

  // 2. blind: TIDAK ada blocker hasStairs (tangga boleh, dengan penalti), tapi
  //    penalti noGuidingBlock & perStep harus muncul.
  const blindExpr = buildCostExpression(blindConfig, {});
  assert(!blindExpr.includes("e.has_stairs = TRUE THEN -1") , "blind cost expr TIDAK memblokir tangga total");
  assert(blindExpr.includes("has_guiding_block = FALSE THEN 40"), "blind cost expr mengandung penalti noGuidingBlock=40");
  assert(blindExpr.includes("e.step_count * 6"), "blind cost expr mengandung penalti perStep=6");

  // 3. clamp mencegah nilai ekstrem dari user masuk mentah ke SQL.
  assert(clampNumber(999, 0, 30) === 30, "clampNumber membatasi nilai besar ke max");
  assert(clampNumber(-5, 0, 30) === 0, "clampNumber membatasi nilai negatif ke min");
  assert(clampInt(4.7, 0, 50) === 5, "clampInt membulatkan nilai desimal");
  assert(clampNumber(undefined, 0, 30) === undefined, "clamp mengembalikan undefined kalau input undefined");

  // 4. tolerance override (maxSlopePercent) harus menambah blocker baru, dan
  //    nilainya sudah ter-clamp (bukan string mentah).
  const overriddenExpr = buildCostExpression(wheelchairConfig, { maxSlopePercent: 8 });
  assert(overriddenExpr.includes("e.slope_percent > 8"), "override maxSlopePercent=8 masuk sebagai blocker baru");

  // 5. field blocker tak dikenal harus melempar error (data seed salah,
  //    bukan diam-diam diabaikan).
  try {
    buildCostExpression({ ...wheelchairConfig, blockers: [{ field: "unknownField", op: "eq", value: true }] }, {});
    assert(false, "field blocker tak dikenal seharusnya melempar error");
  } catch {
    assert(true, "field blocker tak dikenal melempar error sesuai harapan");
  }

  if (process.exitCode === 1) {
    console.error("\nSmoke test weight-builder.ts GAGAL.");
  } else {
    console.log("\nSemua assertion weight-builder.ts lulus.");
  }
}

main();
