import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import * as accessibilityProfilesService from "../accessibility-profiles/accessibility-profiles.service.js";
import * as routesService from "../routes/routes.service.js";
import * as volunteersService from "../volunteers/volunteers.service.js";
import type { GeoJsonPoint, PlanRouteResult, Tolerance, UnreachableDetails, WeightConfig } from "../routes/routes.types.js";
import {
  defaultDemoTransitProvider,
  haversineMeters,
} from "./transit-demo.provider.js";
import {
  formatWibClock,
  lookupCorridorDeparture,
  parseStrictTimestampMs,
  toWibIsoFromEpoch,
} from "./transit-demo.schedule.js";
import {
  buildCompanionFallbackOption,
  scoreDirectWalkOption,
  scoreTransitCandidate,
  type ScoringContext,
  type TransitCandidateEvaluation,
} from "./transit-demo.scorer.js";
import type {
  MultimodalOptionDto,
  MultimodalRecommendationResponseDto,
  MultimodalRecommendInput,
  ResolvedProfileContext,
  TransitCorridorSpec,
  TransitProviderAdapter,
  TransitStopSpec,
  VerifiedVolunteerCandidateDto,
  WalkLegEvaluation,
} from "./transit-demo.types.js";

const DEFAULT_MAX_WALK_METERS = 800;
const STOP_MATCH_RADIUS_METERS = 450;

export interface TransitDemoDependencies {
  provider: TransitProviderAdapter;
  resolveProfile: (userId: string, requestedProfileId?: string) => Promise<ResolvedProfileContext>;
  planWalk: (
    userId: string,
    origin: GeoJsonPoint,
    destination: GeoJsonPoint,
    profileId: string,
  ) => Promise<PlanRouteResult>;
  getEdgeWalkStats: (edgeIds: string[]) => Promise<{ stepCount: number; hasUncovered: boolean }>;
  getDemoBuildingAnchors: (codes: string[]) => Promise<Array<{ label: string; point: GeoJsonPoint }>>;
  findAvailableVolunteers: (
    userId: string,
    point: GeoJsonPoint,
    scheduledStart: Date,
    durationMin: number,
  ) => Promise<VerifiedVolunteerCandidateDto[]>;
}

function parseTolerance(raw: unknown, allowedOverrides: WeightConfig["allowedOverrides"]): Tolerance {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(allowedOverrides);
  const tol: Tolerance = {};
  if (allowed.has("max_steps") && typeof obj.max_steps === "number") tol.max_steps = obj.max_steps;
  if (allowed.has("max_slope_percent") && typeof obj.max_slope_percent === "number") {
    tol.max_slope_percent = obj.max_slope_percent;
  }
  if (allowed.has("min_width_cm") && typeof obj.min_width_cm === "number") tol.min_width_cm = obj.min_width_cm;
  if (allowed.has("avoid_uncovered") && typeof obj.avoid_uncovered === "boolean") {
    tol.avoid_uncovered = obj.avoid_uncovered;
  }
  return tol;
}

async function defaultResolveProfile(
  userId: string,
  requestedProfileId?: string,
): Promise<ResolvedProfileContext> {
  const userProfiles = await accessibilityProfilesService.getUserAccessibility(userId);
  let profileId = requestedProfileId;
  let toleranceRaw: unknown = undefined;

  if (!profileId) {
    const primary = userProfiles.find((p: { isPrimary: boolean }) => p.isPrimary) ?? userProfiles[0];
    if (!primary) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Anda belum memilih profil aksesibilitas. Pilih profil terlebih dahulu di pengaturan.",
        400,
      );
    }
    profileId = primary.profileId;
    toleranceRaw = primary.toleranceOverrides;
  } else {
    const match = userProfiles.find((p: { profileId: string }) => p.profileId === profileId);
    toleranceRaw = match?.toleranceOverrides;
  }

  let profile;
  try {
    profile = await accessibilityProfilesService.getProfileWeightConfig(profileId);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new AppError("VALIDATION_ERROR", `Profil aksesibilitas "${profileId}" tidak dikenal.`, 400);
    }
    throw err;
  }
  const weightConfig = profile.weightConfig as unknown as WeightConfig;
  const tolerance = parseTolerance(toleranceRaw, weightConfig.allowedOverrides);
  return { profileId, weightConfig, tolerance };
}

async function defaultGetEdgeWalkStats(edgeIds: string[]): Promise<{ stepCount: number; hasUncovered: boolean }> {
  const numericIds = edgeIds
    .map((id) => {
      try {
        return BigInt(id);
      } catch {
        return null;
      }
    })
    .filter((id): id is bigint => id !== null);

  if (numericIds.length === 0) return { stepCount: 0, hasUncovered: false };

  const rows = await prisma.$queryRaw<Array<{ stepCount: number; hasUncovered: boolean }>>`
    SELECT COALESCE(SUM(step_count), 0)::int AS "stepCount",
           BOOL_OR(NOT is_covered) AS "hasUncovered"
    FROM path_edges
    WHERE id = ANY(${numericIds})
  `;
  return rows[0] ?? { stepCount: 0, hasUncovered: false };
}

async function defaultGetDemoBuildingAnchors(
  codes: string[],
): Promise<Array<{ label: string; point: GeoJsonPoint }>> {
  if (codes.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ name: string; geojson: string }>>`
    SELECT name, ST_AsGeoJSON(location)::text AS geojson
    FROM buildings
    WHERE code = ANY(${codes}) OR name LIKE '[DEMO]%'
  `;
  return rows.map((r) => ({
    label: r.name,
    point: JSON.parse(r.geojson) as GeoJsonPoint,
  }));
}

async function defaultFindAvailableVolunteers(
  userId: string,
  point: GeoJsonPoint,
  scheduledStart: Date,
  durationMin: number,
): Promise<VerifiedVolunteerCandidateDto[]> {
  const list = await volunteersService.findAvailable(userId, {
    lng: point.coordinates[0],
    lat: point.coordinates[1],
    scheduledStart,
    estimatedDurationMin: durationMin,
  });
  return list
    .filter((v): v is typeof v & { verificationStatus: "verified" } => v.verificationStatus === "verified")
    .map((v) => ({
      id: v.id,
      name: v.name,
      ratingAvg: v.ratingAvg,
      totalHelps: v.totalHelps,
      distanceM: v.distanceM,
      verificationStatus: "verified" as const,
    }));
}

export const defaultTransitDemoDependencies: TransitDemoDependencies = {
  provider: defaultDemoTransitProvider,
  resolveProfile: defaultResolveProfile,
  planWalk: (userId, origin, destination, profileId) =>
    routesService.planRoute(userId, origin, destination, profileId, false),
  getEdgeWalkStats: defaultGetEdgeWalkStats,
  getDemoBuildingAnchors: defaultGetDemoBuildingAnchors,
  findAvailableVolunteers: defaultFindAvailableVolunteers,
};

async function evaluateWalkLeg(
  deps: TransitDemoDependencies,
  userId: string,
  profileId: string,
  role: WalkLegEvaluation["role"],
  fromLabel: string,
  fromPoint: GeoJsonPoint,
  toLabel: string,
  toPoint: GeoJsonPoint,
): Promise<WalkLegEvaluation> {
  try {
    const route = await deps.planWalk(userId, fromPoint, toPoint, profileId);
    const stepHasStairs = route.steps.some(
      (s) => s.attributes && (s.attributes as { hasStairs?: boolean }).hasStairs === true,
    );
    const stats = await deps.getEdgeWalkStats(route.edgeIds);
    return {
      role,
      fromLabel,
      toLabel,
      reachable: true,
      route,
      hasStairs: stepHasStairs || stats.stepCount > 0,
      stepCount: stats.stepCount,
      hasUncovered: stats.hasUncovered,
    };
  } catch (err) {
    if (err instanceof AppError && err.code === "ROUTE_UNREACHABLE") {
      return {
        role,
        fromLabel,
        toLabel,
        reachable: false,
        unreachable: {
          message: err.message,
          details: err.details as UnreachableDetails | undefined,
        },
        hasStairs: false,
        stepCount: 0,
        hasUncovered: false,
      };
    }
    throw err;
  }
}

function findStopByRole(corridor: TransitCorridorSpec, role: "board" | "alight"): TransitStopSpec | undefined {
  return corridor.stops.find((s) => s.role === role);
}

export async function recommendMultimodal(
  userId: string,
  input: MultimodalRecommendInput,
  deps: TransitDemoDependencies = defaultTransitDemoDependencies,
  nowMsOverride?: number,
): Promise<MultimodalRecommendationResponseDto> {
  const nowMs = nowMsOverride ?? Date.now();
  const demoContext = Boolean(input.demoContext);
  const maxWalkMeters = input.maxWalkMeters ?? DEFAULT_MAX_WALK_METERS;

  let departureMs: number;
  if (input.requestedDepartureIso !== undefined) {
    const parsed = parseStrictTimestampMs(input.requestedDepartureIso);
    if (parsed === null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "requestedDepartureIso wajib berupa timestamp ISO dengan zona waktu yang valid (mis. +07:00).",
        400,
      );
    }
    departureMs = parsed;
  } else {
    departureMs = nowMs;
  }

  const profileCtx = await deps.resolveProfile(userId, input.profileId);
  const scoringCtx: ScoringContext = {
    profileId: profileCtx.profileId,
    weightConfig: profileCtx.weightConfig,
    tolerance: profileCtx.tolerance,
    maxWalkMeters,
    preferFewerTransfers: Boolean(input.preferFewerTransfers),
  };

  // 1. Always evaluate real direct pedestrian route via PostGIS pgRouting
  const directWalkEval = await evaluateWalkLeg(
    deps,
    userId,
    profileCtx.profileId,
    "direct_walk",
    "Titik Asal",
    input.origin,
    "Tujuan",
    input.destination,
  );
  const directWalkOption = scoreDirectWalkOption(directWalkEval, scoringCtx);

  // 2. Check demo transit provider activation strictly
  const fixture = deps.provider.getFixture();
  const demoAnchors = await deps.getDemoBuildingAnchors(fixture.demoBuildingCodes);
  const activation = deps.provider.checkActivation({
    demoContext,
    origin: input.origin,
    destination: input.destination,
    demoAnchors,
  });

  // Cache evaluated walk legs by rounded endpoint coords so shared legs (e.g. origin -> DEMO-STOP-A) run once
  const walkCache = new Map<string, WalkLegEvaluation>();
  const getCachedWalk = async (
    role: WalkLegEvaluation["role"],
    fromLabel: string,
    fromPoint: GeoJsonPoint,
    toLabel: string,
    toPoint: GeoJsonPoint,
  ) => {
    const key = `${role}:${fromPoint.coordinates.join(",")}:${toPoint.coordinates.join(",")}`;
    const existing = walkCache.get(key);
    if (existing) return existing;
    const res = await evaluateWalkLeg(deps, userId, profileCtx.profileId, role, fromLabel, fromPoint, toLabel, toPoint);
    walkCache.set(key, res);
    return res;
  };

  const transitOptions: MultimodalOptionDto[] = [];

  if (activation.active) {
    // 3A. 0-transfer candidates: single corridor where boardStop is near origin and alightStop is near destination
    for (const corridor of fixture.corridors) {
      const boardStop = findStopByRole(corridor, "board");
      const alightStop = findStopByRole(corridor, "alight");
      if (!boardStop || !alightStop) continue;

      const boardDist = haversineMeters(input.origin.coordinates, boardStop.coordinates);
      const alightDist = haversineMeters(alightStop.coordinates, input.destination.coordinates);
      if (boardDist > STOP_MATCH_RADIUS_METERS || alightDist > STOP_MATCH_RADIUS_METERS) {
        continue;
      }

      const firstMile = await getCachedWalk(
        "first_mile",
        "Titik Asal",
        input.origin,
        boardStop.name,
        { type: "Point", coordinates: boardStop.coordinates },
      );
      const lastMile = await getCachedWalk(
        "last_mile",
        alightStop.name,
        { type: "Point", coordinates: alightStop.coordinates },
        "Tujuan",
        input.destination,
      );

      const firstMileMin = firstMile.reachable && firstMile.route ? firstMile.route.estimatedDurationMin : 0;
      const earliestBoardMs = departureMs + firstMileMin * 60_000;
      const schedule = lookupCorridorDeparture({
        corridor,
        earliestReadyEpochMs: earliestBoardMs,
        nowEpochMs: nowMs,
        fixtureFallbackLastUpdatedIso: fixture.lastUpdatedIso,
        fixtureFallbackStaleAfterMinutes: fixture.staleAfterMinutes,
      });

      const candidate: TransitCandidateEvaluation = {
        id: `transit-0-${corridor.id}`,
        kind: "transit_0_transfer",
        corridors: [{ corridor, boardStop, alightStop, schedule }],
        firstMile,
        lastMile,
      };
      transitOptions.push(scoreTransitCandidate(candidate, scoringCtx));
    }

    // 3B. 1-transfer candidates declared in fixture.transfers
    for (const transferSpec of fixture.transfers) {
      const c1 = fixture.corridors.find((c) => c.id === transferSpec.fromCorridorId);
      const c2 = fixture.corridors.find((c) => c.id === transferSpec.toCorridorId);
      if (!c1 || !c2) continue;

      const c1Board = findStopByRole(c1, "board");
      const c1Alight = c1.stops.find((s) => s.stopId === transferSpec.fromStopId);
      const c2Board = c2.stops.find((s) => s.stopId === transferSpec.toStopId);
      const c2Alight = findStopByRole(c2, "alight");
      if (!c1Board || !c1Alight || !c2Board || !c2Alight) continue;

      const boardDist = haversineMeters(input.origin.coordinates, c1Board.coordinates);
      const alightDist = haversineMeters(c2Alight.coordinates, input.destination.coordinates);
      if (boardDist > STOP_MATCH_RADIUS_METERS || alightDist > STOP_MATCH_RADIUS_METERS) {
        continue;
      }

      const firstMile = await getCachedWalk(
        "first_mile",
        "Titik Asal",
        input.origin,
        c1Board.name,
        { type: "Point", coordinates: c1Board.coordinates },
      );
      const transferWalk = await getCachedWalk(
        "transfer_walk",
        c1Alight.name,
        { type: "Point", coordinates: c1Alight.coordinates },
        c2Board.name,
        { type: "Point", coordinates: c2Board.coordinates },
      );
      const lastMile = await getCachedWalk(
        "last_mile",
        c2Alight.name,
        { type: "Point", coordinates: c2Alight.coordinates },
        "Tujuan",
        input.destination,
      );

      const firstMileMin = firstMile.reachable && firstMile.route ? firstMile.route.estimatedDurationMin : 0;
      const schedule1 = lookupCorridorDeparture({
        corridor: c1,
        earliestReadyEpochMs: departureMs + firstMileMin * 60_000,
        nowEpochMs: nowMs,
        fixtureFallbackLastUpdatedIso: fixture.lastUpdatedIso,
        fixtureFallbackStaleAfterMinutes: fixture.staleAfterMinutes,
      });

      const arr1Ms = schedule1.arrivalIso ? parseStrictTimestampMs(schedule1.arrivalIso) : null;
      const transferWalkMin =
        transferWalk.reachable && transferWalk.route ? transferWalk.route.estimatedDurationMin : 0;
      const effectiveTransferBufferMin = Math.max(transferWalkMin, transferSpec.minTransferMinutes);
      const readyLeg2Ms =
        arr1Ms !== null && transferWalk.reachable
          ? arr1Ms + effectiveTransferBufferMin * 60_000
          : null;

      const schedule2 = lookupCorridorDeparture({
        corridor: c2,
        earliestReadyEpochMs: readyLeg2Ms,
        nowEpochMs: nowMs,
        fixtureFallbackLastUpdatedIso: fixture.lastUpdatedIso,
        fixtureFallbackStaleAfterMinutes: fixture.staleAfterMinutes,
      });

      const dep2Ms = schedule2.departureIso ? parseStrictTimestampMs(schedule2.departureIso) : null;
      const actualWindowMinutes =
        arr1Ms !== null && dep2Ms !== null ? Math.round((dep2Ms - arr1Ms) / 60_000) : null;
      const transferCatchable =
        transferWalk.reachable &&
        schedule1.catchable &&
        schedule2.catchable &&
        actualWindowMinutes !== null &&
        actualWindowMinutes >= effectiveTransferBufferMin;

      let reasonIfUncatchable: string | null = null;
      if (!transferWalk.reachable) {
        reasonIfUncatchable = "Jalur jalan kaki antar-halte transfer tidak terjangkau.";
      } else if (!schedule1.catchable) {
        reasonIfUncatchable = schedule1.reason ?? `Tidak dapat mengejar ${c1.routeShortName}.`;
      } else if (!schedule2.catchable || actualWindowMinutes === null) {
        reasonIfUncatchable = schedule2.reason ?? `Tidak ada keberangkatan lanjutan ${c2.routeShortName} yang terkejar.`;
      } else if (actualWindowMinutes < effectiveTransferBufferMin) {
        reasonIfUncatchable = `Jeda transfer (${actualWindowMinutes} mnt) lebih singkat dari batas aman (${effectiveTransferBufferMin} mnt).`;
      }

      const candidate: TransitCandidateEvaluation = {
        id: `transit-1-${transferSpec.id}`,
        kind: "transit_1_transfer",
        corridors: [
          { corridor: c1, boardStop: c1Board, alightStop: c1Alight, schedule: schedule1 },
          { corridor: c2, boardStop: c2Board, alightStop: c2Alight, schedule: schedule2 },
        ],
        firstMile,
        transferWalk: {
          spec: transferSpec,
          walk: transferWalk,
          actualWindowMinutes,
          catchable: transferCatchable,
          reasonIfUncatchable,
        },
        lastMile,
      };
      transitOptions.push(scoreTransitCandidate(candidate, scoringCtx));
    }
  }

  // 4. Query read-only verified volunteers around destination (safe future lookup >= now)
  const companionQueryStart = new Date(Math.max(departureMs, nowMs + 5 * 60_000));
  const verifiedVolunteers = await deps.findAvailableVolunteers(
    userId,
    input.destination,
    companionQueryStart,
    60,
  );

  // 5. Rank candidates deterministically and evaluate companion recommendation reasons
  const allTravelOptions = [directWalkOption, ...transitOptions].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.totalDurationMin !== b.totalDurationMin) return a.totalDurationMin - b.totalDurationMin;
    return a.id.localeCompare(b.id);
  });

  const bestTravelOption = allTravelOptions[0];
  const eligibleTravelOptions = allTravelOptions.filter((o) => o.eligible);

  const companionReasons: string[] = [];
  if (eligibleTravelOptions.length === 0) {
    const topIssue =
      allTravelOptions
        .flatMap((o) => o.disqualificationReasons)
        .find((r) => Boolean(r)) ?? "Tidak ada rute mandiri yang memenuhi aksesibilitas atau batas jalan kaki Anda.";
    companionReasons.push(topIssue);
    if (!activation.active) {
      companionReasons.push(activation.message);
    }
  } else if (bestTravelOption) {
    if (bestTravelOption.accessibilityUnknown) {
      companionReasons.push(
        "Status aksesibilitas transportasi terbaik yang tersedia masih belum diketahui (unknown).",
      );
    }
    if (bestTravelOption.hasStaleSchedule) {
      companionReasons.push("Data jadwal demo untuk opsi ini sudah kedaluwarsa (> batas pembaruan).");
    }
    if (bestTravelOption.previewWalkRoute && bestTravelOption.previewWalkRoute.barriers.length > 0) {
      companionReasons.push(
        `Terdapat ${bestTravelOption.previewWalkRoute.barriers.length} laporan hambatan aktif pada jalur jalan kaki.`,
      );
    }
    if (
      bestTravelOption.kind === "direct_walk" &&
      !bestTravelOption.previewWalkRoute?.dataFreshness.surveyedAt
    ) {
      companionReasons.push("Jalur belum memiliki tanggal survei lapangan terbaru.");
    }
  }

  const companionOption = buildCompanionFallbackOption({
    reasons: companionReasons,
    verifiedVolunteers,
    previewWalkRoute: bestTravelOption?.previewWalkRoute ?? null,
  });

  let recommended: MultimodalOptionDto;
  let alternatives: MultimodalOptionDto[];
  if (eligibleTravelOptions.length > 0 && bestTravelOption) {
    recommended = bestTravelOption;
    alternatives = [...allTravelOptions.filter((o) => o.id !== bestTravelOption.id), companionOption];
  } else {
    recommended = companionOption;
    alternatives = allTravelOptions;
  }

  return {
    profileId: profileCtx.profileId,
    maxWalkMeters,
    demoContext,
    providerStatus: {
      adapterName: deps.provider.adapterName,
      fixtureTag: fixture.fixtureTag,
      synthetic: true,
      verifiedFeed: false,
      active: activation.active,
      reason: activation.reason,
      disclaimer: fixture.disclaimer,
      message: activation.message,
    },
    departureIntent: {
      requestedIso: toWibIsoFromEpoch(departureMs),
      wibClock: formatWibClock(departureMs),
      isDepartureIntentOnly: true,
      disclaimer:
        "Waktu yang Anda tentukan adalah niat keberangkatan. Jam bus/shuttle yang ditampilkan berasal dari data transportasi demo sintetis, bukan jadwal operator resmi.",
    },
    recommended,
    alternatives,
    companionRecommendation: {
      recommended: companionReasons.length > 0,
      reasons: companionReasons,
      verifiedVolunteers,
    },
  };
}
