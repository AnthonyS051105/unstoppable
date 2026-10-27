import { describe, expect, it } from "vitest";
import { orientEdge } from "./route-direction.js";
import type { PathEdgeRow } from "./routes.types.js";

const edge: PathEdgeRow = {
  edgeId: 9007199254740993n, sourceNodeId: 1n, targetNodeId: 2n,
  geometry: { type: "LineString", coordinates: [[110.3718, -7.7655], [110.3733, -7.7659], [110.374, -7.7662]] },
  lengthM: 255,
  attributes: { surfaceType: "aspal", widthCm: 150, hasStairs: false, stepCount: 0, slopePercent: 3, hasGuidingBlock: true, guidingBlockCondition: "baik", hasHandrail: false, isCovered: false, isIndoor: false, isOneWay: false },
  activeReport: null,
};

describe("route edge traversal", () => {
  it("orients reverse traversal for the geometry and the first spoken step without mutating stored data", () => {
    const reversed = orientEdge(edge, 2n);
    expect(reversed.geometry.coordinates).toEqual([[110.374, -7.7662], [110.3733, -7.7659], [110.3718, -7.7655]]);
    expect(reversed.sourceNodeId).toBe(2n);
    expect(reversed.targetNodeId).toBe(1n);
    expect(reversed.edgeId).toBe(9007199254740993n);
    expect(edge.geometry.coordinates[0]).toEqual([110.3718, -7.7655]);
    expect(edge.sourceNodeId).toBe(1n);
  });
  it("keeps forward traversal unchanged", () => {
    expect(orientEdge(edge, 1n)).toEqual(edge);
  });
});
