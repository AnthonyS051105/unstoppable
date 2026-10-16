// Buildings, graph nodes and route planning (API_CONTRACT §5, §7, §10).
import { api } from "@/lib/api-client";
import type { Building, CompareResponse, GeoPoint, GraphNodeDto, ProfileId, RouteResult } from "@/types/api";

export const routesApi = {
  buildings: () => api<Building[]>("/buildings"),
  nodes: (bbox: [number, number, number, number]) => api<GraphNodeDto[]>(`/graph/nodes?bbox=${bbox.join(",")}`),
  plan: (origin: GeoPoint, destination: GeoPoint, profileId?: ProfileId) =>
    api<RouteResult>("/routes/plan", { method: "POST", body: JSON.stringify({ origin, destination, profileId }) }),
  compare: (origin: GeoPoint, destination: GeoPoint, profileIds: ProfileId[]) =>
    api<CompareResponse>("/routes/compare", { method: "POST", body: JSON.stringify({ origin, destination, profileIds }) }),
};
