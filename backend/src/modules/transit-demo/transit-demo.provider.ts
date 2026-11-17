import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { GeoJsonPoint } from "../routes/routes.types.js";
import type {
  TransitActivationResult,
  TransitFixtureSpec,
  TransitProviderAdapter,
} from "./transit-demo.types.js";

const coordTupleSchema = z.tuple([z.number().finite(), z.number().finite()]);
const boardingEnum = z.enum(["accessible", "not_accessible", "unknown"]);

const stopSchema = z.object({
  stopId: z.string().min(1),
  role: z.enum(["board", "alight"]),
  nodeKey: z.string().min(1),
  name: z.string().min(1),
  coordinates: coordTupleSchema,
  platformCode: z.string().nullable().optional().default(null),
  tags: z.array(z.string()),
  accessibility: z.object({
    wheelchairBoarding: boardingEnum,
    lowFloorRamp: z.boolean().nullable(),
    tactilePaving: z.boolean().nullable(),
    audioAnnouncement: z.boolean().nullable(),
    stepCount: z.number().int().nonnegative().nullable(),
    verifiedAt: z.string().nullable(),
    synthetic: z.literal(true),
  }),
});

const placeRefSchema = z.object({
  buildingCode: z.string().min(1),
  name: z.string().min(1),
  nodeKey: z.string().optional(),
  coordinates: coordTupleSchema,
});

const corridorSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(["bus", "shuttle"]),
  synthetic: z.literal(true),
  routeShortName: z.string().min(1),
  headsign: z.string().min(1),
  scheduleType: z.literal("synthetic_frequency"),
  headwayMinutes: z.number().positive(),
  operatingHoursWib: z.string().min(1),
  lastUpdatedIso: z.string().min(1),
  staleAfterMinutes: z.number().positive(),
  syntheticDeparturesWib: z.array(z.string().min(1)).min(1),
  estimatedTransitDurationMin: z.number().int().positive(),
  vehicleAccessibility: z.enum(["low_floor", "high_floor_steps", "unknown"]),
  boardingAccessibility: boardingEnum,
  stepCount: z.number().int().nonnegative().nullable(),
  fare: z.object({
    amountIdr: z.number().nonnegative().nullable(),
    currency: z.literal("IDR"),
    source: z.literal("synthetic_demo"),
    note: z.string(),
  }),
  originPlace: placeRefSchema.optional(),
  destinationPlace: placeRefSchema.optional(),
  stops: z.array(stopSchema).min(2),
});

const transferSchema = z.object({
  id: z.string().min(1),
  fromCorridorId: z.string().min(1),
  fromStopId: z.string().min(1),
  toCorridorId: z.string().min(1),
  toStopId: z.string().min(1),
  minTransferMinutes: z.number().int().nonnegative(),
  transferType: z.enum(["accessible_walk", "stairs_walk"]),
  synthetic: z.literal(true),
});

const transitFixtureSchema = z.object({
  fixtureTag: z.string().min(1),
  synthetic: z.literal(true),
  verifiedFeed: z.literal(false),
  timezone: z.literal("Asia/Jakarta"),
  lastUpdatedIso: z.string().min(1),
  staleAfterMinutes: z.number().positive(),
  disclaimer: z.string().min(1),
  demoAreaRadiusMeters: z.number().positive().default(300),
  demoBuildingCodes: z.array(z.string()).default([]),
  corridors: z.array(corridorSchema).min(1),
  transfers: z.array(transferSchema).default([]),
});

export function haversineMeters(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function resolveDefaultFixturePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../prisma/demo-release.transit.json"),
    path.resolve(process.cwd(), "prisma/demo-release.transit.json"),
    path.resolve(process.cwd(), "backend/prisma/demo-release.transit.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export function loadTransitFixture(filePath = resolveDefaultFixturePath()): TransitFixtureSpec {
  const raw = fs.readFileSync(filePath, "utf8");
  return transitFixtureSchema.parse(JSON.parse(raw)) as TransitFixtureSpec;
}

export class DemoStaticTransitProvider implements TransitProviderAdapter {
  public readonly adapterName = "DemoStaticTransitAdapter";
  public readonly synthetic = true as const;
  public readonly verifiedFeed = false as const;
  private readonly fixture: TransitFixtureSpec;

  constructor(fixture?: TransitFixtureSpec) {
    this.fixture = fixture ?? loadTransitFixture();
  }

  public getFixture(): TransitFixtureSpec {
    return this.fixture;
  }

  public checkActivation(params: {
    demoContext: boolean;
    origin: GeoJsonPoint;
    destination: GeoJsonPoint;
    demoAnchors: Array<{ label: string; point: GeoJsonPoint }>;
  }): TransitActivationResult {
    if (!params.demoContext) {
      return {
        active: false,
        reason: "demo_context_disabled",
        message:
          "Mode Data Transportasi Demo sedang dimatikan. Perhitungan hanya menampilkan jalur pejalan kaki terverifikasi.",
      };
    }

    const anchors: Array<[number, number]> = [
      ...params.demoAnchors.map((a) => a.point.coordinates),
    ];
    for (const c of this.fixture.corridors) {
      if (c.originPlace) anchors.push(c.originPlace.coordinates);
      if (c.destinationPlace) anchors.push(c.destinationPlace.coordinates);
      for (const s of c.stops) anchors.push(s.coordinates);
    }

    const radius = this.fixture.demoAreaRadiusMeters;
    const originMatched = anchors.some(
      (anchor) => haversineMeters(params.origin.coordinates, anchor) <= radius,
    );
    const destMatched = anchors.some(
      (anchor) => haversineMeters(params.destination.coordinates, anchor) <= radius,
    );

    if (!originMatched || !destMatched) {
      return {
        active: false,
        reason: "outside_demo_area",
        message:
          "Lokasi asal atau tujuan berada di luar area dataset transportasi demo [DEMO]. Perjalanan di luar area demo hanya menggunakan rute pejalan kaki tanpa data transit eksternal.",
      };
    }

    return {
      active: true,
      reason: "active_demo_od",
      message:
        "Data transportasi demo sintetis aktif untuk pasangan lokasi [DEMO] (bukan jadwal GTFS atau operator nyata).",
    };
  }
}

export const defaultDemoTransitProvider = new DemoStaticTransitProvider();
