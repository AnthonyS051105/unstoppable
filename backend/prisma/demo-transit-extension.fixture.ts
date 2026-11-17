/**
 * Additive synthetic demo transit extension fixture (demo-transit-ext-v1).
 * Composes strictly on top of demo-release-v1 without mutating real users,
 * surveys, [DEV] nodes/edges, node 38, or base demo-release-v1 entities.
 */

export const DEMO_TRANSIT_EXT_TAG = "demo-transit-ext-v1";
export const BASE_DEMO_RELEASE_TAG = "demo-release-v1";
export const PRESERVED_CLOSURE_NODE_ID = 38n;

export type Coord = readonly [number, number];

export interface ExtBuildingSpec {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly faculty: string;
  readonly coord: Coord;
  readonly floorCount: number;
  readonly hasLift: boolean;
  readonly hasAccessibleToilet: boolean;
}

export const DEMO_TRANSIT_EXT_BUILDINGS: readonly ExtBuildingSpec[] = [
  {
    key: "klinik_timur_building",
    code: "DEMO-KLINIK-TIMUR",
    name: "[DEMO] Klinik Rehabilitasi Timur",
    faculty: "Koridor Multimoda Demo",
    coord: [110.3885, -7.7896],
    floorCount: 1,
    hasLift: false,
    hasAccessibleToilet: true,
  },
] as const;

export interface ExtNodeSpec {
  readonly key: string;
  readonly name: string;
  readonly nodeType: string;
  readonly coord: Coord;
  readonly buildingCode?: string;
  readonly floorLevel?: number;
  readonly note: string;
}

export const DEMO_TRANSIT_EXT_NODES: readonly ExtNodeSpec[] = [
  {
    key: "transitStopB2",
    name: "[DEMO] Halte B2 - Peron Shuttle Timur",
    nodeType: "gate",
    coord: [110.3662, -7.7895],
    note: "SYNTHETIC demo-transit-ext-v1 transfer platform B2 ([DEMO] Shuttle B); not an actual GTFS stop",
  },
  {
    key: "transitStopC",
    name: "[DEMO] Halte C - Klinik Timur Demo",
    nodeType: "gate",
    coord: [110.3879, -7.7895],
    note: "SYNTHETIC demo-transit-ext-v1 accessible stop C ([DEMO] Shuttle B); not an actual GTFS stop",
  },
  {
    key: "transitStopCTangga",
    name: "[DEMO] Halte C2 - Tangga Pasar Timur Demo",
    nodeType: "stairs",
    coord: [110.3881, -7.7901],
    note: "SYNTHETIC demo-transit-ext-v1 stairs-only stop C2 ([DEMO] Angkutan Cepat C); not an actual GTFS stop",
  },
  {
    key: "transitKlinikTimur",
    name: "[DEMO] Pintu Klinik Rehabilitasi Timur",
    nodeType: "entrance",
    coord: [110.3885, -7.7896],
    buildingCode: "DEMO-KLINIK-TIMUR",
    note: "SYNTHETIC demo-transit-ext-v1 destination entrance; not a verified field survey",
  },
] as const;

export const REQUIRED_BASE_DEMO_NODES = [
  {
    key: "transitStopB",
    name: "[DEMO] Halte B - Alun-Alun Selatan Demo",
    expectedCoord: [110.3658, -7.7895] as Coord,
  },
] as const;

export interface ExtEdgeSpec {
  readonly key: string;
  readonly branch: string;
  readonly leg: number;
  readonly fromKey: string;
  readonly toKey: string;
  readonly coordinates: readonly Coord[];
  readonly surfaceType: "paving" | "aspal" | "beton" | "tanah" | "rumput" | "keramik";
  readonly widthCm: number;
  readonly hasStairs: boolean;
  readonly stepCount: number;
  readonly slopePercent: number;
  readonly hasHandrail: boolean;
  readonly isCovered: boolean;
  readonly isIndoor: boolean;
  readonly isOneWay: boolean;
  readonly hasGuidingBlock: boolean;
  readonly guidingBlockCondition: "baik" | "rusak" | "terputus" | "salah_arah" | null;
  readonly operationalNote: string;
  readonly extraMetadata?: Record<string, unknown>;
}

export const DEMO_TRANSIT_EXT_EDGES: readonly ExtEdgeSpec[] = [
  {
    key: "transit-transfer-b-b2",
    branch: "transit_transfer",
    leg: 0,
    fromKey: "transitStopB",
    toKey: "transitStopB2",
    coordinates: [
      [110.3658, -7.7895],
      [110.366, -7.78945],
      [110.3662, -7.7895],
    ],
    surfaceType: "paving",
    widthCm: 200,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 0,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: true,
    guidingBlockCondition: "baik",
    operationalNote: "SYNTHETIC [DEMO] jalur transfer datar beratap Halte B -> Halte B2 ([DEMO] Shuttle B)",
    extraMetadata: {
      legRole: "transfer_walk",
      fromStopId: "DEMO-STOP-B",
      toStopId: "DEMO-STOP-B2",
    },
  },
  {
    key: "transit-last-mile-c",
    branch: "transit_last_mile_ext",
    leg: 0,
    fromKey: "transitStopC",
    toKey: "transitKlinikTimur",
    coordinates: [
      [110.3879, -7.7895],
      [110.3882, -7.78952],
      [110.3885, -7.7896],
    ],
    surfaceType: "paving",
    widthCm: 200,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 1,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: true,
    guidingBlockCondition: "baik",
    operationalNote: "SYNTHETIC [DEMO] konektor last-mile ramah akses dari Halte C ke Klinik Rehabilitasi Timur",
    extraMetadata: {
      transitCorridorId: "demo-shuttle-b",
      transitStopId: "DEMO-STOP-C",
      legRole: "last_mile",
    },
  },
  {
    key: "transit-last-mile-c-stairs",
    branch: "transit_last_mile_stairs",
    leg: 0,
    fromKey: "transitStopCTangga",
    toKey: "transitKlinikTimur",
    coordinates: [
      [110.3881, -7.7901],
      [110.3883, -7.78985],
      [110.3885, -7.7896],
    ],
    surfaceType: "beton",
    widthCm: 110,
    hasStairs: true,
    stepCount: 8,
    slopePercent: 10,
    hasHandrail: true,
    isCovered: false,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: false,
    guidingBlockCondition: null,
    operationalNote: "SYNTHETIC [DEMO] konektor tangga curam Halte C2 ke Klinik Timur (tidak ramah kursi roda)",
    extraMetadata: {
      transitCorridorId: "demo-angkot-c",
      transitStopId: "DEMO-STOP-C2",
      legRole: "last_mile",
    },
  },
] as const;
