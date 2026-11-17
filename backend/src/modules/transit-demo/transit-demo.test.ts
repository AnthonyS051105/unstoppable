import { describe, expect, it } from "vitest";
import { AppError } from "../../shared/errors.js";
import type { GeoJsonPoint, PlanRouteResult, WeightConfig } from "../routes/routes.types.js";
import { DemoStaticTransitProvider, loadTransitFixture } from "./transit-demo.provider.js";
import { lookupCorridorDeparture } from "./transit-demo.schedule.js";
import { recommendMultimodal, type TransitDemoDependencies } from "./transit-demo.service.js";
import type { TransitFixtureSpec } from "./transit-demo.types.js";

const ORIGIN_SHORT: GeoJsonPoint = { type: "Point", coordinates: [110.378, -7.77] };
const DEST_PERPUS: GeoJsonPoint = { type: "Point", coordinates: [110.3787, -7.77] };
const DEST_ISOLATED: GeoJsonPoint = { type: "Point", coordinates: [110.3804, -7.77] };
const ORIGIN_KORIDOR: GeoJsonPoint = { type: "Point", coordinates: [110.378, -7.752] };
const DEST_TUJUAN: GeoJsonPoint = { type: "Point", coordinates: [110.3665, -7.7896] };
const DEST_KLINIK: GeoJsonPoint = { type: "Point", coordinates: [110.3885, -7.7896] };
const NON_DEMO_ORIGIN: GeoJsonPoint = { type: "Point", coordinates: [110.41, -7.82] };
const NON_DEMO_DEST: GeoJsonPoint = { type: "Point", coordinates: [110.415, -7.822] };

const STOP_A = "110.3786,-7.7521";
const STOP_B = "110.3658,-7.7895";
const STOP_B2 = "110.3662,-7.7895";
const STOP_C = "110.3879,-7.7895";
const STOP_C2 = "110.3881,-7.7901";

const WHEELCHAIR_WEIGHT: WeightConfig = {
  baseCostPerMeter: 1.0,
  blockers: [{ field: "hasStairs", op: "eq", value: true }],
  multipliers: { surfaceType: { paving: 1.0 }, slopePercent: [{ max: 12, factor: 1.0 }] },
  penalties: { noGuidingBlock: 0, guidingBlockDamaged: 0, perStep: 0, uncovered: 5, reportDegrade: 80, reportBlock: null },
  allowedOverrides: ["max_slope_percent", "min_width_cm"],
};

const LOW_VISION_WEIGHT: WeightConfig = {
  baseCostPerMeter: 1.0,
  blockers: [],
  multipliers: { surfaceType: { paving: 1.0 }, slopePercent: [{ max: 12, factor: 1.0 }] },
  penalties: { noGuidingBlock: 15, guidingBlockDamaged: 30, perStep: 3, uncovered: 0, reportDegrade: 100, reportBlock: null },
  allowedOverrides: ["max_steps"],
};

function makeWalkResult(
  profileId: string,
  distanceM: number,
  durationMin: number,
  coords: Array<[number, number]>,
  edgeIds: string[],
  hasStairs = false,
): PlanRouteResult {
  return {
    reachable: true,
    profileId,
    totalDistanceM: distanceM,
    estimatedDurationMin: durationMin,
    edgeIds,
    geometry: { type: "LineString", coordinates: coords },
    steps: [
      {
        order: 1,
        instruction: "Jalan sesuai graf",
        distanceM,
        edgeId: edgeIds[0] ?? "1",
        attributes: { surfaceType: "paving", isIndoor: false, hasStairs, slopePercent: 0 },
        warnings: [],
      },
    ],
    barriers: [],
    dataFreshness: { surveyedAt: null, reportsCheckedAt: "2026-11-17T02:00:00Z" },
  };
}

function makeTestDeps(fixtureOverride?: TransitFixtureSpec): TransitDemoDependencies {
  const fixture = fixtureOverride ?? loadTransitFixture();
  return {
    provider: new DemoStaticTransitProvider(fixture),
    resolveProfile: async (_userId, requestedProfileId) => {
      const pid = requestedProfileId ?? "wheelchair";
      return {
        profileId: pid,
        weightConfig: pid === "low_vision" ? LOW_VISION_WEIGHT : WHEELCHAIR_WEIGHT,
        tolerance: {},
      };
    },
    planWalk: async (_userId, origin, destination, profileId) => {
      const o = origin.coordinates.join(",");
      const d = destination.coordinates.join(",");
      if (o === ORIGIN_SHORT.coordinates.join(",") && d === DEST_PERPUS.coordinates.join(",")) {
        return makeWalkResult(profileId, 110.1, 2, [origin.coordinates, destination.coordinates], ["40", "41"]);
      }
      if (o === NON_DEMO_ORIGIN.coordinates.join(",") && d === NON_DEMO_DEST.coordinates.join(",")) {
        return makeWalkResult(profileId, 320, 5, [origin.coordinates, destination.coordinates], ["99"]);
      }
      if (o === ORIGIN_KORIDOR.coordinates.join(",") && d === STOP_A) {
        return makeWalkResult(profileId, 67.4, 1, [origin.coordinates, destination.coordinates], ["46"]);
      }
      if (o === STOP_B && d === DEST_TUJUAN.coordinates.join(",")) {
        return makeWalkResult(profileId, 78.3, 1, [origin.coordinates, destination.coordinates], ["47"]);
      }
      if (o === STOP_B && d === STOP_B2) {
        return makeWalkResult(profileId, 46.0, 1, [origin.coordinates, destination.coordinates], ["48"]);
      }
      if (o === STOP_C && d === DEST_KLINIK.coordinates.join(",")) {
        return makeWalkResult(profileId, 66.0, 1, [origin.coordinates, destination.coordinates], ["49"]);
      }
      if (o === STOP_C2 && d === DEST_KLINIK.coordinates.join(",")) {
        if (profileId === "wheelchair") {
          throw new AppError("ROUTE_UNREACHABLE", "Segmen hanya tangga", 422, {
            profileId,
            reasons: [{ type: "stairs_only", message: "Ada 8 anak tangga menuju Klinik Timur." }],
            nearestReachablePoint: null,
            suggestion: "request_companion",
          });
        }
        return makeWalkResult(profileId, 62.0, 1, [origin.coordinates, destination.coordinates], ["50"], true);
      }
      throw new AppError("ROUTE_UNREACHABLE", "Tidak ada jalur di graf", 422, {
        profileId,
        reasons: [{ type: "no_path_in_graph", message: "Tidak ada jalur penghubung di graf." }],
        nearestReachablePoint: null,
        suggestion: "request_companion",
      });
    },
    getEdgeWalkStats: async (edgeIds) => {
      if (edgeIds.includes("50")) return { stepCount: 8, hasUncovered: true };
      return { stepCount: 0, hasUncovered: false };
    },
    getDemoBuildingAnchors: async () => [
      { label: "[DEMO] Halte Kampus Selatan", point: ORIGIN_SHORT },
      { label: "[DEMO] Perpustakaan Ramah Lansia", point: DEST_PERPUS },
      { label: "[DEMO] Paviliun Tangga Lama (Terisolasi)", point: DEST_ISOLATED },
      { label: "[DEMO] Terminal Asal Koridor Utara", point: ORIGIN_KORIDOR },
      { label: "[DEMO] Pusat Layanan Lansia Selatan", point: DEST_TUJUAN },
      { label: "[DEMO] Klinik Rehabilitasi Timur", point: DEST_KLINIK },
    ],
    findAvailableVolunteers: async () => [
      {
        id: "demo-vol-1",
        name: "[DEMO] Relawan Pendamping & Pemeta",
        ratingAvg: 4.9,
        totalHelps: 12,
        distanceM: 250,
        verificationStatus: "verified",
      },
    ],
  };
}

describe("Asia/Jakarta schedule lookup and validity", () => {
  const baseNow = Date.parse("2026-11-17T08:30:00+07:00");
  const busA = loadTransitFixture().corridors[0]!;

  it("picks the next catchable departure in Asia/Jakarta WIB", () => {
    const res = lookupCorridorDeparture({
      corridor: busA,
      earliestReadyEpochMs: Date.parse("2026-11-17T09:01:00+07:00"),
      nowEpochMs: baseNow,
    });
    expect(res.scheduleValid).toBe(true);
    expect(res.isStale).toBe(false);
    expect(res.catchable).toBe(true);
    expect(res.departureWib).toBe("09:15 WIB");
    expect(res.arrivalWib).toBe("09:33 WIB");
    expect(res.waitMinutes).toBe(14);
  });

  it("refuses to promise catchability when timestamps or clock strings are invalid or stale", () => {
    const corrupt = { ...busA, lastUpdatedIso: "not-a-timestamp" };
    const invalidRes = lookupCorridorDeparture({
      corridor: corrupt,
      earliestReadyEpochMs: Date.parse("2026-11-17T09:01:00+07:00"),
      nowEpochMs: baseNow,
    });
    expect(invalidRes.scheduleValid).toBe(false);
    expect(invalidRes.catchable).toBe(false);

    const lateRes = lookupCorridorDeparture({
      corridor: busA,
      earliestReadyEpochMs: Date.parse("2026-11-17T22:30:00+07:00"),
      nowEpochMs: Date.parse("2026-11-17T22:25:00+07:00"),
    });
    expect(lateRes.catchable).toBe(false);
    expect(lateRes.serviceAvailableToday).toBe(false);
  });
});

describe("Controlled demo multimodal recommendation engine", () => {
  const fixedNow = Date.parse("2026-11-17T08:55:00+07:00");
  const depMorning = "2026-11-17T09:00:00+07:00";

  it("only activates synthetic transit when BOTH demoContext=true AND origin/destination match demo area", async () => {
    const deps = makeTestDeps();

    const disabledRes = await recommendMultimodal(
      "u1",
      { origin: ORIGIN_KORIDOR, destination: DEST_TUJUAN, demoContext: false, requestedDepartureIso: depMorning },
      deps,
      fixedNow,
    );
    expect(disabledRes.providerStatus.active).toBe(false);
    expect(disabledRes.providerStatus.reason).toBe("demo_context_disabled");

    const nonDemoRes = await recommendMultimodal(
      "u1",
      { origin: NON_DEMO_ORIGIN, destination: NON_DEMO_DEST, demoContext: true, requestedDepartureIso: depMorning },
      deps,
      fixedNow,
    );
    expect(nonDemoRes.providerStatus.active).toBe(false);
    expect(nonDemoRes.providerStatus.reason).toBe("outside_demo_area");
    expect(nonDemoRes.recommended.kind).toBe("direct_walk");
    expect(nonDemoRes.recommended.synthetic).toBe(false);
  });

  it("recommends direct walk on short accessible demo routes", async () => {
    const res = await recommendMultimodal(
      "u1",
      { origin: ORIGIN_SHORT, destination: DEST_PERPUS, profileId: "wheelchair", demoContext: true, requestedDepartureIso: depMorning },
      makeTestDeps(),
      fixedNow,
    );
    expect(res.providerStatus.active).toBe(true);
    expect(res.recommended.kind).toBe("direct_walk");
    expect(res.recommended.mode).toBe("walk");
    expect(res.recommended.totalWalkM).toBe(110.1);
  });

  it("recommends 0-transfer synthetic transit on long corridor OD and orders legs accurately", async () => {
    const res = await recommendMultimodal(
      "u1",
      { origin: ORIGIN_KORIDOR, destination: DEST_TUJUAN, profileId: "wheelchair", demoContext: true, requestedDepartureIso: depMorning },
      makeTestDeps(),
      fixedNow,
    );
    expect(res.recommended.kind).toBe("transit_0_transfer");
    expect(res.recommended.synthetic).toBe(true);
    expect(res.recommended.verifiedFeed).toBe(false);
    expect(res.recommended.legs.map((l) => l.type)).toEqual(["walk", "transit", "walk"]);
    expect(res.recommended.previewWalkRoute?.edgeIds).toEqual(["46"]);
  });

  it("changes selected mode across wheelchair vs low_vision and preserves transfer timing + unknown/stale penalties", async () => {
    const deps = makeTestDeps();

    const wheelchairRes = await recommendMultimodal(
      "u1",
      { origin: ORIGIN_KORIDOR, destination: DEST_KLINIK, profileId: "wheelchair", demoContext: true, requestedDepartureIso: depMorning },
      deps,
      fixedNow,
    );
    expect(wheelchairRes.recommended.kind).toBe("transit_1_transfer");
    expect(wheelchairRes.recommended.transfers).toBe(1);
    expect(wheelchairRes.recommended.legs.map((l) => l.type)).toEqual([
      "walk",
      "transit",
      "transfer",
      "transit",
      "walk",
    ]);
    const feederAlt = wheelchairRes.alternatives.find((a) => a.id.includes("demo-feeder-d"));
    expect(feederAlt?.accessibilityUnknown).toBe(true);
    expect(feederAlt?.hasStaleSchedule).toBe(true);
    const angkotAlt = wheelchairRes.alternatives.find((a) => a.id.includes("demo-angkot-c"));
    expect(angkotAlt?.eligible).toBe(false);

    const lowVisionRes = await recommendMultimodal(
      "u1",
      { origin: ORIGIN_KORIDOR, destination: DEST_KLINIK, profileId: "low_vision", demoContext: true, requestedDepartureIso: depMorning },
      deps,
      fixedNow,
    );
    expect(lowVisionRes.recommended.kind).toBe("transit_0_transfer");
    expect(lowVisionRes.recommended.id).toBe("transit-0-demo-angkot-c");
  });

  it("falls back to verified companion recommendation when walk tolerance is exceeded, destination is unreachable, or after hours", async () => {
    const deps = makeTestDeps();

    const lowTolerance = await recommendMultimodal(
      "u1",
      {
        origin: ORIGIN_KORIDOR,
        destination: DEST_TUJUAN,
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: depMorning,
        maxWalkMeters: 50,
      },
      deps,
      fixedNow,
    );
    expect(lowTolerance.recommended.kind).toBe("companion_fallback");
    expect(lowTolerance.companionRecommendation.recommended).toBe(true);
    expect(lowTolerance.companionRecommendation.verifiedVolunteers[0]?.id).toBe("demo-vol-1");

    const isolated = await recommendMultimodal(
      "u1",
      {
        origin: ORIGIN_SHORT,
        destination: DEST_ISOLATED,
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: depMorning,
      },
      deps,
      fixedNow,
    );
    expect(isolated.recommended.kind).toBe("companion_fallback");
    expect(isolated.companionRecommendation.recommended).toBe(true);

    const lateNight = await recommendMultimodal(
      "u1",
      {
        origin: ORIGIN_KORIDOR,
        destination: DEST_TUJUAN,
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: "2026-11-17T22:30:00+07:00",
      },
      deps,
      Date.parse("2026-11-17T22:25:00+07:00"),
    );
    expect(lateNight.recommended.kind).toBe("companion_fallback");
    expect(lateNight.companionRecommendation.reasons[0]).toMatch(/jam layanan/i);
  });

  it("rejects malformed requestedDepartureIso instead of silently guessing", async () => {
    await expect(
      recommendMultimodal(
        "u1",
        {
          origin: ORIGIN_SHORT,
          destination: DEST_PERPUS,
          demoContext: true,
          requestedDepartureIso: "09:00",
        },
        makeTestDeps(),
        fixedNow,
      ),
    ).rejects.toMatchObject({ httpStatus: 400, code: "VALIDATION_ERROR" });
  });
});
