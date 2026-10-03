import { describe, it, expect } from "vitest";
import { computeScore } from "./buildings.score.js";
import type { GraphStats } from "./buildings.types.js";

const building = { floorCount: 3, hasLift: true, hasAccessibleToilet: true };
const fullStats: GraphStats = {
  entranceCount: 4,
  stairFreeEntranceCount: 2,
  liftFloorCount: 3,
  measuredEdgeCount: 10,
  compliantEdgeCount: 8,
};

describe("computeScore", () => {
  it("menghitung skor berbobot 30/30/25/15 sesuai SDD §10", () => {
    const { accessibilityScore, scoreBreakdown } = computeScore(building, fullStats);

    expect(scoreBreakdown.entrance.score).toBe(50);
    expect(scoreBreakdown.verticalAccess.score).toBe(100);
    expect(scoreBreakdown.paths.score).toBe(80);
    expect(scoreBreakdown.facilities.score).toBe(100);
    expect(accessibilityScore).toBe(80); // 50*.3 + 100*.3 + 80*.25 + 100*.15
  });

  it.each([
    [{ liftFloorCount: 2 }, 50],
    [{ liftFloorCount: 3 }, 100],
  ])("verticalAccess dengan lift %o -> %i", (override, expected) => {
    const { scoreBreakdown } = computeScore(building, { ...fullStats, ...override });
    expect(scoreBreakdown.verticalAccess.score).toBe(expected);
  });

  it("verticalAccess 0 untuk gedung bertingkat tanpa lift, 100 untuk satu lantai", () => {
    expect(computeScore({ ...building, hasLift: false }, fullStats).scoreBreakdown.verticalAccess.score).toBe(0);
    expect(computeScore({ ...building, floorCount: 1, hasLift: false }, fullStats).scoreBreakdown.verticalAccess.score).toBe(100);
  });

  it("facilities 0 kalau tidak ada toilet difabel", () => {
    const { scoreBreakdown } = computeScore({ ...building, hasAccessibleToilet: false }, fullStats);
    expect(scoreBreakdown.facilities.score).toBe(0);
  });

  it("aspek tanpa data graf bernilai null dan membuat total null, bukan 0", () => {
    const emptyGraph: GraphStats = {
      entranceCount: 0,
      stairFreeEntranceCount: 0,
      liftFloorCount: 0,
      measuredEdgeCount: 0,
      compliantEdgeCount: 0,
    };
    const { accessibilityScore, scoreBreakdown } = computeScore(building, emptyGraph);

    expect(scoreBreakdown.entrance.score).toBeNull();
    expect(scoreBreakdown.paths.score).toBeNull();
    expect(scoreBreakdown.verticalAccess.score).toBeNull();
    expect(accessibilityScore).toBeNull();
  });
});
