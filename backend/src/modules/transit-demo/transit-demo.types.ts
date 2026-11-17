import type {
  GeoJsonLineString,
  GeoJsonPoint,
  PlanRouteResult,
  RouteBarrier,
  RouteStep,
  UnreachableDetails,
  WeightConfig,
  Tolerance,
} from "../routes/routes.types.js";

export type TransitProfileId = "blind" | "low_vision" | "wheelchair" | "crutches";
export type StopBoardingAccessibility = "accessible" | "not_accessible" | "unknown";
export type VehicleAccessibility = "low_floor" | "high_floor_steps" | "unknown";

export interface TransitStopSpec {
  stopId: string;
  role: "board" | "alight";
  nodeKey: string;
  name: string;
  coordinates: [number, number];
  platformCode: string | null;
  tags: string[];
  accessibility: {
    wheelchairBoarding: StopBoardingAccessibility;
    lowFloorRamp: boolean | null;
    tactilePaving: boolean | null;
    audioAnnouncement: boolean | null;
    stepCount: number | null;
    verifiedAt: string | null;
    synthetic: true;
  };
}

export interface TransitPlaceRef {
  buildingCode: string;
  name: string;
  nodeKey?: string;
  coordinates: [number, number];
}

export interface TransitCorridorSpec {
  id: string;
  mode: "bus" | "shuttle";
  synthetic: true;
  routeShortName: string;
  headsign: string;
  scheduleType: "synthetic_frequency";
  headwayMinutes: number;
  operatingHoursWib: string;
  lastUpdatedIso: string;
  staleAfterMinutes: number;
  syntheticDeparturesWib: string[];
  estimatedTransitDurationMin: number;
  vehicleAccessibility: VehicleAccessibility;
  boardingAccessibility: StopBoardingAccessibility;
  stepCount: number | null;
  fare: {
    amountIdr: number | null;
    currency: "IDR";
    source: "synthetic_demo";
    note: string;
  };
  originPlace?: TransitPlaceRef;
  destinationPlace?: TransitPlaceRef;
  stops: TransitStopSpec[];
}

export interface TransitTransferSpec {
  id: string;
  fromCorridorId: string;
  fromStopId: string;
  toCorridorId: string;
  toStopId: string;
  minTransferMinutes: number;
  transferType: "accessible_walk" | "stairs_walk";
  synthetic: true;
}

export interface TransitFixtureSpec {
  fixtureTag: string;
  synthetic: true;
  verifiedFeed: false;
  timezone: "Asia/Jakarta";
  lastUpdatedIso: string;
  staleAfterMinutes: number;
  disclaimer: string;
  demoAreaRadiusMeters: number;
  demoBuildingCodes: string[];
  corridors: TransitCorridorSpec[];
  transfers: TransitTransferSpec[];
}

export interface TransitActivationResult {
  active: boolean;
  reason: "active_demo_od" | "demo_context_disabled" | "outside_demo_area";
  message: string;
}

export interface TransitProviderAdapter {
  readonly adapterName: string;
  readonly synthetic: true;
  readonly verifiedFeed: false;
  checkActivation(params: {
    demoContext: boolean;
    origin: GeoJsonPoint;
    destination: GeoJsonPoint;
    demoAnchors: Array<{ label: string; point: GeoJsonPoint }>;
  }): TransitActivationResult;
  getFixture(): TransitFixtureSpec;
}

export interface WalkLegEvaluation {
  role: "direct_walk" | "first_mile" | "transfer_walk" | "last_mile";
  fromLabel: string;
  toLabel: string;
  reachable: boolean;
  route?: PlanRouteResult;
  unreachable?: {
    message: string;
    details?: UnreachableDetails | undefined;
  } | undefined;
  hasStairs: boolean;
  stepCount: number;
  hasUncovered: boolean;
}

export interface ScheduleLookupResult {
  scheduleValid: boolean;
  isStale: boolean;
  staleAgeMinutes: number | null;
  serviceAvailableToday: boolean;
  catchable: boolean;
  departureIso: string | null;
  departureWib: string | null;
  arrivalIso: string | null;
  arrivalWib: string | null;
  waitMinutes: number | null;
  reason: string | null;
}

export interface MultimodalWalkLegDto {
  type: "walk";
  role: "direct_walk" | "first_mile" | "transfer_walk" | "last_mile";
  fromLabel: string;
  toLabel: string;
  distanceM: number;
  durationMin: number;
  edgeIds: string[];
  geometry: GeoJsonLineString;
  steps: RouteStep[];
  barriers: RouteBarrier[];
  hasStairs: boolean;
  stepCount: number;
  surveyedAt: string | null;
}

export interface MultimodalTransitLegDto {
  type: "transit";
  synthetic: true;
  verifiedFeed: false;
  corridorId: string;
  mode: "bus" | "shuttle";
  routeShortName: string;
  headsign: string;
  boardStop: {
    stopId: string;
    name: string;
    platformCode: string | null;
    coordinates: [number, number];
    wheelchairBoarding: StopBoardingAccessibility;
    stepCount: number | null;
    lowFloorRamp: boolean | null;
    tactilePaving: boolean | null;
    audioAnnouncement: boolean | null;
  };
  alightStop: {
    stopId: string;
    name: string;
    platformCode: string | null;
    coordinates: [number, number];
    wheelchairBoarding: StopBoardingAccessibility;
    stepCount: number | null;
    lowFloorRamp: boolean | null;
    tactilePaving: boolean | null;
    audioAnnouncement: boolean | null;
  };
  vehicleAccessibility: VehicleAccessibility;
  boardingAccessibility: StopBoardingAccessibility;
  stepCount: number | null;
  departureTimeWib: string | null;
  arrivalTimeWib: string | null;
  departureIso: string | null;
  arrivalIso: string | null;
  waitMinutes: number | null;
  durationMin: number;
  fareIdr: number | null;
  fareNote: string | null;
  lastUpdatedIso: string | null;
  isStale: boolean;
  staleAgeMinutes: number | null;
  scheduleValid: boolean;
  catchable: boolean;
}

export interface MultimodalTransferStepDto {
  type: "transfer";
  fromCorridorName: string;
  toCorridorName: string;
  fromStopName: string;
  toStopName: string;
  minTransferMinutes: number;
  actualTransferWindowMinutes: number | null;
  walkDistanceM: number;
  walkDurationMin: number;
  edgeIds: string[];
  geometry: GeoJsonLineString;
  steps: RouteStep[];
  catchable: boolean;
  reasonIfUncatchable: string | null;
}

export type MultimodalLegDto = MultimodalWalkLegDto | MultimodalTransitLegDto | MultimodalTransferStepDto;

export interface MultimodalScoreBreakdown {
  base: number;
  durationPenalty: number;
  walkPenalty: number;
  walkTolerancePenalty: number;
  transferPenalty: number;
  accessibilityPenalty: number;
  uncertaintyPenalty: number;
  stalenessPenalty: number;
  farePenalty: number;
  barrierPenalty: number;
  barrierBonus: number;
}

export interface MultimodalOptionDto {
  id: string;
  kind: "direct_walk" | "transit_0_transfer" | "transit_1_transfer" | "companion_fallback";
  mode: "walk" | "transit" | "companion";
  title: string;
  synthetic: boolean;
  verifiedFeed: boolean;
  eligible: boolean;
  disqualificationReasons: string[];
  warnings: string[];
  accessibilityUnknown: boolean;
  hasStaleSchedule: boolean;
  totalDurationMin: number;
  totalWalkM: number;
  totalFareIdr: number | null;
  transfers: number;
  score: number;
  scoreBreakdown: MultimodalScoreBreakdown;
  rationale: string;
  legs: MultimodalLegDto[];
  previewWalkRoute: PlanRouteResult | null;
}

export interface VerifiedVolunteerCandidateDto {
  id: string;
  name: string;
  ratingAvg: number;
  totalHelps: number;
  distanceM: number;
  verificationStatus: "verified";
}

export interface MultimodalRecommendInput {
  origin: GeoJsonPoint;
  destination: GeoJsonPoint;
  profileId?: string | undefined;
  demoContext?: boolean | undefined;
  requestedDepartureIso?: string | undefined;
  maxWalkMeters?: number | undefined;
  preferFewerTransfers?: boolean | undefined;
}

export interface ResolvedProfileContext {
  profileId: string;
  weightConfig: WeightConfig;
  tolerance: Tolerance;
}

export interface MultimodalRecommendationResponseDto {
  profileId: string;
  maxWalkMeters: number;
  demoContext: boolean;
  providerStatus: {
    adapterName: string;
    fixtureTag: string;
    synthetic: true;
    verifiedFeed: false;
    active: boolean;
    reason: "active_demo_od" | "demo_context_disabled" | "outside_demo_area";
    disclaimer: string;
    message: string;
  };
  departureIntent: {
    requestedIso: string;
    wibClock: string;
    isDepartureIntentOnly: true;
    disclaimer: string;
  };
  recommended: MultimodalOptionDto;
  alternatives: MultimodalOptionDto[];
  companionRecommendation: {
    recommended: boolean;
    reasons: string[];
    verifiedVolunteers: VerifiedVolunteerCandidateDto[];
  };
}
