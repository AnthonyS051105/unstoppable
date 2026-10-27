// Buildings, graph nodes and route planning (API_CONTRACT §5, §7, §10).
import { api } from "@/lib/api-client";
import type { Building, BuildingBarrier, CompareResponse, GeoPoint, GraphNodeDto, ProfileId, RouteResult } from "@/types/api";

export const routesApi = {
  buildings: () => api<Building[]>("/buildings"),
  building: (id: string) => api<Building>(`/buildings/${encodeURIComponent(id)}`),
  barriers: (id: string) => api<BuildingBarrier[]>(`/buildings/${encodeURIComponent(id)}/barriers`),
  nodes: (bbox: [number, number, number, number], signal?: AbortSignal) => api<GraphNodeDto[]>(`/graph/nodes?bbox=${bbox.join(",")}&status=approved`, { signal }),
  plan: (origin: GeoPoint, destination: GeoPoint, profileId?: ProfileId) =>
    api<RouteResult>("/routes/plan", { method: "POST", body: JSON.stringify({ origin, destination, profileId, includeNarration: true }) }),
  compare: (origin: GeoPoint, destination: GeoPoint, profileIds: ProfileId[]) =>
    api<CompareResponse>("/routes/compare", { method: "POST", body: JSON.stringify({ origin, destination, profileIds }) }),
};
