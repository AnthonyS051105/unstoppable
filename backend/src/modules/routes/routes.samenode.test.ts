import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoJsonPoint, WeightConfig } from "./routes.types.js";

const db = vi.hoisted(() => ({ query: vi.fn(), building: vi.fn(), profiles: vi.fn(), config: vi.fn() }));
vi.mock("../../config/prisma.js", () => ({ prisma: { $queryRaw: db.query, building: { findUnique: db.building } } }));
vi.mock("../accessibility-profiles/accessibility-profiles.service.js", () => ({
  getUserAccessibility: db.profiles,
  getProfileWeightConfig: db.config,
}));

import { compareRoutes, planRoute } from "./routes.service.js";

// [DEV] fixtures; no database connection or real survey data needed.
const snapNodePoint: GeoJsonPoint = { type: "Point", coordinates: [110.3725, -7.7658] };
const originRaw: GeoJsonPoint = { type: "Point", coordinates: [110.3724, -7.7657] };
const destinationRaw: GeoJsonPoint = { type: "Point", coordinates: [110.3726, -7.7659] };
const differentOrigin: GeoJsonPoint = { type: "Point", coordinates: [110.371, -7.765] };

const wheelchair: WeightConfig = {
  baseCostPerMeter: 1,
  blockers: [{ field: "hasStairs", op: "eq", value: true }],
  multipliers: { surfaceType: { aspal: 1 }, slopePercent: [{ max: 8, factor: 1 }] },
  penalties: { noGuidingBlock: 0, guidingBlockDamaged: 0, perStep: 0, uncovered: 0, reportDegrade: 80, reportBlock: null },
  allowedOverrides: ["max_slope_percent"],
};

const EXPECTED_INSTRUCTION = "Asal dan tujuan terpetakan ke titik yang sama. Periksa kembali titik yang Anda pilih.";

type Query = { text: string; values: unknown[] };
function queryOf(first: TemplateStringsArray | { sql: string; values: unknown[] }, rest: unknown[]): Query {
  return Array.isArray(first)
    ? { text: first.join(" ? "), values: rest }
    : { text: (first as { sql: string }).sql, values: (first as { values: unknown[] }).values };
}

const queries: Query[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  queries.length = 0;

  db.profiles.mockResolvedValue([
    { profileId: "wheelchair", isPrimary: true, toleranceOverrides: { max_slope_percent: 8 } },
  ]);
  db.config.mockImplementation(async (profileId: string) => ({
    label: profileId === "wheelchair" ? "[DEV] Kursi Roda" : "[DEV] Tunanetra",
    weightConfig: wheelchair,
  }));
  db.building.mockResolvedValue({ hasLift: false });

  db.query.mockImplementation((first, ...rest) => {
    const q = queryOf(first, rest);
    queries.push(q);

    // Snapping query
    if (q.text.includes('AS "distanceM"') && q.text.includes("LIMIT 1")) {
      const lng = q.values[0] as number;
      // differentOrigin maps to node 100n
      if (Math.abs(lng - differentOrigin.coordinates[0]) < 0.0001) {
        return [{ id: 100n, distanceM: 2, geojson: JSON.stringify({ type: "Point", coordinates: [110.3711, -7.7651] }) }];
      }
      // originRaw, destinationRaw, and snapNodePoint all snap to node 42n
      return [{ id: 42n, distanceM: 1.5, geojson: JSON.stringify(snapNodePoint) }];
    }

    // pgr_dijkstra query (should only be hit for different nodes)
    if (q.text.includes("pgr_dijkstra")) {
      return []; // empty path = unreachable
    }

    if (q.text.includes("ST_DWithin") && !q.text.includes("LIMIT 1")) return [];
    if (q.text.includes("ST_AsGeoJSON(location)")) return [];

    throw new Error(`Unexpected query: ${q.text}`);
  });
});

describe("rute pada node yang sama (same-node route)", () => {
  it("menghasilkan rute nol panjang dengan langkah tanpa ruas ketika asal dan tujuan identik", async () => {
    const result = await planRoute("[DEV] user", snapNodePoint, snapNodePoint, "wheelchair", true);

    expect(result.reachable).toBe(true);
    expect(result.profileId).toBe("wheelchair");
    expect(result.totalDistanceM).toBe(0);
    expect(result.estimatedDurationMin).toBe(0);
    expect(result.edgeIds).toEqual([]);
    expect(result.barriers).toEqual([]);
    expect(result.dataFreshness.surveyedAt).toBeNull();
    expect(Date.parse(result.dataFreshness.reportsCheckedAt)).not.toBeNaN();

    // Geometry valid RFC 7946 LineString dari titik snap node
    expect(result.geometry).toEqual({
      type: "LineString",
      coordinates: [snapNodePoint.coordinates, snapNodePoint.coordinates],
    });

    // Langkah penjelas tanpa ruas: edgeId dan attributes null
    expect(result.steps).toHaveLength(1);
    const step = result.steps[0];
    expect(step.order).toBe(1);
    expect(step.instruction).toBe(EXPECTED_INSTRUCTION);
    expect(step.distanceM).toBe(0);
    expect(step.edgeId).toBeNull();
    expect(step.attributes).toBeNull();
    expect(step.warnings).toEqual([]);
    expect(step.startPoint).toEqual(snapNodePoint);

    // Narasi berisi pesan persis tanpa tambahan kata transisi salah
    expect(result.narration).toBe(EXPECTED_INSTRUCTION);

    // Memverifikasi tidak ada pemanggilan pgr_dijkstra
    const dijkstraCalls = queries.filter((q) => q.text.includes("pgr_dijkstra"));
    expect(dijkstraCalls).toHaveLength(0);
  });

  it("menghasilkan rute nol panjang ketika dua titik mentah berbeda tersnap ke node yang sama", async () => {
    const result = await planRoute("[DEV] user", originRaw, destinationRaw, "wheelchair", false);

    expect(result.reachable).toBe(true);
    expect(result.totalDistanceM).toBe(0);
    expect(result.estimatedDurationMin).toBe(0);
    expect(result.edgeIds).toEqual([]);
    expect(result.geometry.coordinates).toEqual([snapNodePoint.coordinates, snapNodePoint.coordinates]);
    expect(result.steps[0].instruction).toBe(EXPECTED_INSTRUCTION);
    expect(result.steps[0].edgeId).toBeNull();
    expect(result.steps[0].attributes).toBeNull();
    expect(result.steps[0].startPoint).toEqual(snapNodePoint);
    expect(result.narration).toBeUndefined();

    // Tidak ada pgr_dijkstra yang dipanggil
    const dijkstraCalls = queries.filter((q) => q.text.includes("pgr_dijkstra"));
    expect(dijkstraCalls).toHaveLength(0);
  });

  it("tetap melempar 422 ROUTE_UNREACHABLE jika dua node berbeda tidak terhubung", async () => {
    await expect(
      planRoute("[DEV] user", differentOrigin, destinationRaw, "wheelchair"),
    ).rejects.toMatchObject({
      code: "ROUTE_UNREACHABLE",
      httpStatus: 422,
    });

    // pgr_dijkstra dipanggil karena dua node berbeda (100n dan 42n)
    const dijkstraCalls = queries.filter((q) => q.text.includes("pgr_dijkstra"));
    expect(dijkstraCalls.length).toBeGreaterThan(0);
  });

  it("compareRoutes menangani same-node untuk multiple profil tanpa error atau perbedaan palsu", async () => {
    const compare = await compareRoutes("[DEV] user", snapNodePoint, snapNodePoint, ["wheelchair", "blind"]);

    expect(compare.results).toHaveLength(2);
    for (const r of compare.results) {
      expect(r.reachable).toBe(true);
      expect(r.totalDistanceM).toBe(0);
      expect(r.edgeIds).toEqual([]);
      expect(r.steps?.[0]?.edgeId).toBeNull();
      expect(r.steps?.[0]?.instruction).toBe(EXPECTED_INSTRUCTION);
    }
    // Tidak ada perbedaan ruas palsu yang dihasilkan
    expect(compare.differences).toEqual([]);
  });
});
