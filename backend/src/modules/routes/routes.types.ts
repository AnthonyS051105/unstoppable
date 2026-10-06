// Tipe domain Route Service -- bentuk persis docs/DATA_MODEL.md §3
// (weightConfig) dan docs/API_CONTRACT.md §5 (request/response /routes/plan,
// /routes/compare). Ini kontrak internal: jangan diubah tanpa koordinasi tim
// (weightConfig disusun bersama Anthon selaku pemilik accessibility-profiles).

export interface BlockerRule {
  field: string; // nama atribut edge, camelCase (mis. "hasStairs", "widthCm")
  op: "eq" | "lt" | "gt";
  value: boolean | number;
}

export interface SlopeTier {
  max: number;
  factor: number;
}

export interface WeightConfig {
  baseCostPerMeter: number;
  blockers: BlockerRule[];
  multipliers: {
    surfaceType: Record<string, number>;
    slopePercent: SlopeTier[];
  };
  penalties: {
    noGuidingBlock: number;
    guidingBlockDamaged: number;
    perStep: number;
    uncovered: number;
    reportDegrade: number;
    reportBlock: number | null; // null = blocker (tak terhingga)
  };
  // Kunci snake_case end-to-end (kontrak §4 + DATA_MODEL.md §3). Nama ini
  // SAMA PERSIS dengan kunci di toleranceOverrides pengguna -- satu sumber
  // kebenaran, tidak ada lagi pemetaan camelCase<->snake_case yang bisa
  // mismatch diam-diam (Task 16a/16b).
  allowedOverrides: Array<OverrideKey>;
}

// Kunci override yang valid -- dipakai weightConfig.allowedOverrides (dari DB)
// DAN toleranceOverrides pengguna (dari input). Satu daftar, satu bentuk
// (snake_case). OVERRIDE_KEYS dipakai weight-builder.ts untuk fail-fast
// terhadap kunci allowedOverrides yang tak dikenal (data seed salah).
export const OVERRIDE_KEYS = ["max_steps", "max_slope_percent", "min_width_cm", "avoid_uncovered"] as const;
export type OverrideKey = (typeof OVERRIDE_KEYS)[number];

// Bentuk internal Route Service setelah toleranceOverrides pengguna dibaca &
// di-clamp. Kunci snake_case, konsisten dengan kontrak §4, allowedOverrides,
// dan bentuk tersimpan di UserAccessibilityProfile.toleranceOverrides -- tidak
// ada konversi penamaan lagi (lihat routes.service.ts#parseTolerance).
export interface Tolerance {
  max_steps?: number;
  max_slope_percent?: number;
  min_width_cm?: number;
  avoid_uncovered?: boolean;
}

export interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface GeoJsonLineString {
  type: "LineString";
  coordinates: Array<[number, number]>;
}

export interface EdgeAttributesSnapshot {
  surfaceType: string | null;
  widthCm: number | null;
  hasStairs: boolean;
  stepCount: number;
  slopePercent: number | null;
  hasGuidingBlock: boolean;
  guidingBlockCondition: string | null;
  hasHandrail: boolean;
  isCovered: boolean;
  isIndoor: boolean;
  isOneWay: boolean;
}

// Baris mentah hasil pgr_dijkstra + detail edge yang dilalui -- input step-builder.ts.
export interface PathEdgeRow {
  edgeId: bigint;
  sourceNodeId: bigint;
  targetNodeId: bigint;
  geometry: GeoJsonLineString;
  lengthM: number;
  attributes: EdgeAttributesSnapshot;
  activeReport: { reportId: string; category: string; severity: string; effect: string } | null;
}

export type StepWarningType = "slope" | "stairs" | "guiding_block" | "report";
export type WarningSeverity = "low" | "medium" | "high";

export interface StepWarning {
  type: StepWarningType;
  severity: WarningSeverity;
  message: string;
}

export interface RouteStep {
  order: number;
  edgeId: string;
  instruction: string;
  distanceM: number;
  startPoint?: GeoJsonPoint;
  attributes: {
    surfaceType: string | null;
    isIndoor: boolean;
    hasStairs: boolean;
    slopePercent: number;
  };
  warnings: StepWarning[];
}

export interface RouteBarrier {
  edgeId: string;
  source: "report";
  reportId: string;
  category: string;
  severity: string;
  message: string;
}

export interface PlanRouteResult {
  reachable: true;
  profileId: string;
  totalDistanceM: number;
  estimatedDurationMin: number;
  edgeIds: string[];
  geometry: GeoJsonLineString;
  steps: RouteStep[];
  barriers: RouteBarrier[];
  narration?: string;
  dataFreshness: { surveyedAt: string | null; reportsCheckedAt: string };
}

export type UnreachableReasonType =
  | "area_not_mapped"
  | "no_path_in_graph"
  | "stairs_only"
  | "too_narrow"
  | "too_steep"
  | "facility_broken"
  | "no_lift";

export interface UnreachableReason {
  type: UnreachableReasonType;
  message: string;
  buildingId?: string;
  floorLevel?: number;
}

export interface UnreachableDetails {
  profileId: string;
  reasons: UnreachableReason[];
  nearestReachablePoint: GeoJsonPoint | null;
  suggestion: "request_companion";
}

export interface CompareResultEntry {
  profileId: string;
  label: string;
  reachable: boolean;
  totalDistanceM?: number;
  edgeIds?: string[];
  geometry?: GeoJsonLineString;
  steps?: RouteStep[];
  barriers?: RouteBarrier[];
  reasons?: UnreachableReason[];
}

export type DifferenceType = "avoided_edge" | "extra_distance" | "different_entrance" | "unreachable";

export interface RouteDifference {
  type: DifferenceType;
  edgeId?: string;
  avoidedByProfileId?: string;
  profileId?: string;
  extraM?: number;
  reason: string;
}

// Rata-rata kecepatan jalan orang dewasa ~4.5 km/jam ~ 75 m/menit. Dipakai
// untuk estimatedDurationMin -- bukan dari dokumen manapun, nilai akal sehat
// yang bisa disetel ulang kalau data uji pengguna nyata tersedia (sama
// seperti catatan "titik awal, bukan kebenaran" di DATA_MODEL.md §3).
export const WALKING_SPEED_M_PER_MIN = 75;
