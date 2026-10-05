// Route Service -- backend/docs/SDD.md §4, docs/API_CONTRACT.md §5. Controller
// tidak boleh menyentuh Prisma langsung (backend/CLAUDE.local.md §3) -- semua
// akses data lewat fungsi-fungsi di file ini.
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import * as accessibilityProfilesService from "../accessibility-profiles/accessibility-profiles.service.js";
import { buildNarration } from "../narration/narration.service.js";
import { buildCostExpression, buildDegradePenaltyExpression } from "./weight-builder.js";
import { buildDifferences } from "./routes.differences.js";
import { buildSteps } from "./step-builder.js";
import type {
  CompareResultEntry,
  EdgeAttributesSnapshot,
  GeoJsonLineString,
  GeoJsonPoint,
  PathEdgeRow,
  PlanRouteResult,
  RouteDifference,
  Tolerance,
  UnreachableReason,
  WeightConfig,
} from "./routes.types.js";
import { WALKING_SPEED_M_PER_MIN } from "./routes.types.js";

const SNAP_RADIUS_M = 150;

interface DijkstraRow {
  seq: number;
  node: bigint;
  edge: bigint; // -1 untuk baris terakhir (tujuan, tanpa edge keluar)
  cost: number;
  aggCost: number;
}

// SDD §4.1 langkah 2 -- resolve weightConfig + toleranceOverrides efektif
// untuk satu user+profil. Kunci snake_case end-to-end (kontrak §4 +
// DATA_MODEL.md §3): bentuk tersimpan di UserAccessibilityProfile.toleranceOverrides,
// weightConfig.allowedOverrides, dan tipe Tolerance SEMUANYA snake_case --
// tidak ada lagi konversi camelCase yang dulu bisa membuat override tak pernah
// berlaku tanpa error (Task 16a/16b). HANYA field yang ada di allowedOverrides
// yang dipakai; field lain diabaikan (override opsional, bukan kontrak wajib).
function parseTolerance(raw: unknown, allowedOverrides: WeightConfig["allowedOverrides"]): Tolerance {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(allowedOverrides);
  const tol: Tolerance = {};

  if (allowed.has("max_steps") && typeof obj.max_steps === "number") tol.max_steps = obj.max_steps;
  if (allowed.has("max_slope_percent") && typeof obj.max_slope_percent === "number")
    tol.max_slope_percent = obj.max_slope_percent;
  if (allowed.has("min_width_cm") && typeof obj.min_width_cm === "number") tol.min_width_cm = obj.min_width_cm;
  if (allowed.has("avoid_uncovered") && typeof obj.avoid_uncovered === "boolean")
    tol.avoid_uncovered = obj.avoid_uncovered;

  return tol;
}

async function resolveProfile(
  userId: string,
  requestedProfileId: string | undefined,
): Promise<{ profileId: string; weightConfig: WeightConfig; tolerance: Tolerance }> {
  let profileId = requestedProfileId;
  let toleranceRaw: unknown = undefined;

  if (!profileId) {
    const userProfiles = await accessibilityProfilesService.getUserAccessibility(userId);
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
    const userProfiles = await accessibilityProfilesService.getUserAccessibility(userId);
    const match = userProfiles.find((p: { profileId: string }) => p.profileId === profileId);
    toleranceRaw = match?.toleranceOverrides;
  }

  // profileId sudah pasti terisi di titik ini: cabang if menyetelnya atau
  // melempar, cabang else sudah ada isinya sejak parameter (!profileId salah).
  const resolvedProfileId = profileId!;
  const profile = await getWeightConfigOrThrow(resolvedProfileId);
  const weightConfig = profile.weightConfig as unknown as WeightConfig;
  const tolerance = parseTolerance(toleranceRaw, weightConfig.allowedOverrides);

  return { profileId: resolvedProfileId, weightConfig, tolerance };
}

// profileId pada jalur ini BISA berasal dari request pengguna (lewat body
// planRouteSchema), beda dengan weightConfig itu sendiri yang selalu dari DB
// -- getProfileWeightConfig() pakai findUniqueOrThrow yang melempar
// PrismaClientKnownRequestError P2025 (bukan AppError) kalau profileId tidak
// dikenal, jadi dibungkus di sini supaya pengguna dapat 400 yang jelas,
// bukan 500 generik dari error-handler.ts.
async function getWeightConfigOrThrow(profileId: string) {
  try {
    return await accessibilityProfilesService.getProfileWeightConfig(profileId);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new AppError("VALIDATION_ERROR", `Profil aksesibilitas "${profileId}" tidak dikenal.`, 400);
    }
    throw err;
  }
}

// SDD §4.1 langkah 3 / DATA_MODEL.md §4.4 -- snap ke node terdekat dalam
// radius 150m, hanya node approved & operasional.
async function snapToNearestNode(point: GeoJsonPoint): Promise<{ nodeId: bigint; distanceM: number } | null> {
  const [lng, lat] = point.coordinates;
  const rows = await prisma.$queryRaw<{ id: bigint; distanceM: number }[]>`
    SELECT id, ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS "distanceM"
    FROM path_nodes
    WHERE status = 'approved' AND is_operational = TRUE
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${SNAP_RADIUS_M})
    ORDER BY "distanceM" ASC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { nodeId: row.id, distanceM: row.distanceM };
}

// SDD §4.3 -- jalankan pgr_dijkstra dengan ekspresi cost dinamis. costExpr
// dibangun dari weightConfig (tepercaya, dari DB) + tolerance yang SUDAH
// di-clamp di weight-builder.ts -- aman diselipkan sebagai Prisma.raw karena
// tidak pernah mengandung string mentah dari request pengguna.
async function runDijkstra(costExpr: string, degradePenaltyExpr: string, sourceNodeId: bigint, targetNodeId: bigint): Promise<DijkstraRow[]> {
  // Query edge untuk pgr_dijkstra TIDAK mengandung parameter apa pun dari
  // request pengguna -- costExpr/degradePenaltyExpr sudah dibangun murni dari
  // weightConfig (DB, tepercaya) + tolerance yang di-clamp di weight-builder.ts
  // (lihat aturan keamanan SDD §4.2). Karena itu dibangun sebagai string literal
  // SQL biasa (bukan Prisma.sql) -- pgr_dijkstra memang mengambil query SEBAGAI
  // STRING, bukan sebagai sub-select biasa, jadi tidak ada cara lain menyusunnya.
  // sourceNodeId/targetNodeId (parameter sungguhan, dari snapping koordinat
  // pengguna) tetap lewat placeholder Prisma.sql yang di-escape otomatis.
  const edgeSqlText = `
    SELECT e.id::bigint AS id,
           e.source_node_id::bigint AS source,
           e.target_node_id::bigint AS target,
           ${costExpr} AS cost,
           CASE WHEN e.is_one_way THEN -1 ELSE ${costExpr} END AS reverse_cost
    FROM path_edges e
    LEFT JOIN (
      SELECT rel.edge_id,
             MAX(CASE WHEN rel.effect = 'block' THEN 'block' ELSE 'degrade' END) AS max_effect,
             SUM(CASE WHEN rel.effect = 'degrade' THEN ${degradePenaltyExpr} ELSE 0 END) AS penalty
      FROM report_edge_links rel
      JOIN road_reports rr ON rr.id = rel.report_id
      WHERE rr.status = 'active'
      GROUP BY rel.edge_id
    ) r ON r.edge_id = e.id
    WHERE e.status = 'approved'
  `;

  // Dollar-quoting ($$...$$), persis pola docs/DATA_MODEL.md §4.5 -- BUKAN
  // escape kutip tunggal, karena query di dalamnya sendiri mengandung banyak
  // string literal ('approved', 'block', 'active', dst) yang harus tetap utuh.
  const rows = await prisma.$queryRaw<
    Array<{ seq: number; node: bigint; edge: bigint; cost: number; agg_cost: number }>
  >(Prisma.sql`
    SELECT d.seq, d.node, d.edge, d.cost, d.agg_cost
    FROM pgr_dijkstra(
      ${Prisma.raw(`$$${edgeSqlText}$$`)},
      ${sourceNodeId}::bigint, ${targetNodeId}::bigint, directed := true
    ) d
  `);

  return rows.map((r: { seq: number; node: bigint; edge: bigint; cost: number; agg_cost: number }) => ({
    seq: r.seq,
    node: r.node,
    edge: r.edge,
    cost: r.cost,
    aggCost: r.agg_cost,
  }));
}

async function fetchEdgeRows(edgeIds: bigint[]): Promise<Map<string, PathEdgeRow>> {
  if (edgeIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    Array<{
      edgeId: bigint;
      sourceNodeId: bigint;
      targetNodeId: bigint;
      geojson: string;
      lengthM: number;
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
      reportId: string | null;
      reportCategory: string | null;
      reportSeverity: string | null;
      reportEffect: string | null;
    }>
  >`
    SELECT
      e.id AS "edgeId",
      e.source_node_id AS "sourceNodeId",
      e.target_node_id AS "targetNodeId",
      ST_AsGeoJSON(e.geometry)::text AS geojson,
      e.length_m::float AS "lengthM",
      e.surface_type AS "surfaceType",
      e.width_cm AS "widthCm",
      e.has_stairs AS "hasStairs",
      e.step_count AS "stepCount",
      e.slope_percent::float AS "slopePercent",
      e.has_guiding_block AS "hasGuidingBlock",
      e.guiding_block_condition AS "guidingBlockCondition",
      e.has_handrail AS "hasHandrail",
      e.is_covered AS "isCovered",
      e.is_indoor AS "isIndoor",
      e.is_one_way AS "isOneWay",
      rr.id AS "reportId",
      rr.category AS "reportCategory",
      rr.severity AS "reportSeverity",
      rr.effect AS "reportEffect"
    FROM path_edges e
    LEFT JOIN LATERAL (
      SELECT rel.effect, rr.id, rr.category, rr.severity
      FROM report_edge_links rel
      JOIN road_reports rr ON rr.id = rel.report_id
      WHERE rel.edge_id = e.id AND rr.status = 'active'
      LIMIT 1
    ) rr ON TRUE
    WHERE e.id = ANY(${edgeIds})
  `;

  const map = new Map<string, PathEdgeRow>();
  for (const r of rows) {
    const attributes: EdgeAttributesSnapshot = {
      surfaceType: r.surfaceType,
      widthCm: r.widthCm,
      hasStairs: r.hasStairs,
      stepCount: r.stepCount,
      slopePercent: r.slopePercent,
      hasGuidingBlock: r.hasGuidingBlock,
      guidingBlockCondition: r.guidingBlockCondition,
      hasHandrail: r.hasHandrail,
      isCovered: r.isCovered,
      isIndoor: r.isIndoor,
      isOneWay: r.isOneWay,
    };
    map.set(r.edgeId.toString(), {
      edgeId: r.edgeId,
      sourceNodeId: r.sourceNodeId,
      targetNodeId: r.targetNodeId,
      geometry: JSON.parse(r.geojson) as GeoJsonLineString,
      lengthM: r.lengthM,
      attributes,
      activeReport:
        r.reportId && r.reportCategory && r.reportSeverity && r.reportEffect
          ? { reportId: r.reportId, category: r.reportCategory, severity: r.reportSeverity, effect: r.reportEffect }
          : null,
    });
  }
  return map;
}

// SDD §4.4 -- kalau dijkstra kosong, cari tahu KENAPA sebelum menyerah.
async function analyzeUnreachable(
  profileId: string,
  weightConfig: WeightConfig,
  sourceNodeId: bigint,
  targetNodeId: bigint,
): Promise<UnreachableReason[]> {
  const reasons: UnreachableReason[] = [];

  // 1. Re-run tanpa blocker (cost = panjang murni, tidak ada yang -1).
  const looseCostExpr = "e.length_m";
  const looseRows = await runDijkstra(looseCostExpr, "0", sourceNodeId, targetNodeId);

  if (looseRows.length === 0 || looseRows.every((r) => r.edge === -1n)) {
    reasons.push({ type: "no_path_in_graph", message: "Tidak ada jalur yang menghubungkan titik asal dan tujuan di graf." });
    return reasons;
  }

  const looseEdgeIds = looseRows.map((r) => r.edge).filter((id) => id !== -1n);
  const edgeMap = await fetchEdgeRows(looseEdgeIds);

  // Batas dipakai di sini berasal dari weightConfig DEFAULT profil (bukan
  // tolerance user) -- analisis "kenapa tidak terjangkau" menjelaskan batas
  // bawaan profil, bukan batas yang sudah dipersonalisasi.
  for (const edge of edgeMap.values()) {
    if (edge.attributes.hasStairs && weightConfig.blockers.some((b) => b.field === "hasStairs" && b.op === "eq")) {
      reasons.push({ type: "stairs_only", message: `Segmen ini hanya bisa dilalui lewat tangga (${edge.attributes.stepCount} anak tangga), tidak ada alternatif ramp.` });
    }
    const widthBlocker = weightConfig.blockers.find((b) => b.field === "widthCm" && b.op === "lt");
    if (widthBlocker && edge.attributes.widthCm !== null && edge.attributes.widthCm < (widthBlocker.value as number)) {
      reasons.push({ type: "too_narrow", message: `Lebar jalur ${edge.attributes.widthCm} cm, kurang dari ${widthBlocker.value} cm yang dibutuhkan.` });
    }
    const slopeBlocker = weightConfig.blockers.find((b) => b.field === "slopePercent" && b.op === "gt");
    if (slopeBlocker && edge.attributes.slopePercent !== null && edge.attributes.slopePercent > (slopeBlocker.value as number)) {
      reasons.push({ type: "too_steep", message: `Kelandaian ${edge.attributes.slopePercent}% melebihi batas ${slopeBlocker.value}%.` });
    }
    if (!edge.attributes.hasStairs && edge.activeReport?.effect === "block") {
      reasons.push({ type: "facility_broken", message: "Ada fasilitas yang sedang rusak/tidak bisa dilalui di sepanjang jalur ini." });
    }
  }

  // 4. Cek gedung tujuan: floorLevel > 0 && !hasLift.
  const destNode = await prisma.$queryRaw<{ floorLevel: number; buildingId: string | null }[]>`
    SELECT floor_level AS "floorLevel", building_id AS "buildingId" FROM path_nodes WHERE id = ${targetNodeId}
  `;
  const target = destNode[0];
  if (target?.buildingId && target.floorLevel > 0) {
    const building = await prisma.building.findUnique({ where: { id: target.buildingId }, select: { hasLift: true } });
    if (building && !building.hasLift) {
      reasons.push({
        type: "no_lift",
        message: `Gedung tujuan tidak memiliki lift ke lantai ${target.floorLevel}.`,
        buildingId: target.buildingId,
        floorLevel: target.floorLevel,
      });
    }
  }

  if (reasons.length === 0) {
    reasons.push({ type: "no_path_in_graph", message: "Tujuan ini belum bisa dijangkau dengan profil ini." });
  }

  return reasons;
}

async function findNearestReachablePoint(destinationPoint: GeoJsonPoint): Promise<GeoJsonPoint | null> {
  // Pendekatan sederhana untuk pass pertama: titik terdekat yang approved &
  // operasional dalam radius snap -- bukan node terjauh di sepanjang jalur
  // longgar (itu butuh menelusuri hasil analisis unreachable lebih dalam).
  // Cukup untuk menunjukkan "area terdekat yang bisa dicapai", akan disempurnakan
  // kalau analisis unreachable butuh presisi lebih saat demo nanti.
  const snapped = await snapToNearestNode(destinationPoint);
  if (!snapped) return null;
  const node = await prisma.$queryRaw<{ geojson: string }[]>`
    SELECT ST_AsGeoJSON(location)::text AS geojson FROM path_nodes WHERE id = ${snapped.nodeId}
  `;
  const row = node[0];
  if (!row) return null;
  return JSON.parse(row.geojson) as GeoJsonPoint;
}

async function throwUnreachable(
  profileId: string,
  weightConfig: WeightConfig,
  sourceNodeId: bigint | null,
  targetNodeId: bigint | null,
  destinationPoint: GeoJsonPoint,
  immediateReason?: UnreachableReason,
): Promise<never> {
  let reasons: UnreachableReason[];
  if (immediateReason) {
    reasons = [immediateReason];
  } else if (sourceNodeId !== null && targetNodeId !== null) {
    reasons = await analyzeUnreachable(profileId, weightConfig, sourceNodeId, targetNodeId);
  } else {
    reasons = [{ type: "area_not_mapped", message: "Lokasi ini belum ada dalam data graf aksesibilitas kami." }];
  }

  const nearestReachablePoint = await findNearestReachablePoint(destinationPoint);

  throw new AppError(
    "ROUTE_UNREACHABLE",
    `Tujuan ini belum bisa dijangkau secara mandiri dengan profil ${profileId}.`,
    422,
    { profileId, reasons, nearestReachablePoint, suggestion: "request_companion" },
  );
}

export async function planRoute(
  userId: string,
  origin: GeoJsonPoint,
  destination: GeoJsonPoint,
  requestedProfileId: string | undefined,
  includeNarration = false,
): Promise<PlanRouteResult> {
  const { profileId, weightConfig, tolerance } = await resolveProfile(userId, requestedProfileId);

  const [originSnap, destSnap] = await Promise.all([snapToNearestNode(origin), snapToNearestNode(destination)]);
  if (!originSnap || !destSnap) {
    const missingPoint = !originSnap ? origin : destination;
    await throwUnreachable(profileId, weightConfig, null, null, missingPoint, {
      type: "area_not_mapped",
      message: "Lokasi ini belum ada dalam data graf aksesibilitas kami.",
    });
  }

  const costExpr = buildCostExpression(weightConfig, tolerance);
  const degradeExpr = buildDegradePenaltyExpression(weightConfig);
  const dijkstraRows = await runDijkstra(costExpr, degradeExpr, originSnap!.nodeId, destSnap!.nodeId);

  const pathEdgeIds = dijkstraRows.map((r) => r.edge).filter((id) => id !== -1n);
  if (pathEdgeIds.length === 0) {
    await throwUnreachable(profileId, weightConfig, originSnap!.nodeId, destSnap!.nodeId, destination);
  }

  const edgeMap = await fetchEdgeRows(pathEdgeIds);
  const orderedEdges: PathEdgeRow[] = [];
  for (const id of pathEdgeIds) {
    const edge = edgeMap.get(id.toString());
    if (edge) orderedEdges.push(edge);
  }

  const totalDistanceM = orderedEdges.reduce((sum, e) => sum + e.lengthM, 0);
  const { steps, barriers } = buildSteps(orderedEdges, profileId);

  const geometry: GeoJsonLineString = {
    type: "LineString",
    coordinates: orderedEdges.flatMap((e, i) => (i === 0 ? e.geometry.coordinates : e.geometry.coordinates.slice(1))),
  };

  const surveyedAtRows = await prisma.$queryRaw<{ surveyedAt: Date | null }[]>`
    SELECT MIN(surveyed_at) AS "surveyedAt" FROM path_edges WHERE id = ANY(${pathEdgeIds})
  `;

  const result: PlanRouteResult = {
    reachable: true,
    profileId,
    totalDistanceM: Math.round(totalDistanceM * 10) / 10,
    estimatedDurationMin: Math.ceil(totalDistanceM / WALKING_SPEED_M_PER_MIN),
    edgeIds: pathEdgeIds.map((id) => id.toString()),
    geometry,
    steps,
    barriers,
    dataFreshness: {
      surveyedAt: surveyedAtRows[0]?.surveyedAt?.toISOString() ?? null,
      reportsCheckedAt: new Date().toISOString(),
    },
  };

  // Kontrak §5: field `narration` HANYA diisi saat includeNarration=true.
  // Panggil narration service (modul narration/speech §6) secara LANGSUNG
  // sebagai fungsi -- bukan HTTP call ke diri sendiri. buildNarration murni &
  // selalu berhasil (template fallback), jadi tidak perlu try/catch: narasi
  // tidak boleh menggagalkan rute. Fakta (jarak/arah) tetap dari steps[].
  if (includeNarration) {
    result.narration = buildNarration({
      steps: steps.map((s) => ({
        order: s.order,
        instruction: s.instruction,
        distanceM: s.distanceM,
        warnings: s.warnings,
      })),
      profileId,
    }).narration;
  }

  return result;
}

export async function compareRoutes(
  userId: string,
  origin: GeoJsonPoint,
  destination: GeoJsonPoint,
  profileIds: string[],
): Promise<{ results: CompareResultEntry[]; differences: RouteDifference[] }> {
  const results: CompareResultEntry[] = [];

  for (const profileId of profileIds) {
    try {
      const result = await planRoute(userId, origin, destination, profileId);
      const profile = await getWeightConfigOrThrow(profileId);
      results.push({
        profileId,
        label: profile.label,
        reachable: true,
        totalDistanceM: result.totalDistanceM,
        edgeIds: result.edgeIds,
        geometry: result.geometry,
        steps: result.steps,
        barriers: result.barriers,
      });
    } catch (err) {
      if (err instanceof AppError && err.code === "ROUTE_UNREACHABLE") {
        const details = err.details as { reasons: UnreachableReason[] };
        const profile = await getWeightConfigOrThrow(profileId);
        results.push({ profileId, label: profile.label, reachable: false, reasons: details.reasons });
      } else {
        throw err;
      }
    }
  }

  const differences = buildDifferences(results);
  return { results, differences };
}

// ---------------------------------------------------------------------------
// Saved routes (docs/API_CONTRACT.md §5)
// ---------------------------------------------------------------------------
// Kolom origin/destination = geography (Unsupported di Prisma, lihat
// schema.prisma SavedRoute) -- WAJIB lewat raw SQL + PostGIS, pola sama persis
// sessions.service.ts. Kepemilikan selalu lewat user_id dari req.user!.id
// (controller), tidak pernah dari body.

export interface SavedRouteParams {
  userId: string;
  name: string;
  origin: GeoJsonPoint;
  destination: GeoJsonPoint;
  edgeIds: string[];
  profileId?: string | undefined;
}

export interface SavedRouteRow {
  id: string;
  name: string;
  origin: GeoJsonPoint;
  destination: GeoJsonPoint;
  edgeIds: string[];
  profileId: string | null;
  createdAt: string;
}

function mapSavedRouteRow(r: {
  id: string;
  name: string;
  originGeojson: string;
  destinationGeojson: string;
  edgeIds: bigint[] | null;
  profileId: string | null;
  createdAt: Date;
}): SavedRouteRow {
  return {
    id: r.id,
    name: r.name,
    origin: JSON.parse(r.originGeojson) as GeoJsonPoint,
    destination: JSON.parse(r.destinationGeojson) as GeoJsonPoint,
    edgeIds: (r.edgeIds ?? []).map((id) => id.toString()),
    profileId: r.profileId,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listSavedRoutes(userId: string): Promise<SavedRouteRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      originGeojson: string;
      destinationGeojson: string;
      edgeIds: bigint[] | null;
      profileId: string | null;
      createdAt: Date;
    }>
  >`
    SELECT
      id,
      name,
      ST_AsGeoJSON(origin::geometry)::text AS "originGeojson",
      ST_AsGeoJSON(destination::geometry)::text AS "destinationGeojson",
      edge_ids AS "edgeIds",
      profile_id AS "profileId",
      created_at AS "createdAt"
    FROM saved_routes
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
  `;
  return rows.map(mapSavedRouteRow);
}

export async function createSavedRoute(params: SavedRouteParams): Promise<SavedRouteRow> {
  // profileId, bila ada, harus profil yang dikenal -- supaya saved route tidak
  // menyimpan referensi profil yatim. getWeightConfigOrThrow melempar 400
  // VALIDATION_ERROR untuk profileId tak dikenal (konsisten dengan planRoute).
  if (params.profileId) {
    await getWeightConfigOrThrow(params.profileId);
  }

  const edgeIds = params.edgeIds.map((id) => BigInt(id));
  const [origLng, origLat] = params.origin.coordinates;
  const [destLng, destLat] = params.destination.coordinates;

  const [row] = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      originGeojson: string;
      destinationGeojson: string;
      edgeIds: bigint[] | null;
      profileId: string | null;
      createdAt: Date;
    }>
  >`
    INSERT INTO saved_routes (id, user_id, name, origin, destination, edge_ids, profile_id, created_at)
    VALUES (
      gen_random_uuid(),
      ${params.userId}::uuid,
      ${params.name},
      ST_SetSRID(ST_MakePoint(${origLng}, ${origLat}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${destLng}, ${destLat}), 4326)::geography,
      ${edgeIds}::bigint[],
      ${params.profileId ?? null},
      now()
    )
    RETURNING
      id,
      name,
      ST_AsGeoJSON(origin::geometry)::text AS "originGeojson",
      ST_AsGeoJSON(destination::geometry)::text AS "destinationGeojson",
      edge_ids AS "edgeIds",
      profile_id AS "profileId",
      created_at AS "createdAt"
  `;

  return mapSavedRouteRow(row!);
}

// Kepemilikan dipaksakan di WHERE user_id = ... -- kalau tidak ada baris
// terpengaruh, saved route bukan milik user ini (atau sudah terhapus) ->
// controller memetakannya ke 404. Tidak membocorkan keberadaan rute milik
// orang lain.
export async function deleteSavedRoute(id: string, userId: string): Promise<boolean> {
  const affected = await prisma.$executeRaw`
    DELETE FROM saved_routes WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
  `;
  return affected > 0;
}

// Logika diff dipindah ke routes.differences.ts (fungsi murni, DB-free, agar
// bisa diuji unit tanpa koneksi Supabase -- lihat routes.differences.test.ts).
