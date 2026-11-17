import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import { serializeBigInt } from "../../shared/bigint.js";
import { recommendMultimodalSchema } from "./transit-demo.schema.js";
import { recommendMultimodal } from "./transit-demo.service.js";
import { defaultDemoTransitProvider } from "./transit-demo.provider.js";

/**
 * POST /api/transit-demo/recommend
 */
export const recommend = asyncHandler(async (req, res) => {
  const input = recommendMultimodalSchema.parse(req.body);
  const result = await recommendMultimodal(req.user!.id, input);
  ok(res, serializeBigInt(result));
});

/**
 * GET /api/transit-demo/fixture
 * Read-only inspection of the synthetic demo corridors & stops (no credentials).
 */
export const getFixtureInfo = asyncHandler(async (_req, res) => {
  const fixture = defaultDemoTransitProvider.getFixture();
  ok(res, {
    fixtureTag: fixture.fixtureTag,
    synthetic: fixture.synthetic,
    verifiedFeed: fixture.verifiedFeed,
    timezone: fixture.timezone,
    lastUpdatedIso: fixture.lastUpdatedIso,
    staleAfterMinutes: fixture.staleAfterMinutes,
    disclaimer: fixture.disclaimer,
    demoAreaRadiusMeters: fixture.demoAreaRadiusMeters,
    demoBuildingCodes: fixture.demoBuildingCodes,
    corridors: fixture.corridors.map((c) => ({
      id: c.id,
      mode: c.mode,
      routeShortName: c.routeShortName,
      headsign: c.headsign,
      operatingHoursWib: c.operatingHoursWib,
      estimatedTransitDurationMin: c.estimatedTransitDurationMin,
      vehicleAccessibility: c.vehicleAccessibility,
      boardingAccessibility: c.boardingAccessibility,
      stepCount: c.stepCount,
      fare: c.fare,
      lastUpdatedIso: c.lastUpdatedIso,
      staleAfterMinutes: c.staleAfterMinutes,
      stops: c.stops.map((s) => ({
        stopId: s.stopId,
        role: s.role,
        name: s.name,
        coordinates: s.coordinates,
        platformCode: s.platformCode,
        accessibility: s.accessibility,
      })),
    })),
    transfers: fixture.transfers,
  });
});
