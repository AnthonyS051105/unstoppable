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
