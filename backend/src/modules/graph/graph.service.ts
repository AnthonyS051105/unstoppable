import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { recordAuditLog } from "../../shared/audit-log.service.js";

export interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface GeoJsonLineString {
  type: "LineString";
  coordinates: Array<[number, number]>;
}

export interface BboxFilter {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  floorLevel?: number;
  status?: string;
}

export interface CreateNodeInput {
  nodeType: string;
  name?: string | null;
  buildingId?: string | null;
  floorLevel?: number;
  location: GeoJsonPoint;
  crossingType?: string | null;
  hasTrafficSignal?: boolean;
  isOperational?: boolean;
  operationalNote?: string | null;
  surveyedAt?: string | Date | null;
  actorId?: string | null;
  actorRole?: string | null;
}

export interface UpdateNodeInput {
  nodeType?: string;
  name?: string | null;
  buildingId?: string | null;
  floorLevel?: number;
  crossingType?: string | null;
  hasTrafficSignal?: boolean;
  isOperational?: boolean;
  operationalNote?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
}

export interface EdgeAttributesInput {
  surfaceType?: string | null;
  widthCm?: number | null;
  hasStairs?: boolean;
  stepCount?: number;
  slopePercent?: number | null;
  hasGuidingBlock?: boolean;
  guidingBlockCondition?: string | null;
  hasHandrail?: boolean;
  isCovered?: boolean;
  isIndoor?: boolean;
  isOneWay?: boolean;
}

export interface CreateEdgeInput extends EdgeAttributesInput {
  sourceNodeId: string | number | bigint;
  targetNodeId: string | number | bigint;
  geometry?: GeoJsonLineString | null;
  attributes?: EdgeAttributesInput;
  isOperational?: boolean;
  operationalNote?: string | null;
  surveyedAt?: string | Date | null;
  actorId?: string | null;
  actorRole?: string | null;
}

export interface UpdateEdgeInput extends EdgeAttributesInput {
  attributes?: EdgeAttributesInput;
  isOperational?: boolean;
  operationalNote?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
}

// ?bbox=minLng,minLat,maxLng,maxLat
export function parseBboxString(bboxRaw?: string): [number, number, number, number] {
  if (!bboxRaw) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Bbox parameter must be provided in the format: minLng,minLat,maxLng,maxLat.",
      400,
    );
  }
  const parts = bboxRaw.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Bbox format is invalid. Expected format: minLng,minLat,maxLng,maxLat.",
      400,
    );
  }
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

// GET /api/graph/nodes?bbox=minLng,minLat,maxLng,maxLat&floorLevel=&status=
export async function getNodesInBbox(filter: BboxFilter) {
  const statusFilter = filter.status ?? "approved";
  const floorFilter = filter.floorLevel !== undefined ? filter.floorLevel : null;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      nodeType: string;
      name: string | null;
      buildingId: string | null;
      floorLevel: number;
      geojson: string;
      crossingType: string | null;
      hasTrafficSignal: boolean;
      isOperational: boolean;
      operationalNote: string | null;
      status: string;
      surveyedAt: Date | null;
    }>
  >`
    SELECT
      id::text AS id,
      node_type AS "nodeType",
      name,
      building_id AS "buildingId",
      floor_level AS "floorLevel",
      ST_AsGeoJSON(location)::text AS geojson,
      crossing_type AS "crossingType",
      has_traffic_signal AS "hasTrafficSignal",
      is_operational AS "isOperational",
      operational_note AS "operationalNote",
      status,
      surveyed_at AS "surveyedAt"
    FROM path_nodes
    WHERE ST_Intersects(
      location::geometry,
      ST_MakeEnvelope(${filter.minLng}, ${filter.minLat}, ${filter.maxLng}, ${filter.maxLat}, 4326)
    )
    AND (${statusFilter}::text = 'all' OR status = ${statusFilter})
    AND (${floorFilter}::int IS NULL OR floor_level = ${floorFilter})
    ORDER BY id ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    nodeType: r.nodeType,
    name: r.name,
    buildingId: r.buildingId,
    floorLevel: r.floorLevel,
    location: JSON.parse(r.geojson) as GeoJsonPoint,
    crossingType: r.crossingType,
    hasTrafficSignal: r.hasTrafficSignal,
    isOperational: r.isOperational,
    operationalNote: r.operationalNote,
    status: r.status,
    surveyedAt: r.surveyedAt,
  }));
}

// POST /api/graph/nodes
export async function createNode(input: CreateNodeInput) {
  if (
    !input.location ||
    input.location.type !== "Point" ||
    !Array.isArray(input.location.coordinates) ||
    input.location.coordinates.length < 2
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid location format. Expected GeoJSON Point with coordinates [lng, lat].",
      400,
    );
  }

  const [lng, lat] = input.location.coordinates;
  const isAdmin = input.actorRole === "admin";
  const initialStatus = isAdmin ? "approved" : "draft";
  const approvedBy = isAdmin && input.actorId ? input.actorId : null;
  const surveyedAt = input.surveyedAt ? new Date(input.surveyedAt) : new Date();

  const [row] = await prisma.$queryRaw<
    Array<{
      id: string;
      nodeType: string;
      name: string | null;
      buildingId: string | null;
      floorLevel: number;
      geojson: string;
      crossingType: string | null;
      hasTrafficSignal: boolean;
      isOperational: boolean;
      operationalNote: string | null;
      status: string;
      surveyedAt: Date | null;
    }>
  >`
    INSERT INTO path_nodes (
      building_id,
      floor_level,
      node_type,
      name,
      location,
      crossing_type,
      has_traffic_signal,
      is_operational,
      operational_note,
      status,
      created_by,
      approved_by,
      surveyed_at,
      updated_at
    )
    VALUES (
      ${input.buildingId ?? null}::uuid,
      ${input.floorLevel ?? 0},
      ${input.nodeType},
      ${input.name ?? null},
      ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)::geography,
      ${input.crossingType ?? null},
      ${input.hasTrafficSignal ?? false},
      ${input.isOperational ?? true},
      ${input.operationalNote ?? null},
      ${initialStatus},
      ${input.actorId ?? null}::uuid,
      ${approvedBy}::uuid,
      ${surveyedAt},
      now()
    )
    RETURNING
      id::text AS id,
      node_type AS "nodeType",
      name,
      building_id AS "buildingId",
      floor_level AS "floorLevel",
      ST_AsGeoJSON(location)::text AS geojson,
      crossing_type AS "crossingType",
      has_traffic_signal AS "hasTrafficSignal",
      is_operational AS "isOperational",
      operational_note AS "operationalNote",
      status,
      surveyed_at AS "surveyedAt"
  `;

  if (!row) {
    throw new AppError("INTERNAL_ERROR", "Failed to create node.", 500);
  }

  if (isAdmin) {
    await recordAuditLog({
      actorId: input.actorId ?? null,
      action: "graph.create_approved",
      resourceType: "path_node",
      resourceId: row.id,
    });
  }

  return {
    id: row.id,
    nodeType: row.nodeType,
    name: row.name,
    buildingId: row.buildingId,
    floorLevel: row.floorLevel,
    location: JSON.parse(row.geojson) as GeoJsonPoint,
    crossingType: row.crossingType,
    hasTrafficSignal: row.hasTrafficSignal,
    isOperational: row.isOperational,
    operationalNote: row.operationalNote,
    status: row.status,
    surveyedAt: row.surveyedAt,
  };
}


// PATCH /api/graph/nodes/:id
export async function updateNode(
  nodeId: string | number | bigint,
  input: UpdateNodeInput,
) {
  const idBigInt = BigInt(nodeId);
  const existing = await prisma.pathNode.findUnique({
    where: { id: idBigInt },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "Node not found.", 404);
  }

  const isAdmin = input.actorRole === "admin";
  const isOperationalChanged =
    input.isOperational !== undefined &&
    input.isOperational !== existing.isOperational;

  const hasAttributeChanges =
    input.name !== undefined ||
    input.nodeType !== undefined ||
    input.floorLevel !== undefined ||
    input.buildingId !== undefined ||
    input.crossingType !== undefined ||
    input.hasTrafficSignal !== undefined;

  if (!isAdmin && existing.status === "approved" && hasAttributeChanges) {
    const [draftProposal] = await prisma.$queryRaw<
      Array<{ id: string; status: string }>
    >`
      INSERT INTO path_nodes (
        building_id,
        floor_level,
        node_type,
        name,
        location,
        crossing_type,
        has_traffic_signal,
        is_operational,
        operational_note,
        status,
        created_by,
        surveyed_at,
        updated_at
      )
      SELECT
        ${input.buildingId !== undefined ? input.buildingId : existing.buildingId}::uuid,
        ${input.floorLevel !== undefined ? input.floorLevel : existing.floorLevel},
        ${input.nodeType !== undefined ? input.nodeType : existing.nodeType},
        ${input.name !== undefined ? input.name : existing.name},
        location,
        ${input.crossingType !== undefined ? input.crossingType : existing.crossingType},
        ${input.hasTrafficSignal !== undefined ? input.hasTrafficSignal : existing.hasTrafficSignal},
        ${input.isOperational !== undefined ? input.isOperational : existing.isOperational},
        ${input.operationalNote !== undefined ? input.operationalNote : existing.operationalNote},
        'draft',
        ${input.actorId ?? null}::uuid,
        now(),
        now()
      FROM path_nodes
      WHERE id = ${idBigInt}
      RETURNING id::text AS id, status
    `;

    return {
      id: String(existing.id),
      proposalDraftId: draftProposal?.id ?? null,
      status: "draft_proposed",
    };
  }

  const updated = await prisma.pathNode.update({
    where: { id: idBigInt },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.nodeType !== undefined && { nodeType: input.nodeType }),
      ...(input.floorLevel !== undefined && { floorLevel: input.floorLevel }),
      ...(input.buildingId !== undefined && { buildingId: input.buildingId }),
      ...(input.crossingType !== undefined && {
        crossingType: input.crossingType,
      }),
      ...(input.hasTrafficSignal !== undefined && {
        hasTrafficSignal: input.hasTrafficSignal,
      }),
      ...(input.isOperational !== undefined && {
        isOperational: input.isOperational,
      }),
      ...(input.operationalNote !== undefined && {
        operationalNote: input.operationalNote,
      }),
    },
  });

  if (isAdmin || isOperationalChanged) {
    await recordAuditLog({
      actorId: input.actorId ?? null,
      action: isAdmin ? "graph.admin_edit" : "graph.operational_change",
      resourceType: "path_node",
      resourceId: String(updated.id),
      metadata: {
        before: {
          name: existing.name,
          nodeType: existing.nodeType,
          floorLevel: existing.floorLevel,
          isOperational: existing.isOperational,
          operationalNote: existing.operationalNote,
        },
        after: {
          name: updated.name,
          nodeType: updated.nodeType,
          floorLevel: updated.floorLevel,
          isOperational: updated.isOperational,
          operationalNote: updated.operationalNote,
        },
      },
    });
  }

  return {
    ...updated,
    id: String(updated.id),
    osmNodeId: updated.osmNodeId ? String(updated.osmNodeId) : null,
  };
}


// DELETE /api/graph/nodes/:id (BE-N-01-1 & SDD §5.4)
export async function deleteNode(
  nodeId: string | number | bigint,
  actorId?: string | null,
  actorRole?: string | null,
) {
  const idBigInt = BigInt(nodeId);
  const existing = await prisma.pathNode.findUnique({
    where: { id: idBigInt },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "Node not found.", 404);
  }

  const isAdmin = actorRole === "admin";
  if (!isAdmin) {
    if (existing.status !== "draft" || existing.createdById !== actorId) {
      throw new AppError(
        "FORBIDDEN",
        "volunteers can only delete their own draft nodes. Admins can delete any node.",
        403,
      );
    }
  }

  await prisma.pathNode.delete({ where: { id: idBigInt } });

  if (isAdmin) {
    await recordAuditLog({
      actorId: actorId ?? null,
      action: "graph.admin_delete",
      resourceType: "path_node",
      resourceId: String(idBigInt),
    });
  }

  return { deleted: true, id: String(idBigInt) };
}


// GET /api/graph/edges?bbox=minLng,minLat,maxLng,maxLat&floorLevel=&status=
export async function getEdgesInBbox(filter: BboxFilter) {
  const statusFilter = filter.status ?? "approved";
  const floorFilter = filter.floorLevel !== undefined ? filter.floorLevel : null;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      sourceNodeId: string;
      targetNodeId: string;
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
      isOperational: boolean;
      operationalNote: string | null;
      status: string;
      surveyedAt: Date | null;
    }>
  >`
    SELECT
      e.id::text AS id,
      e.source_node_id::text AS "sourceNodeId",
      e.target_node_id::text AS "targetNodeId",
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
      e.is_operational AS "isOperational",
      e.operational_note AS "operationalNote",
      e.status,
      e.surveyed_at AS "surveyedAt"
    FROM path_edges e
    JOIN path_nodes s ON s.id = e.source_node_id
    WHERE ST_Intersects(
      e.geometry::geometry,
      ST_MakeEnvelope(${filter.minLng}, ${filter.minLat}, ${filter.maxLng}, ${filter.maxLat}, 4326)
    )
    AND (${statusFilter}::text = 'all' OR e.status = ${statusFilter})
    AND (${floorFilter}::int IS NULL OR s.floor_level = ${floorFilter})
    ORDER BY e.id ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    sourceNodeId: r.sourceNodeId,
    targetNodeId: r.targetNodeId,
    geometry: JSON.parse(r.geojson) as GeoJsonLineString,
    lengthM: r.lengthM,
    attributes: {
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
    },
    isOperational: r.isOperational,
    operationalNote: r.operationalNote,
    status: r.status,
    surveyedAt: r.surveyedAt,
  }));
}


// POST /api/graph/edges
export async function createEdge(input: CreateEdgeInput) {
  const sourceId = BigInt(input.sourceNodeId);
  const targetId = BigInt(input.targetNodeId);

  if (sourceId === targetId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "path edges cannot connect a node to itself.",
      400,
    );
  }

  const attrs = { ...input, ...(input.attributes ?? {}) };
  const hasStairs = attrs.hasStairs ?? false;
  const stepCount = attrs.stepCount ?? 0;

  if ((hasStairs && stepCount <= 0) || (!hasStairs && stepCount > 0)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "If hasStairs is true, stepCount must be greater than 0 (and vice versa).",
      400,
    );
  }

  const isAdmin = input.actorRole === "admin";
  const initialStatus = isAdmin ? "approved" : "draft";
  const approvedBy = isAdmin && input.actorId ? input.actorId : null;
  const surveyedAt = input.surveyedAt ? new Date(input.surveyedAt) : new Date();

  const geojsonStr =
    input.geometry &&
    input.geometry.type === "LineString" &&
    Array.isArray(input.geometry.coordinates) &&
    input.geometry.coordinates.length >= 2
      ? JSON.stringify(input.geometry)
      : null;

  const [row] = await prisma.$queryRaw<
    Array<{
      id: string;
      sourceNodeId: string;
      targetNodeId: string;
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
      isOperational: boolean;
      operationalNote: string | null;
      status: string;
      surveyedAt: Date | null;
    }>
  >`
    WITH line_geom AS (
      SELECT
        CASE
          WHEN ${geojsonStr}::text IS NOT NULL THEN
            ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)::geography
          ELSE
            ST_MakeLine(s.location::geometry, t.location::geometry)::geography
        END AS geog
      FROM path_nodes s, path_nodes t
      WHERE s.id = ${sourceId} AND t.id = ${targetId}
    )
    INSERT INTO path_edges (
      source_node_id,
      target_node_id,
      geometry,
      length_m,
      surface_type,
      width_cm,
      has_stairs,
      step_count,
      slope_percent,
      has_handrail,
      is_covered,
      is_indoor,
      is_one_way,
      has_guiding_block,
      guiding_block_condition,
      is_operational,
      operational_note,
      status,
      created_by,
      approved_by,
      surveyed_at,
      updated_at
    )
    SELECT
      ${sourceId},
      ${targetId},
      line_geom.geog,
      ROUND(ST_Length(line_geom.geog)::numeric, 2),
      ${attrs.surfaceType ?? null},
      ${attrs.widthCm ?? null},
      ${hasStairs},
      ${stepCount},
      ${attrs.slopePercent ?? null},
      ${attrs.hasHandrail ?? false},
      ${attrs.isCovered ?? false},
      ${attrs.isIndoor ?? false},
      ${attrs.isOneWay ?? false},
      ${attrs.hasGuidingBlock ?? false},
      ${attrs.guidingBlockCondition ?? null},
      ${input.isOperational ?? true},
      ${input.operationalNote ?? null},
      ${initialStatus},
      ${input.actorId ?? null}::uuid,
      ${approvedBy}::uuid,
      ${surveyedAt},
      now()
    FROM line_geom
    RETURNING
      id::text AS id,
      source_node_id::text AS "sourceNodeId",
      target_node_id::text AS "targetNodeId",
      ST_AsGeoJSON(geometry)::text AS geojson,
      length_m::float AS "lengthM",
      surface_type AS "surfaceType",
      width_cm AS "widthCm",
      has_stairs AS "hasStairs",
      step_count AS "stepCount",
      slope_percent::float AS "slopePercent",
      has_guiding_block AS "hasGuidingBlock",
      guiding_block_condition AS "guidingBlockCondition",
      has_handrail AS "hasHandrail",
      is_covered AS "isCovered",
      is_indoor AS "isIndoor",
      is_one_way AS "isOneWay",
      is_operational AS "isOperational",
      operational_note AS "operationalNote",
      status,
      surveyed_at AS "surveyedAt"
  `;

  if (!row) {
    throw new AppError(
      "NOT_FOUND",
      "Source or target node not found.",
      404,
    );
  }

  if (isAdmin) {
    await recordAuditLog({
      actorId: input.actorId ?? null,
      action: "graph.create_approved",
      resourceType: "path_edge",
      resourceId: row.id,
    });
  }

  return {
    id: row.id,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    geometry: JSON.parse(row.geojson) as GeoJsonLineString,
    lengthM: row.lengthM,
    attributes: {
      surfaceType: row.surfaceType,
      widthCm: row.widthCm,
      hasStairs: row.hasStairs,
      stepCount: row.stepCount,
      slopePercent: row.slopePercent,
      hasGuidingBlock: row.hasGuidingBlock,
      guidingBlockCondition: row.guidingBlockCondition,
      hasHandrail: row.hasHandrail,
      isCovered: row.isCovered,
      isIndoor: row.isIndoor,
      isOneWay: row.isOneWay,
    },
    isOperational: row.isOperational,
    operationalNote: row.operationalNote,
    status: row.status,
    surveyedAt: row.surveyedAt,
  };
}


// PATCH /api/graph/edges/:id (SDD §5.4)
export async function updateEdge(
  edgeId: string | number | bigint,
  input: UpdateEdgeInput,
) {
  const idBigInt = BigInt(edgeId);
  const existing = await prisma.pathEdge.findUnique({
    where: { id: idBigInt },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "Edge segment not found.", 404);
  }

  const attrs = { ...input, ...(input.attributes ?? {}) };
  const isAdmin = input.actorRole === "admin";
  const isOperationalChanged =
    input.isOperational !== undefined &&
    input.isOperational !== existing.isOperational;

  const updated = await prisma.pathEdge.update({
    where: { id: idBigInt },
    data: {
      ...(attrs.surfaceType !== undefined && {
        surfaceType: attrs.surfaceType,
      }),
      ...(attrs.widthCm !== undefined && { widthCm: attrs.widthCm }),
      ...(attrs.hasStairs !== undefined && { hasStairs: attrs.hasStairs }),
      ...(attrs.stepCount !== undefined && { stepCount: attrs.stepCount }),
      ...(attrs.slopePercent !== undefined && {
        slopePercent: attrs.slopePercent,
      }),
      ...(attrs.hasHandrail !== undefined && {
        hasHandrail: attrs.hasHandrail,
      }),
      ...(attrs.isCovered !== undefined && { isCovered: attrs.isCovered }),
      ...(attrs.isIndoor !== undefined && { isIndoor: attrs.isIndoor }),
      ...(attrs.isOneWay !== undefined && { isOneWay: attrs.isOneWay }),
      ...(attrs.hasGuidingBlock !== undefined && {
        hasGuidingBlock: attrs.hasGuidingBlock,
      }),
      ...(attrs.guidingBlockCondition !== undefined && {
        guidingBlockCondition: attrs.guidingBlockCondition,
      }),
      ...(input.isOperational !== undefined && {
        isOperational: input.isOperational,
      }),
      ...(input.operationalNote !== undefined && {
        operationalNote: input.operationalNote,
      }),
    },
  });

  if (isAdmin || isOperationalChanged) {
    await recordAuditLog({
      actorId: input.actorId ?? null,
      action: isAdmin ? "graph.admin_edit" : "graph.operational_change",
      resourceType: "path_edge",
      resourceId: String(updated.id),
      metadata: {
        before: {
          surfaceType: existing.surfaceType,
          widthCm: existing.widthCm,
          hasGuidingBlock: existing.hasGuidingBlock,
          guidingBlockCondition: existing.guidingBlockCondition,
          isOperational: existing.isOperational,
        },
        after: {
          surfaceType: updated.surfaceType,
          widthCm: updated.widthCm,
          hasGuidingBlock: updated.hasGuidingBlock,
          guidingBlockCondition: updated.guidingBlockCondition,
          isOperational: updated.isOperational,
        },
      },
    });
  }

  return {
    ...updated,
    id: String(updated.id),
    sourceNodeId: String(updated.sourceNodeId),
    targetNodeId: String(updated.targetNodeId),
    osmWayId: updated.osmWayId ? String(updated.osmWayId) : null,
    lengthM: Number(updated.lengthM),
    slopePercent:
      updated.slopePercent !== null ? Number(updated.slopePercent) : null,
  };
}


// DELETE /api/graph/edges/:id 
export async function deleteEdge(
  edgeId: string | number | bigint,
  actorId?: string | null,
  actorRole?: string | null,
) {
  const idBigInt = BigInt(edgeId);
  const existing = await prisma.pathEdge.findUnique({
    where: { id: idBigInt },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "Segment edge not found.", 404);
  }

  const isAdmin = actorRole === "admin";
  if (!isAdmin) {
    if (existing.status !== "draft" || existing.createdById !== actorId) {
      throw new AppError(
        "FORBIDDEN",
        "Vounteers can only delete their own draft edges. Admins can delete any edge.",
        403,
      );
    }
  }

  await prisma.pathEdge.delete({ where: { id: idBigInt } });

  if (isAdmin) {
    await recordAuditLog({
      actorId: actorId ?? null,
      action: "graph.admin_delete",
      resourceType: "path_edge",
      resourceId: String(idBigInt),
    });
  }

  return { deleted: true, id: String(idBigInt) };
}


// GET /api/graph/coverage
export async function getGraphCoverage() {
  const rows = await prisma.$queryRaw<
    Array<{
      buildingId: string;
      name: string;
      faculty: string | null;
      nodeCount: number;
      edgeCount: number;
      approvedRatio: number;
      floorsMapped: number[];
      floorCount: number;
      lastSurveyedAt: Date | null;
    }>
  >`
    SELECT
      b.id AS "buildingId",
      b.name,
      b.faculty,
      COUNT(DISTINCT n.id)::int AS "nodeCount",
      COUNT(DISTINCT e.id)::int AS "edgeCount",
      COALESCE(
        ROUND(
          (
            COUNT(DISTINCT CASE WHEN n.status = 'approved' THEN n.id END)::numeric +
            COUNT(DISTINCT CASE WHEN e.status = 'approved' THEN e.id END)::numeric
          ) / NULLIF(COUNT(DISTINCT n.id) + COUNT(DISTINCT e.id), 0),
          2
        )::float,
        0
      ) AS "approvedRatio",
      COALESCE(
        ARRAY_AGG(DISTINCT n.floor_level ORDER BY n.floor_level) FILTER (WHERE n.id IS NOT NULL),
        ARRAY[]::int[]
      ) AS "floorsMapped",
      b.floor_count AS "floorCount",
      GREATEST(MAX(n.surveyed_at), MAX(e.surveyed_at), b.surveyed_at) AS "lastSurveyedAt"
    FROM buildings b
    LEFT JOIN path_nodes n ON n.building_id = b.id
    LEFT JOIN path_edges e ON e.source_node_id = n.id OR e.target_node_id = n.id
    GROUP BY b.id, b.name, b.faculty, b.floor_count, b.surveyed_at
    ORDER BY b.name ASC
  `;

  return rows;
}

// POST /api/graph/validate (API_CONTRACT.md §7 & SDD §5.3)
export async function validateGraphTopology(buildingId?: string) {
  const bId = buildingId ?? null;
  const issues: Array<Record<string, unknown>> = [];

  const orphans = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT n.id::text AS id
    FROM path_nodes n
    WHERE (${bId}::uuid IS NULL OR n.building_id = ${bId}::uuid)
      AND NOT EXISTS (
        SELECT 1 FROM path_edges e
        WHERE e.source_node_id = n.id OR e.target_node_id = n.id
      )
  `;
  for (const o of orphans) {
    issues.push({
      type: "orphan_node",
      nodeId: o.id,
      message: "Node not connected to any edge segment.",
    });
  }

  const zeroEdges = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT e.id::text AS id
    FROM path_edges e
    JOIN path_nodes s ON s.id = e.source_node_id
    WHERE e.length_m < 0.5
      AND (${bId}::uuid IS NULL OR s.building_id = ${bId}::uuid)
  `;
  for (const z of zeroEdges) {
    issues.push({
      type: "zero_length_edge",
      edgeId: z.id,
      message: "Segment length is less than 0.5 meters, which may indicate a mapping error.",
    });
  }

  const duplicates = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT MAX(e.id)::text AS id
    FROM path_edges e
    JOIN path_nodes s ON s.id = e.source_node_id
    WHERE (${bId}::uuid IS NULL OR s.building_id = ${bId}::uuid)
    GROUP BY LEAST(e.source_node_id, e.target_node_id), GREATEST(e.source_node_id, e.target_node_id), e.surface_type
    HAVING COUNT(*) > 1
  `;
  for (const d of duplicates) {
    issues.push({
      type: "duplicate_edge",
      edgeId: d.id,
      message: "There are duplicate segments between the same two nodes.",
    });
  }

  const floorGaps = await prisma.$queryRaw<
    Array<{ buildingId: string | null; floorLevel: number }>
  >`
    SELECT DISTINCT n.building_id AS "buildingId", n.floor_level AS "floorLevel"
    FROM path_nodes n
    WHERE n.floor_level <> 0
      AND (${bId}::uuid IS NULL OR n.building_id = ${bId}::uuid)
      AND NOT EXISTS (
        SELECT 1
        FROM path_edges e
        JOIN path_nodes s ON s.id = e.source_node_id
        JOIN path_nodes t ON t.id = e.target_node_id
        WHERE (
          (s.building_id IS NOT DISTINCT FROM n.building_id AND s.floor_level = n.floor_level AND t.floor_level <> n.floor_level)
          OR
          (t.building_id IS NOT DISTINCT FROM n.building_id AND t.floor_level = n.floor_level AND s.floor_level <> n.floor_level)
        )
        AND (s.node_type IN ('lift', 'stairs', 'ramp') OR t.node_type IN ('lift', 'stairs', 'ramp'))
      )
  `;
  for (const fg of floorGaps) {
    issues.push({
      type: "floor_gap",
      buildingId: fg.buildingId,
      floorLevel: fg.floorLevel,
      message: `There is a floor level (${fg.floorLevel}) in building ${fg.buildingId} that has nodes but no connecting edges to other floors.`,
    });
  }

  const missingAttrs = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT e.id::text AS id
    FROM path_edges e
    JOIN path_nodes s ON s.id = e.source_node_id
    WHERE (e.surface_type IS NULL OR e.width_cm IS NULL)
      AND (${bId}::uuid IS NULL OR s.building_id = ${bId}::uuid)
  `;
  for (const ma of missingAttrs) {
    issues.push({
      type: "missing_attribute",
      edgeId: ma.id,
      message: "Segment is missing required attributes (surface type or width).",
    });
  }

  const edgeCountRow = await prisma.pathEdge.count();
  if (edgeCountRow > 1) {
    const components = await prisma.$queryRaw<
      Array<{ component: bigint; nodeId: string }>
    >`
      SELECT component, MIN(node)::text AS "nodeId"
      FROM pgr_connectedComponents(
        'SELECT id::bigint AS id, source_node_id::bigint AS source, target_node_id::bigint AS target, length_m::float AS cost FROM path_edges'
      )
      GROUP BY component
    `;
    if (components.length > 1) {
      for (const comp of components.slice(1)) {
        issues.push({
          type: "disconnected_component",
          nodeId: comp.nodeId,
          message: "There are disconnected components in the graph that are not connected to the main path network.",
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}