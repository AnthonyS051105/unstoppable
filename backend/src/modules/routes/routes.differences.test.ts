// Unit test MURNI (vitest, tanpa DB) untuk logika diff /routes/compare
// (docs/API_CONTRACT.md §5). buildDifferences & buildEntranceDifferences adalah
// fungsi murni -- aman diuji tanpa koneksi Supabase.
import { describe, it, expect } from "vitest";
import { buildDifferences, buildEntranceDifferences } from "./routes.differences.js";
import type { CompareResultEntry } from "./routes.types.js";

function reachable(profileId: string, edgeIds: string[], totalDistanceM = 100): CompareResultEntry {
  return { profileId, label: profileId, reachable: true, edgeIds, totalDistanceM, steps: [], barriers: [] };
}

describe("buildEntranceDifferences", () => {
  it("menandai different_entrance saat edge masuk terakhir berbeda antar profil", () => {
    const diffs = buildEntranceDifferences([
      reachable("wheelchair", ["101", "102", "117"]),
      reachable("blind", ["101", "109", "118"]),
    ]);
    const entrance = diffs.filter((d) => d.type === "different_entrance");
    expect(entrance).toHaveLength(1);
    expect(entrance[0]!.edgeId).toBe("118"); // edge masuk terakhir profil kedua
    expect(entrance[0]!.profileId).toBe("wheelchair");
    expect(entrance[0]!.avoidedByProfileId).toBe("blind");
    expect(entrance[0]!.reason).toContain("titik masuk yang berbeda");
  });

  it("TIDAK menandai different_entrance saat edge masuk terakhir sama", () => {
    const diffs = buildEntranceDifferences([
      reachable("wheelchair", ["101", "102", "117"]),
      reachable("blind", ["105", "117"]), // beda rute, tapi masuk lewat edge 117 yang sama
    ]);
    expect(diffs.filter((d) => d.type === "different_entrance")).toHaveLength(0);
  });

  it("hanya menghasilkan satu entry per pasang (bukan cermin dua arah)", () => {
    const diffs = buildEntranceDifferences([
      reachable("a", ["1", "2"]),
      reachable("b", ["1", "3"]),
      reachable("c", ["1", "4"]),
    ]);
    // 3 profil -> 3 pasang unik (a-b, a-c, b-c), semuanya beda edge terakhir.
    expect(diffs.filter((d) => d.type === "different_entrance")).toHaveLength(3);
  });
});

describe("buildDifferences", () => {
  it("dua hasil tanpa ruas tidak mengarang hambatan atau perbedaan pintu masuk", () => {
    const results = [reachable("wheelchair", [], 0), reachable("blind", [], 0)];
    for (const result of results) {
      result.steps = [{
        order: 1,
        edgeId: null,
        attributes: null,
        instruction: "Asal dan tujuan terpetakan ke titik yang sama. Periksa kembali titik yang Anda pilih.",
        distanceM: 0,
        warnings: [],
      }];
    }
    expect(buildDifferences(results)).toEqual([]);
  });

  it("langkah nullable tetap kompatibel dengan perbandingan ruas bertangga", () => {
    const wheelchair = reachable("wheelchair", ["101", "117"]);
    const blind = reachable("blind", ["101", "118"]);
    blind.steps = [
      { order: 1, edgeId: null, attributes: null, instruction: "[DEV] Penjelasan tanpa ruas", distanceM: 0, warnings: [] },
      {
        order: 2, edgeId: "118", instruction: "[DEV] Tangga uji", distanceM: 10,
        attributes: { surfaceType: "paving", isIndoor: true, hasStairs: true, slopePercent: 0 }, warnings: [],
      },
    ];
    const differences = buildDifferences([wheelchair, blind]);
    expect(differences.filter((d) => d.type === "avoided_edge")).toEqual([
      expect.objectContaining({ edgeId: "118", avoidedByProfileId: "wheelchair" }),
    ]);
    expect(differences.some((d) => d.edgeId === null)).toBe(false);
  });

  it("menyertakan unreachable + different_entrance dalam satu hasil gabungan", () => {
    const diffs = buildDifferences([
      reachable("wheelchair", ["101", "117"]),
      reachable("blind", ["101", "118"]),
      {
        profileId: "crutches",
        label: "crutches",
        reachable: false,
        reasons: [{ type: "no_lift", message: "Gedung tujuan tidak memiliki lift." }],
      },
    ]);
    expect(diffs.some((d) => d.type === "unreachable" && d.profileId === "crutches")).toBe(true);
    expect(diffs.some((d) => d.type === "different_entrance")).toBe(true);
  });

  it("different_entrance tetap bagian dari enum DifferenceType kontrak §5", () => {
    const diffs = buildDifferences([
      reachable("a", ["1", "2"]),
      reachable("b", ["1", "9"]),
    ]);
    const types = new Set(diffs.map((d) => d.type));
    expect(types.has("different_entrance")).toBe(true);
  });
});
