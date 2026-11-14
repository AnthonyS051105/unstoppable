import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoJsonPoint, WeightConfig } from "./routes.types.js";

const db = vi.hoisted(() => ({ query: vi.fn(), building: vi.fn(), profiles: vi.fn(), config: vi.fn() }));
vi.mock("../../config/prisma.js", () => ({ prisma: { $queryRaw: db.query, building: { findUnique: db.building } } }));
vi.mock("../accessibility-profiles/accessibility-profiles.service.js", () => ({
  getUserAccessibility: db.profiles,
  getProfileWeightConfig: db.config,
}));
import { planRoute } from "./routes.service.js";

// [DEV] fixtures; no database or surveyed data is used by this suite.
const origin: GeoJsonPoint = { type: "Point", coordinates: [110.3718, -7.7655] };
const destination: GeoJsonPoint = { type: "Point", coordinates: [110.374, -7.7662] };
const alternative: GeoJsonPoint = { type: "Point", coordinates: [110.3738, -7.766] };
const wheelchair: WeightConfig = {
  baseCostPerMeter: 1,
  blockers: [{ field: "hasStairs", op: "eq", value: true }],
  multipliers: { surfaceType: { aspal: 1 }, slopePercent: [{ max: 8, factor: 1 }] },
  penalties: { noGuidingBlock: 0, guidingBlockDamaged: 0, perStep: 0, uncovered: 0, reportDegrade: 80, reportBlock: null },
  allowedOverrides: ["max_slope_percent"],
};

type Query = { text: string; values: unknown[] };
function queryOf(first: TemplateStringsArray | { sql: string; values: unknown[] }, rest: unknown[]): Query {
  return Array.isArray(first)
    ? { text: first.join(" ? "), values: rest }
    : { text: (first as { sql: string }).sql, values: (first as { values: unknown[] }).values };
}
const queries: Query[] = [];
let sourceExists = true;
let candidates: { id: bigint; geojson: string }[] = [];
let paths: Map<bigint, boolean>;
let stairsOnLoosePath = false;

beforeEach(() => {
  vi.resetAllMocks();
  queries.length = 0;
  sourceExists = true;
  candidates = [];
  paths = new Map();
  stairsOnLoosePath = false;
  db.profiles.mockResolvedValue([{ profileId: "wheelchair", isPrimary: true, toleranceOverrides: { max_slope_percent: 8 } }]);
  db.config.mockResolvedValue({ label: "[DEV] Kursi roda", weightConfig: wheelchair });
  db.building.mockResolvedValue({ hasLift: false });
  db.query.mockImplementation((first, ...rest) => {
    const q = queryOf(first, rest);
    queries.push(q);
    if (q.text.includes('AS "distanceM"') && q.text.includes("LIMIT 1")) {
      return q.values[0] === origin.coordinates[0]
        ? sourceExists ? [{ id: 1n, distanceM: 0 }] : []
        : [{ id: 9n, distanceM: 0 }];
    }
    if (q.text.includes("pgr_dijkstra")) {
      const target = q.values.at(-1) as bigint;
      const loose = q.text.includes("e.length_m AS cost");
      if ((loose && stairsOnLoosePath) || paths.get(target)) {
        return [{ seq: 1, node: 1n, edge: 101n, cost: 10, agg_cost: 0 }, { seq: 2, node: target, edge: -1n, cost: 0, agg_cost: 10 }];
      }
      return [];
    }
    if (q.text.includes('AS "edgeId"')) return [{
      edgeId: 101n, sourceNodeId: 1n, targetNodeId: 9n,
      geojson: JSON.stringify({ type: "LineString", coordinates: [origin.coordinates, destination.coordinates] }),
      lengthM: 10, surfaceType: "aspal", widthCm: 100, hasStairs: true, stepCount: 5,
      slopePercent: 0, hasGuidingBlock: false, guidingBlockCondition: null, hasHandrail: false,
      isCovered: false, isIndoor: true, isOneWay: false,
      reportId: null, reportCategory: null, reportSeverity: null, reportEffect: null,
    }];
    if (q.text.includes('floor_level AS "floorLevel"')) return [{ floorLevel: 2, buildingId: "[DEV] building" }];
    if (q.text.includes("ST_DWithin") && !q.text.includes("LIMIT 1")) return candidates;
    if (q.text.includes("ST_AsGeoJSON(location)")) return [{ geojson: JSON.stringify(destination) }];
    throw new Error(`Unexpected query: ${q.text}`);
  });
});

async function unreachable() {
  try {
    await planRoute("[DEV] user", origin, destination, "wheelchair");
    throw new Error("Expected ROUTE_UNREACHABLE");
  } catch (err) {
    expect(err).toMatchObject({ code: "ROUTE_UNREACHABLE", httpStatus: 422 });
    return (err as { details: { nearestReachablePoint: GeoJsonPoint | null; reasons: { type: string; message: string; floorLevel?: number }[] } }).details;
  }
}

describe("nearest reachable point", () => {
  it("returns null when origin cannot be snapped, even when destination can", async () => {
    sourceExists = false;
    expect((await unreachable()).nearestReachablePoint).toBeNull();
    expect(queries.filter(q => q.text.includes("pgr_dijkstra"))).toHaveLength(0);
  });

  it("does not return the unreachable destination when no alternative is proved", async () => {
    expect((await unreachable()).nearestReachablePoint).toBeNull();
  });

  it("skips an unreachable nearby candidate and proves the next candidate from origin", async () => {
    candidates = [{ id: 7n, geojson: JSON.stringify(destination) }, { id: 8n, geojson: JSON.stringify(alternative) }];
    paths.set(8n, true);
    expect((await unreachable()).nearestReachablePoint).toEqual(alternative);
    const proofs = queries.filter(q => q.text.includes("pgr_dijkstra") && [7n, 8n].includes(q.values.at(-1) as bigint));
    expect(proofs.map(q => q.values)).toEqual([[1n, 7n], [1n, 8n]]);
    for (const proof of proofs) {
      expect(proof.text).toContain("e.has_stairs = TRUE");
      expect(proof.text).toContain("e.slope_percent > 8");
      expect(proof.text).toContain("CASE WHEN e.is_one_way THEN -1");
      expect(proof.text).toContain("rr.status = 'active'");
      expect(proof.text).toContain("directed := true");
    }
    const search = queries.find(q => q.text.includes("ST_DWithin") && !q.text.includes("LIMIT 1"))!;
    expect(search.text).toContain("status = 'approved'");
    expect(search.text).toContain("is_operational = TRUE");
    expect(search.text).toContain('ORDER BY "distanceM" ASC, id ASC');
    expect(search.values).toContain(150);
  });

  it("returns null when all nearby alternatives fail profile reachability", async () => {
    candidates = [{ id: 7n, geojson: JSON.stringify(alternative) }];
    expect((await unreachable()).nearestReachablePoint).toBeNull();
  });

  it("selects the closest proved candidate without testing farther candidates", async () => {
    candidates = [{ id: 7n, geojson: JSON.stringify(alternative) }, { id: 8n, geojson: JSON.stringify(destination) }];
    paths.set(7n, true);
    paths.set(8n, true);
    expect((await unreachable()).nearestReachablePoint).toEqual(alternative);
    expect(queries.some(q => q.text.includes("pgr_dijkstra") && q.values.at(-1) === 8n)).toBe(false);
  });
});

describe("floor messages", () => {
  it("displays floor 3 for stored index 2 and retains the zero-based detail", async () => {
    stairsOnLoosePath = true;
    expect((await unreachable()).reasons).toContainEqual({
      type: "no_lift", message: "Gedung tujuan tidak memiliki lift ke lantai 3.", buildingId: "[DEV] building", floorLevel: 2,
    });
  });
});
