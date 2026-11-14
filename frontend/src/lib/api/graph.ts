// Graph / Mapping API client (API_CONTRACT §7, API_DOCS §8).
import { api, ApiError, jsonBody } from "@/lib/api-client";
import type { GeoPoint } from "@/types/api";

export interface GraphNodeDto {
  id: string;
  nodeType: string;
  name: string | null;
  buildingId: string | null;
  floorLevel: number;
  location: GeoPoint;
  crossingType?: string | null;
  hasTrafficSignal?: boolean;
  isOperational?: boolean;
  operationalNote?: string | null;
  status: string;
  surveyedAt?: string | null;
}

export interface EdgeAttributes {
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

export interface GraphEdgeDto {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  geometry?: { type: "LineString"; coordinates: [number, number][] } | null;
  lengthM: number;
  attributes: EdgeAttributes;
  isOperational?: boolean;
  operationalNote?: string | null;
  status: string;
  surveyedAt?: string | null;
}

export interface CreateNodeInput {
  nodeType: string;
  name?: string | null;
  buildingId?: string | null;
  floorLevel?: number;
  location: GeoPoint;
  crossingType?: string | null;
  hasTrafficSignal?: boolean;
  isOperational?: boolean;
  operationalNote?: string | null;
  surveyedAt?: string | null;
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
}

export interface CreateEdgeInput extends EdgeAttributes {
  sourceNodeId: string | number;
  targetNodeId: string | number;
  geometry?: { type: "LineString"; coordinates: [number, number][] } | null;
  isOperational?: boolean;
  operationalNote?: string | null;
  surveyedAt?: string | null;
  attributes?: EdgeAttributes;
}

export interface UpdateEdgeInput extends EdgeAttributes {
  isOperational?: boolean;
  operationalNote?: string | null;
  attributes?: EdgeAttributes;
}

export interface GraphCoverageBuilding {
  buildingId: string;
  name: string;
  faculty: string | null;
  nodeCount: number;
  edgeCount: number;
  approvedRatio: number;
  floorsMapped: number[];
  floorCount: number;
  lastSurveyedAt: string | null;
}

export interface TopologyIssue {
  type: string;
  nodeId?: string;
  edgeId?: string;
  buildingId?: string | null;
  floorLevel?: number;
  message: string;
}

export interface ValidateTopologyResult {
  valid: boolean;
  issues: TopologyIssue[];
}

export interface GraphQueryFilter {
  bbox?: [number, number, number, number] | string;
  floorLevel?: number | string;
  status?: string;
}

export const DEFAULT_BBOX: [number, number, number, number] = [110.35, -7.85, 110.40, -7.75];

function buildQuery(filter?: GraphQueryFilter): string {
  const params = new URLSearchParams();
  const rawBbox = filter?.bbox ?? DEFAULT_BBOX;
  const bboxStr = Array.isArray(rawBbox) ? rawBbox.join(",") : rawBbox;
  params.set("bbox", bboxStr);

  if (filter?.floorLevel !== undefined && filter.floorLevel !== "" && filter.floorLevel !== null) {
    const fl = filter.floorLevel === "Luar" ? 0 : Number(filter.floorLevel);
    if (!Number.isNaN(fl)) {
      params.set("floorLevel", String(fl));
    }
  }

  if (filter?.status) {
    params.set("status", filter.status);
  }

  return params.toString();
}

/** Capability check for graph mapping actions (BE requireMapper). */
export function canMapData(
  role: string | undefined,
  profile?: { verificationStatus?: string; canMapData?: boolean } | null,
): boolean {
  if (role === "admin" || role === "mapper") return true;
  if (role === "volunteer" && profile?.verificationStatus === "verified" && Boolean(profile.canMapData)) {
    return true;
  }
  return false;
}

export const graphApi = {
  listNodes: (filter?: GraphQueryFilter, signal?: AbortSignal) =>
    api<GraphNodeDto[]>(`/graph/nodes?${buildQuery(filter)}`, { signal, cache: "no-store" }),

  createNode: (input: CreateNodeInput, signal?: AbortSignal) => {
    if (!input.location || input.location.type !== "Point" || !Array.isArray(input.location.coordinates)) {
      throw new ApiError("VALIDATION_ERROR", "Koordinat lokasi node tidak valid.", 400);
    }
    return api<GraphNodeDto>("/graph/nodes", {
      ...jsonBody({
        ...input,
        floorLevel: input.floorLevel ?? 0,
      }),
      signal,
    });
  },

  updateNode: (id: string | number, input: UpdateNodeInput, signal?: AbortSignal) =>
    api<GraphNodeDto | { id: string; proposalDraftId: string | null; status: string }>(
      `/graph/nodes/${encodeURIComponent(String(id))}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        signal,
      },
    ),

  deleteNode: (id: string | number, signal?: AbortSignal) =>
    api<void>(`/graph/nodes/${encodeURIComponent(String(id))}`, {
      method: "DELETE",
      signal,
    }),

  listEdges: (filter?: GraphQueryFilter, signal?: AbortSignal) =>
    api<GraphEdgeDto[]>(`/graph/edges?${buildQuery(filter)}`, { signal, cache: "no-store" }),

  createEdge: (input: CreateEdgeInput, signal?: AbortSignal) => {
    if (String(input.sourceNodeId) === String(input.targetNodeId)) {
      throw new ApiError("VALIDATION_ERROR", "Segmen tidak boleh menghubungkan node ke dirinya sendiri.", 400);
    }
    const hasStairs = input.hasStairs ?? (input.stepCount !== undefined && input.stepCount > 0);
    const stepCount = input.stepCount ?? 0;
    if (hasStairs && stepCount <= 0) {
      throw new ApiError("VALIDATION_ERROR", "Jumlah anak tangga harus lebih besar dari 0 jika terdapat tangga.", 400);
    }
    const bodyPayload = {
      sourceNodeId: String(input.sourceNodeId),
      targetNodeId: String(input.targetNodeId),
      ...(input.geometry ? { geometry: input.geometry } : {}),
      surfaceType: input.surfaceType ?? null,
      widthCm: input.widthCm ?? null,
      hasStairs,
      stepCount,
      slopePercent: input.slopePercent ?? null,
      hasGuidingBlock: input.hasGuidingBlock ?? false,
      guidingBlockCondition: input.guidingBlockCondition ?? null,
      hasHandrail: input.hasHandrail ?? false,
      isCovered: input.isCovered ?? false,
      isIndoor: input.isIndoor ?? false,
      isOneWay: input.isOneWay ?? false,
      isOperational: input.isOperational ?? true,
      ...(input.operationalNote ? { operationalNote: input.operationalNote } : {}),
      ...(input.attributes ? { attributes: input.attributes } : {}),
    };
    return api<GraphEdgeDto>("/graph/edges", {
      ...jsonBody(bodyPayload),
      signal,
    });
  },

  updateEdge: (id: string | number, input: UpdateEdgeInput, signal?: AbortSignal) =>
    api<GraphEdgeDto | { id: string; proposalDraftId: string | null; status: string }>(
      `/graph/edges/${encodeURIComponent(String(id))}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        signal,
      },
    ),

  deleteEdge: (id: string | number, signal?: AbortSignal) =>
    api<void>(`/graph/edges/${encodeURIComponent(String(id))}`, {
      method: "DELETE",
      signal,
    }),

  getCoverage: (signal?: AbortSignal) =>
    api<GraphCoverageBuilding[]>("/graph/coverage", { signal, cache: "no-store" }),

  validateTopology: (buildingId?: string, signal?: AbortSignal) =>
    api<ValidateTopologyResult>("/graph/validate", {
      ...jsonBody(buildingId ? { buildingId } : {}),
      signal,
    }),
};
