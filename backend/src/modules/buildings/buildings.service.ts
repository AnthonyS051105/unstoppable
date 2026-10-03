import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/errors.js";
import { computeScore, MAX_PATH_SLOPE_PERCENT, MIN_PATH_WIDTH_CM } from "./buildings.score.js";
import type { Building, BuildingBarrier, BuildingRow, GraphStats } from "./buildings.types.js";

const BUILDING_COLUMNS = Prisma.sql`
  id, name, code, faculty,
  ST_AsGeoJSON(location)::json AS location,
  floor_count AS "floorCount",
  has_lift AS "hasLift",
  has_accessible_toilet AS "hasAccessibleToilet",
  surveyed_at AS "surveyedAt"`;

function selectBuildings(where: Prisma.Sql) {
  return prisma.$queryRaw<BuildingRow[]>`
    SELECT ${BUILDING_COLUMNS} FROM buildings WHERE ${where} ORDER BY name`;
}

async function findBuildingRow(id: string): Promise<BuildingRow> {
  const [row] = await selectBuildings(Prisma.sql`id = ${id}::uuid`);
  if (!row) throw new AppError("NOT_FOUND", "Gedung tidak ditemukan.", 404);
  return row;
}

async function fetchGraphStats(buildingId: string): Promise<GraphStats> {
  const [stats] = await prisma.$queryRaw<GraphStats[]>`
    WITH building_nodes AS (
      SELECT id, node_type, floor_level, is_operational
      FROM path_nodes
      WHERE building_id = ${buildingId}::uuid AND status = 'approved'
    ),
    measured_indoor_edges AS (
      SELECT width_cm, slope_percent
      FROM path_edges
      WHERE status = 'approved' AND is_indoor
        AND width_cm IS NOT NULL AND slope_percent IS NOT NULL
        AND source_node_id IN (SELECT id FROM building_nodes)
    )
    SELECT
      (SELECT COUNT(*) FROM building_nodes WHERE node_type = 'entrance')::int AS "entranceCount",
      (SELECT COUNT(*) FROM building_nodes n
        WHERE n.node_type = 'entrance' AND EXISTS (
          SELECT 1 FROM path_edges e
          WHERE e.status = 'approved' AND NOT e.has_stairs
            AND n.id IN (e.source_node_id, e.target_node_id)
        ))::int AS "stairFreeEntranceCount",
      (SELECT COUNT(DISTINCT floor_level) FROM building_nodes
        WHERE node_type = 'lift' AND is_operational)::int AS "liftFloorCount",
      (SELECT COUNT(*) FROM measured_indoor_edges)::int AS "measuredEdgeCount",
      (SELECT COUNT(*) FROM measured_indoor_edges
        WHERE width_cm >= ${MIN_PATH_WIDTH_CM} AND ABS(slope_percent) <= ${MAX_PATH_SLOPE_PERCENT}
      )::int AS "compliantEdgeCount"`;
  return stats!;
}

// Gedung yang belum tersurvei tidak diberi skor: flag defaultnya (hasLift=false, dst.) bukan data lapangan.
async function withScore(row: BuildingRow): Promise<Building> {
  if (!row.surveyedAt) return { ...row, accessibilityScore: null, scoreBreakdown: null };
  return { ...row, ...computeScore(row, await fetchGraphStats(row.id)) };
}

export async function listBuildings(faculty?: string): Promise<Building[]> {
  const rows = await selectBuildings(faculty ? Prisma.sql`faculty = ${faculty}` : Prisma.sql`TRUE`);
  return Promise.all(rows.map(withScore));
}

export async function getBuilding(id: string): Promise<Building> {
  return withScore(await findBuildingRow(id));
}

// Hambatan = laporan aktif yang terkait edge/node milik gedung; kosong kalau memang belum ada.
export async function getBuildingBarriers(id: string): Promise<BuildingBarrier[]> {
  await findBuildingRow(id);
  return prisma.$queryRaw<BuildingBarrier[]>`
    SELECT rr.id AS "reportId", rr.category, rr.severity, rr.description,
           rr.corroboration_count AS "corroborationCount", rel.effect,
           rel.edge_id::text AS "edgeId", rel.node_id::text AS "nodeId", rr.created_at AS "createdAt"
    FROM report_edge_links rel
    JOIN road_reports rr ON rr.id = rel.report_id
    LEFT JOIN path_edges e ON e.id = rel.edge_id
    JOIN path_nodes n ON n.id = COALESCE(rel.node_id, e.source_node_id)
    WHERE rr.status = 'active'
      AND (rr.expires_at IS NULL OR rr.expires_at > now())
      AND n.building_id = ${id}::uuid
    ORDER BY rr.created_at DESC`;
}
