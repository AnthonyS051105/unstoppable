// Unit test MURNI (vitest, tanpa DB) untuk weight-builder.ts -- fokus Task 16a/16b:
// override toleranceOverrides pakai kunci snake_case yang SAMA PERSIS dengan
// weightConfig.allowedOverrides (satu sumber kebenaran, kontrak §4 + DATA_MODEL §3).
// Test ini akan GAGAL bila penamaan allowedOverrides<->tolerance mismatch lagi
// (override tak pernah berlaku) atau bila allowedOverrides memuat kunci tak dikenal
// yang diabaikan diam-diam alih-alih fail-fast.
import { describe, it, expect } from "vitest";
import { buildCostExpression } from "./weight-builder.js";
import { OVERRIDE_KEYS } from "./routes.types.js";
import type { WeightConfig } from "./routes.types.js";

const baseConfig: WeightConfig = {
  baseCostPerMeter: 1.0,
  blockers: [],
  multipliers: {
    surfaceType: { paving: 1.0 },
    slopePercent: [{ max: 12, factor: 2.5 }],
  },
  penalties: {
    noGuidingBlock: 0,
    guidingBlockDamaged: 0,
    perStep: 0,
    uncovered: 5,
    reportDegrade: 80,
    reportBlock: null,
  },
  allowedOverrides: [],
};

describe("weight-builder override (snake_case, Task 16a/16b)", () => {
  it("max_slope_percent yang diizinkan BENAR-BENAR menghasilkan blocker baru di SQL", () => {
    const cfg: WeightConfig = { ...baseConfig, allowedOverrides: ["max_slope_percent"] };
    const expr = buildCostExpression(cfg, { max_slope_percent: 8 });
    expect(expr).toContain("e.slope_percent > 8");
  });

  it("min_width_cm yang diizinkan menghasilkan blocker lebar minimum", () => {
    const cfg: WeightConfig = { ...baseConfig, allowedOverrides: ["min_width_cm"] };
    const expr = buildCostExpression(cfg, { min_width_cm: 90 });
    expect(expr).toContain("e.width_cm < 90");
  });

  it("avoid_uncovered yang diizinkan menambah blocker is_covered = FALSE", () => {
    const cfg: WeightConfig = { ...baseConfig, allowedOverrides: ["avoid_uncovered"] };
    const expr = buildCostExpression(cfg, { avoid_uncovered: true });
    expect(expr).toContain("e.is_covered = FALSE");
  });

  it("override TIDAK berlaku kalau kunci tidak ada di allowedOverrides", () => {
    // allowedOverrides kosong -> walau user mengirim max_slope_percent, blocker
    // tidak boleh muncul. Ini juga yang menjaga agar override liar tak diterapkan.
    const expr = buildCostExpression(baseConfig, { max_slope_percent: 8 });
    expect(expr).not.toContain("e.slope_percent > 8");
  });

  it("REGRESI mismatch: kunci camelCase lama di tolerance TIDAK berlaku (harus snake_case)", () => {
    // Sebelum Task 16, allowedOverrides camelCase vs tolerance snake_case bisa
    // mismatch senyap. Sekarang keduanya snake_case; mengirim bentuk camelCase
    // lama (sebagai objek asing) tidak boleh menghasilkan blocker apa pun.
    const cfg: WeightConfig = { ...baseConfig, allowedOverrides: ["max_slope_percent"] };
    const expr = buildCostExpression(cfg, { maxSlopePercent: 8 } as unknown as never);
    expect(expr).not.toContain("e.slope_percent > 8");
  });

  it("FAIL-FAST: allowedOverrides berisi kunci tak dikenal harus melempar error (data seed salah)", () => {
    const bad: WeightConfig = {
      ...baseConfig,
      allowedOverrides: ["maxSlopePercent" as unknown as never], // camelCase lama = tak dikenal sekarang
    };
    expect(() => buildCostExpression(bad, {})).toThrowError(/unknown allowedOverrides key/);
  });

  it("OVERRIDE_KEYS adalah satu-satunya daftar kunci valid (snake_case, kontrak §4)", () => {
    expect([...OVERRIDE_KEYS]).toEqual(["max_steps", "max_slope_percent", "min_width_cm", "avoid_uncovered"]);
  });
});
