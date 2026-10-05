// Unit test MURNI (vitest, tanpa DB) untuk integrasi includeNarration di
// /routes/plan (docs/API_CONTRACT.md §5). planRoute() butuh graf Supabase, jadi
// di sini kita menguji KONTRAK integrasinya: Route Service menyusun `narration`
// dari steps[] dengan memanggil Narration Service (buildNarration) secara
// langsung -- bentuk steps yang dipakai persis seperti yang dibangun
// routes.service.ts (order/instruction/distanceM/warnings).
import { describe, it, expect } from "vitest";
import { buildNarration } from "../narration/narration.service.js";
import type { RouteStep } from "./routes.types.js";

// Steps bentuk RouteStep (seperti keluaran step-builder.ts) -> dipetakan ke
// input narration persis seperti di planRoute().
const steps: RouteStep[] = [
  {
    order: 1,
    edgeId: "101",
    instruction: "Jalan lurus 40 meter menyusuri koridor beratap.",
    distanceM: 40,
    attributes: { surfaceType: "keramik", isIndoor: true, hasStairs: false, slopePercent: 0 },
    warnings: [],
  },
  {
    order: 2,
    edgeId: "102",
    instruction: "Naik ramp landai 12 meter ke pintu timur.",
    distanceM: 12,
    attributes: { surfaceType: "beton", isIndoor: false, hasStairs: false, slopePercent: 6.5 },
    warnings: [],
  },
];

function narrationFromSteps(input: RouteStep[], profileId: string): string {
  return buildNarration({
    steps: input.map((s) => ({
      order: s.order,
      instruction: s.instruction,
      distanceM: s.distanceM,
      warnings: s.warnings,
    })),
    profileId,
  }).narration;
}

describe("includeNarration integration (planRoute -> buildNarration)", () => {
  it("menghasilkan narasi non-kosong dari steps[] saat includeNarration true", () => {
    const narration = narrationFromSteps(steps, "wheelchair");
    expect(narration.length).toBeGreaterThan(0);
    // Fakta (angka jarak) berasal dari data, tidak dikarang.
    expect(narration).toContain("40 meter");
    expect(narration).toContain("12 meter");
    // Kalimat pertama tanpa prefix transisi, kalimat lanjutan diberi transisi.
    expect(narration.startsWith("Jalan lurus 40 meter")).toBe(true);
  });
});
