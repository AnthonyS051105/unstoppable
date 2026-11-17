/**
 * Controlled synthetic demo fixture definitions (demo-release-v1).
 * Never real field surveys: synthetic=true, verifiedSurvey=false, surveyedAt=null.
 */

export const DEMO_TAG = "demo-release-v1";
export const DEMO_PREFIX = "[DEMO]";
export const DEMO_DEV_REPAIR_BATCH = "demo-release-v1-dev-repair";

export type Coord = readonly [number, number];

export interface DevEdgeRepairSpec {
  readonly id: bigint;
  readonly expectedSourceNodeId: bigint;
  readonly expectedTargetNodeId: bigint;
  readonly expectedSourceNamePrefix: string;
  readonly expectedTargetNamePrefix: string;
  readonly expectedCorruptStart: Coord;
  readonly expectedCorruptEnd: Coord;
}

/**
 * Explicit allowlist of malformed [DEV] edges documented in qa/routing-report.md.
 * Node 38 (closed/non-operational) is intentionally NOT modified here.
 */
export const DEV_EDGE_REPAIR_SPECS: readonly DevEdgeRepairSpec[] = [
  {
    id: 30n,
    expectedSourceNodeId: 37n,
    expectedTargetNodeId: 40n,
    expectedSourceNamePrefix: "[DEV]",
    expectedTargetNamePrefix: "[DEV]",
    expectedCorruptStart: [110.3725, -7.7655],
    expectedCorruptEnd: [110.3726, -7.7656],
  },
  {
    id: 31n,
    expectedSourceNodeId: 37n,
    expectedTargetNodeId: 38n,
    expectedSourceNamePrefix: "[DEV]",
    expectedTargetNamePrefix: "[DEV]",
    expectedCorruptStart: [110.3725, -7.7655],
    expectedCorruptEnd: [110.3726, -7.7656],
  },
  {
    id: 33n,
    expectedSourceNodeId: 37n,
    expectedTargetNodeId: 38n,
    expectedSourceNamePrefix: "[DEV]",
    expectedTargetNamePrefix: "[DEV]",
    expectedCorruptStart: [110.3725, -7.7655],
    expectedCorruptEnd: [110.3726, -7.7656],
  },
] as const;

export const PRESERVED_CLOSURE_NODE_ID = 38n;

export interface DemoBuildingSpec {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly faculty: string;
  readonly coord: Coord;
  readonly floorCount: number;
  readonly hasLift: boolean;
  readonly hasAccessibleToilet: boolean;
}

export const DEMO_BUILDINGS: readonly DemoBuildingSpec[] = [
  {
    key: "origin_building",
    code: "DEMO-HALTE-SELATAN",
    name: "[DEMO] Halte Kampus Selatan",
    faculty: "Area Demo Aksesibilitas",
    coord: [110.378, -7.77],
    floorCount: 1,
    hasLift: false,
    hasAccessibleToilet: true,
  },
  {
    key: "destination_building",
    code: "DEMO-PERPUS-LANSIA",
    name: "[DEMO] Perpustakaan Ramah Lansia",
    faculty: "Area Demo Aksesibilitas",
    coord: [110.3787, -7.77],
    floorCount: 2,
    hasLift: true,
    hasAccessibleToilet: true,
  },
  {
    key: "isolated_building",
    code: "DEMO-PAVILIUN-TERISOLASI",
    name: "[DEMO] Paviliun Tangga Lama (Terisolasi)",
    faculty: "Area Demo Aksesibilitas",
    coord: [110.3804, -7.77],
    floorCount: 2,
    hasLift: false,
    hasAccessibleToilet: false,
  },
  {
    key: "transit_origin_building",
    code: "DEMO-KORIDOR-ASAL",
    name: "[DEMO] Terminal Asal Koridor Utara",
    faculty: "Koridor Multimoda Demo",
    coord: [110.378, -7.752],
    floorCount: 1,
    hasLift: true,
    hasAccessibleToilet: true,
  },
  {
    key: "transit_destination_building",
    code: "DEMO-KORIDOR-TUJUAN",
    name: "[DEMO] Pusat Layanan Lansia Selatan",
    faculty: "Koridor Multimoda Demo",
    coord: [110.3665, -7.7896],
    floorCount: 2,
    hasLift: true,
    hasAccessibleToilet: true,
  },
] as const;

export interface DemoNodeSpec {
  readonly key: string;
  readonly name: string;
  readonly nodeType: string;
  readonly coord: Coord;
  readonly buildingCode?: string;
  readonly floorLevel?: number;
  readonly crossingType?: string | null;
  readonly hasTrafficSignal?: boolean;
  readonly note: string;
}

export const DEMO_NODES: readonly DemoNodeSpec[] = [
  {
    key: "origin",
    name: "[DEMO] Gerbang Halte Kampus Selatan",
    nodeType: "gate",
    coord: [110.378, -7.77],
    buildingCode: "DEMO-HALTE-SELATAN",
    note: "SYNTHETIC demo-release-v1 origin node; not a verified field survey",
  },
  {
    key: "destination",
    name: "[DEMO] Pintu Utama Perpustakaan Ramah Lansia",
    nodeType: "entrance",
    coord: [110.3787, -7.77],
    buildingCode: "DEMO-PERPUS-LANSIA",
    note: "SYNTHETIC demo-release-v1 destination node; not a verified field survey",
  },
  {
    key: "stairs",
    name: "[DEMO] Tangga Pintas Plaza Demo",
    nodeType: "stairs",
    coord: [110.37835, -7.77004],
    note: "SYNTHETIC demo-release-v1 stairs branch node; not a verified field survey",
  },
  {
    key: "ramp",
    name: "[DEMO] Simpang Ramp Taman Demo",
    nodeType: "ramp",
    coord: [110.37835, -7.77032],
    note: "SYNTHETIC demo-release-v1 ramp branch node; not a verified field survey",
  },
  {
    key: "covered",
    name: "[DEMO] Koridor Teduh Barat Demo",
    nodeType: "junction",
    coord: [110.37835, -7.76959],
    note: "SYNTHETIC demo-release-v1 covered branch node; not a verified field survey",
  },
  {
    key: "guided",
    name: "[DEMO] Jalur Pemandu Taktil Demo",
    nodeType: "junction",
    coord: [110.37835, -7.76938],
    note: "SYNTHETIC demo-release-v1 guided branch node; not a verified field survey",
  },
  {
    key: "isolated",
    name: "[DEMO] Pintu Paviliun Tangga Lama (Terisolasi)",
    nodeType: "entrance",
    coord: [110.3804, -7.77],
    buildingCode: "DEMO-PAVILIUN-TERISOLASI",
    note: "SYNTHETIC demo-release-v1 disconnected destination; not a verified field survey",
  },
  {
    key: "transitOrigin",
    name: "[DEMO] Gerbang Terminal Koridor Utara",
    nodeType: "gate",
    coord: [110.378, -7.752],
    buildingCode: "DEMO-KORIDOR-ASAL",
    note: "SYNTHETIC demo-release-v1 long-distance origin; not a verified field survey",
  },
  {
    key: "transitStopA",
    name: "[DEMO] Halte A - Koridor Utara",
    nodeType: "gate",
    coord: [110.3786, -7.7521],
    note: "SYNTHETIC demo-release-v1 transit stop A ([DEMO] Bus A); not an actual GTFS stop",
  },
  {
    key: "transitStopB",
    name: "[DEMO] Halte B - Alun-Alun Selatan Demo",
    nodeType: "gate",
    coord: [110.3658, -7.7895],
    note: "SYNTHETIC demo-release-v1 transit stop B ([DEMO] Bus A); not an actual GTFS stop",
  },
  {
    key: "transitDestination",
    name: "[DEMO] Pintu Pusat Layanan Lansia Selatan",
    nodeType: "entrance",
    coord: [110.3665, -7.7896],
    buildingCode: "DEMO-KORIDOR-TUJUAN",
    note: "SYNTHETIC demo-release-v1 long-distance destination; not a verified field survey",
  },
] as const;

export interface DemoEdgeSpec {
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

/**
 * Four parallel branches between origin & destination with static bends (3 coords per edge),
 * plus two isolated first-mile/last-mile transit connectors.
 * Selected by actual accessibility_profiles weights:
 * - wheelchair -> ramp
 * - crutches   -> covered
 * - low_vision -> stairs
 * - blind      -> guided
 */
export const DEMO_EDGES: readonly DemoEdgeSpec[] = [
  // 1. Stairs branch -> low_vision
  {
    key: "stairs-0",
    branch: "stairs",
    leg: 0,
    fromKey: "origin",
    toKey: "stairs",
    coordinates: [
      [110.378, -7.77],
      [110.37818, -7.77003],
      [110.37835, -7.77004],
    ],
    surfaceType: "keramik",
    widthCm: 150,
    hasStairs: true,
    stepCount: 4,
    slopePercent: 0,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: false,
    guidingBlockCondition: null,
    operationalNote: "SYNTHETIC [DEMO] jalur tangga pintas plaza; bukan survei lapangan",
  },
  {
    key: "stairs-1",
    branch: "stairs",
    leg: 1,
    fromKey: "stairs",
    toKey: "destination",
    coordinates: [
      [110.37835, -7.77004],
      [110.37852, -7.77003],
      [110.3787, -7.77],
    ],
    surfaceType: "keramik",
    widthCm: 150,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 0,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: false,
    guidingBlockCondition: null,
    operationalNote: "SYNTHETIC [DEMO] jalur lanjutan tangga pintas; bukan survei lapangan",
  },

  // 2. Ramp branch -> wheelchair
  {
    key: "ramp-0",
    branch: "ramp",
    leg: 0,
    fromKey: "origin",
    toKey: "ramp",
    coordinates: [
      [110.378, -7.77],
      [110.37815, -7.77024],
      [110.37835, -7.77032],
    ],
    surfaceType: "beton",
    widthCm: 200,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 4,
    hasHandrail: true,
    isCovered: false,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: false,
    guidingBlockCondition: null,
    operationalNote: "SYNTHETIC [DEMO] jalur ramp landai taman; bukan survei lapangan",
  },
  {
    key: "ramp-1",
    branch: "ramp",
    leg: 1,
    fromKey: "ramp",
    toKey: "destination",
    coordinates: [
      [110.37835, -7.77032],
      [110.37855, -7.77024],
      [110.3787, -7.77],
    ],
    surfaceType: "beton",
    widthCm: 200,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 4,
    hasHandrail: true,
    isCovered: false,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: false,
    guidingBlockCondition: null,
    operationalNote: "SYNTHETIC [DEMO] jalur lanjutan ramp landai; bukan survei lapangan",
  },

  // 3. Covered branch -> crutches
  {
    key: "covered-0",
    branch: "covered",
    leg: 0,
    fromKey: "origin",
    toKey: "covered",
    coordinates: [
      [110.378, -7.77],
      [110.37812, -7.76969],
      [110.37835, -7.76959],
    ],
    surfaceType: "beton",
    widthCm: 180,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 0,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: false,
    guidingBlockCondition: null,
    operationalNote: "SYNTHETIC [DEMO] koridor beratap rata; bukan survei lapangan",
  },
  {
    key: "covered-1",
    branch: "covered",
    leg: 1,
    fromKey: "covered",
    toKey: "destination",
    coordinates: [
      [110.37835, -7.76959],
      [110.37858, -7.76969],
      [110.3787, -7.77],
    ],
    surfaceType: "beton",
    widthCm: 180,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 0,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: false,
    guidingBlockCondition: null,
    operationalNote: "SYNTHETIC [DEMO] lanjutan koridor beratap rata; bukan survei lapangan",
  },

  // 4. Guided branch -> blind
  {
    key: "guided-0",
    branch: "guided",
    leg: 0,
    fromKey: "origin",
    toKey: "guided",
    coordinates: [
      [110.378, -7.77],
      [110.37808, -7.76948],
      [110.37835, -7.76938],
    ],
    surfaceType: "paving",
    widthCm: 180,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 0,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: true,
    guidingBlockCondition: "baik",
    operationalNote: "SYNTHETIC [DEMO] jalur pemandu taktil & penerangan sintetis; bukan survei lapangan",
    extraMetadata: {
      illumination: "synthetic illuminated corridor (descriptive only)",
    },
  },
  {
    key: "guided-1",
    branch: "guided",
    leg: 1,
    fromKey: "guided",
    toKey: "destination",
    coordinates: [
      [110.37835, -7.76938],
      [110.37862, -7.76948],
      [110.3787, -7.77],
    ],
    surfaceType: "paving",
    widthCm: 180,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 0,
    hasHandrail: true,
    isCovered: true,
    isIndoor: false,
    isOneWay: false,
    hasGuidingBlock: true,
    guidingBlockCondition: "baik",
    operationalNote: "SYNTHETIC [DEMO] lanjutan jalur pemandu taktil; bukan survei lapangan",
    extraMetadata: {
      illumination: "synthetic illuminated corridor (descriptive only)",
    },
  },

  // 5. Long-distance multimodal first-mile & last-mile connectors (isolated from campus cluster)
  {
    key: "transit-first-mile-0",
    branch: "transit_first_mile",
    leg: 0,
    fromKey: "transitOrigin",
    toKey: "transitStopA",
    coordinates: [
      [110.378, -7.752],
      [110.3783, -7.75208],
      [110.3786, -7.7521],
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
    operationalNote: "SYNTHETIC [DEMO] konektor first-mile menuju Halte A ([DEMO] Bus A)",
    extraMetadata: {
      transitCorridorId: "demo-bus-a",
      transitStopId: "DEMO-STOP-A",
      legRole: "first_mile",
    },
  },
  {
    key: "transit-last-mile-0",
    branch: "transit_last_mile",
    leg: 0,
    fromKey: "transitStopB",
    toKey: "transitDestination",
    coordinates: [
      [110.3658, -7.7895],
      [110.36615, -7.78958],
      [110.3665, -7.7896],
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
    operationalNote: "SYNTHETIC [DEMO] konektor last-mile dari Halte B ([DEMO] Bus A)",
    extraMetadata: {
      transitCorridorId: "demo-bus-a",
      transitStopId: "DEMO-STOP-B",
      legRole: "last_mile",
    },
  },
] as const;

export const EXPECTED_LOCAL_PROFILE_BRANCH: Record<string, string> = {
  wheelchair: "ramp",
  crutches: "covered",
  low_vision: "stairs",
  blind: "guided",
};

export interface DemoAccountSpec {
  readonly key: string;
  readonly name: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly role: "mobility_user" | "blind_user" | "caregiver" | "volunteer" | "admin";
  readonly accessibilityProfileId?: "wheelchair" | "blind" | "crutches" | "low_vision";
  readonly volunteer?: {
    readonly serviceAreaNote: string;
    readonly centerCoord: Coord;
    readonly radiusMeters: number;
    readonly ratingAvg: number;
    readonly totalHelps: number;
  };
  readonly supportsFeatures: readonly string[];
}

export const DEMO_ACCOUNTS: readonly DemoAccountSpec[] = [
  {
    key: "senior_wheelchair",
    name: "[DEMO] Lansia Kursi Roda",
    email: "demo-senior-wheelchair@demo.unstoppable.local",
    phoneNumber: "089900001001",
    role: "mobility_user",
    accessibilityProfileId: "wheelchair",
    supportsFeatures: [
      "Login & profil kursi roda",
      "Rute ramah kursi roda (memilih cabang ramp)",
      "Perbandingan 4 profil rute",
      "AI Planner & pencarian gedung [DEMO]",
      "Pendampingan (cari relawan tersedia) & berbagi lokasi keluarga",
    ],
  },
  {
    key: "senior_blind",
    name: "[DEMO] Lansia Tunanetra",
    email: "demo-senior-blind@demo.unstoppable.local",
    phoneNumber: "089900001002",
    role: "blind_user",
    accessibilityProfileId: "blind",
    supportsFeatures: [
      "Login & profil tunanetra (audio-first)",
      "Rute jalur pemandu taktil (memilih cabang guided)",
      "Pencarian tujuan suara / AI Planner",
      "Relasi keluarga sos_only",
    ],
  },
  {
    key: "caregiver",
    name: "[DEMO] Keluarga Pendamping",
    email: "demo-caregiver@demo.unstoppable.local",
    phoneNumber: "089900001003",
    role: "caregiver",
    supportsFeatures: [
      "Dashboard keluarga memantau perjalanan akun [DEMO] lansia tertaut",
      "Ubah mode berbagi lokasi relasi demo",
    ],
  },
  {
    key: "volunteer",
    name: "[DEMO] Relawan Pendamping & Pemeta",
    email: "demo-volunteer@demo.unstoppable.local",
    phoneNumber: "089900001004",
    role: "volunteer",
    volunteer: {
      serviceAreaNote: "[DEMO] Area Kampus Selatan & Koridor Demo (sintetis)",
      centerCoord: [110.37835, -7.77],
      radiusMeters: 5000,
      ratingAvg: 4.9,
      totalHelps: 12,
    },
    supportsFeatures: [
      "Tampil di GET /api/volunteers/available & nearby untuk seluruh titik demo",
      "Kapasitas canCompanion & canMapData terverifikasi untuk demo pendampingan & peta editor",
    ],
  },
  {
    key: "admin",
    name: "[DEMO] Admin Verifikator",
    email: "demo-admin@demo.unstoppable.local",
    phoneNumber: "089900001005",
    role: "admin",
    supportsFeatures: [
      "Verifikasi node/edge draft atau peninjauan laporan demo",
    ],
  },
] as const;

export const DEMO_CAREGIVER_LINKS = [
  {
    blindUserKey: "senior_wheelchair",
    caregiverKey: "caregiver",
    relationshipType: "primary" as const,
    locationSharingMode: "during_trip" as const,
  },
  {
    blindUserKey: "senior_blind",
    caregiverKey: "caregiver",
    relationshipType: "primary" as const,
    locationSharingMode: "sos_only" as const,
  },
] as const;
