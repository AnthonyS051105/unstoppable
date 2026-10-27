// Server-backed I2 catalogue and the current plan. Demo utilities remain separate.
import { useSyncExternalStore } from "react";
import { ApiError, errorMessage } from "@/lib/api-client";
import { routesApi } from "@/lib/api/routes";
import { DESTINATIONS, NEARBY, STEPS } from "@/lib/data";
import { FACILITY_PLACES, PLACES, type Place } from "@/lib/places";
import type { Building, CompareResponse, GeoPoint, GraphNodeDto, ProfileId, RouteResult, UnreachableDetails } from "@/types/api";

export type RouteOrigin = { id?: string; label: string; point: GeoPoint };
type Plan = { placeId: string; profileId: ProfileId; origin: RouteOrigin; route: RouteResult };
type Blocked = { placeId: string; profileId: ProfileId; message: string; details?: UnreachableDetails };
export const live = {
  buildings: false,
  planning: false,
  planError: "",
  facilities: [] as GraphNodeDto[],
  facilityState: { status: "loading" as "loading" | "ready" | "error", error: "" },
  catalogue: { status: "idle" as "idle" | "loading" | "empty" | "error" | "ready", error: "" },
  origin: null as RouteOrigin | null,
  plan: null as Plan | null,
  blocked: null as Blocked | null,
  compare: null as { key: string; data: CompareResponse } | null,
};
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };
export const useLive = () => useSyncExternalStore(
  (l) => (listeners.add(l), () => void listeners.delete(l)), () => version, () => 0,
);
export const surveyDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", {
  timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric",
});
const ASPECT_LABEL: Record<string, string> = { entrance: "Pintu masuk", verticalAccess: "Akses antarlantai", paths: "Jalur", facilities: "Fasilitas" };
export function toPlace(b: Building): Place {
  return {
    id: b.id, name: b.name, kind: b.faculty || "Gedung", icon: "building-2",
    meta: b.surveyedAt ? `${b.floorCount} lantai${b.hasLift ? ", ada lift" : ""}` : "Belum disurvei",
    surveyedAt: b.surveyedAt ? surveyDate(b.surveyedAt) : null,
    aspects: b.scoreBreakdown ? Object.entries(b.scoreBreakdown).map(([k, v]) => [ASPECT_LABEL[k] || k, v.note]) : undefined,
    warnings: b.surveyedAt && b.floorCount > 1 && !b.hasLift ? ["Gedung ini tidak memiliki lift ke lantai atas."] : undefined,
    coord: b.location.coordinates,
  };
}
let catalogueRequest: Promise<void> | null = null;
export function loadBuildings(): Promise<void> {
  if (catalogueRequest) return catalogueRequest;
  live.catalogue = { status: "loading", error: "" };
  live.buildings = false;
  PLACES.splice(0); DESTINATIONS.splice(0); NEARBY.splice(0);
  emit();
  catalogueRequest = routesApi.buildings().then((list) => {
    PLACES.push(...list.map(toPlace));
    DESTINATIONS.push(...PLACES.map((p) => p.name));
    NEARBY.push(...PLACES.map((p): [string, string, string] => [p.name, p.meta, p.icon]));
    live.buildings = true;
    live.catalogue = { status: list.length ? "ready" : "empty", error: "" };
  }).catch((e) => {
    live.catalogue = { status: "error", error: errorMessage(e) };
  }).finally(() => { catalogueRequest = null; emit(); });
  return catalogueRequest;
}
let seq = 0;
let compareSeq = 0;
export const cancelPlan = () => { seq++; live.planning = false; emit(); };
export function setRouteOrigin(origin: RouteOrigin | null) {
  cancelPlan(); compareSeq++;
  live.origin = origin; live.plan = null; live.blocked = null; live.compare = null;
  emit();
}
function requireOrigin() {
  if (!live.origin) throw new ApiError("NO_ORIGIN", "Pilih titik asal atau gunakan lokasi GPS Anda terlebih dahulu.", 0);
  return live.origin;
}
const stepIcon = (t: string, first: boolean, last: boolean) =>
  last ? "flag" : first ? "map-pin" : /belok/i.test(t) ? "corner-up-right" : /seberang/i.test(t) ? "person-standing" : "arrow-up";

export async function planRoute(place: Place, profileId: ProfileId): Promise<"ok" | "unreachable" | "stale"> {
  const me = ++seq;
  live.plan = null; live.blocked = null; live.planning = true; live.planError = ""; emit();
  try {
    const origin = requireOrigin();
    if (!place.coord) throw new ApiError("NO_DESTINATION", "Tujuan belum memiliki koordinat dari server.", 0);
    const route = await routesApi.plan(origin.point, { type: "Point", coordinates: place.coord }, profileId);
    if (me !== seq) return "stale";
    live.plan = { placeId: place.id, profileId, origin, route };
    STEPS.splice(0, STEPS.length, ...route.steps.map((s, i): [string, string, string] =>
      [s.instruction, `${Math.round(s.distanceM)} m`, stepIcon(s.instruction, i === 0, i === route.steps.length - 1)]));
    emit(); return "ok";
  } catch (e) {
    if (me !== seq) return "stale";
    if (e instanceof ApiError && e.status === 422 && e.code === "ROUTE_UNREACHABLE") {
      live.blocked = { placeId: place.id, profileId, message: e.message, details: e.details as UnreachableDetails };
      emit(); return "unreachable";
    }
    live.planError = errorMessage(e);
    throw e;
  } finally {
    if (me === seq) { live.planning = false; emit(); }
  }
}
export const compareKey = (placeId: string, ids: ProfileId[]) => `${placeId}|${ids.join()}|${live.origin?.point.coordinates.join() ?? ""}`;
export async function planCompare(place: Place, ids: ProfileId[]) {
  const me = ++compareSeq;
  live.compare = null; emit();
  const origin = requireOrigin();
  const key = compareKey(place.id, ids);
  const data = await routesApi.compare(origin.point, { type: "Point", coordinates: place.coord! }, ids);
  if (me !== compareSeq) return;
  live.compare = { key, data }; emit();
}
export const planFor = (placeId?: string, profileId?: ProfileId) =>
  live.plan && live.plan.placeId === placeId && (!profileId || live.plan.profileId === profileId) ? live.plan : null;

export function publishFacilities(nodes: GraphNodeDto[], status: "loading" | "ready" | "error" = "ready", error = "") {
  live.facilityState = { status, error };
  live.facilities = nodes.filter((n) => n.status === "approved");
  FACILITY_PLACES.splice(0, FACILITY_PLACES.length, ...live.facilities.map(nodeToPlace));
  emit();
}
export function nodeToPlace(n: GraphNodeDto): Place {
  return { id: `node:${n.id}`, name: n.name || `Fasilitas ${n.id}`, kind: "Fasilitas terdata", icon: "map-pin", meta: n.isOperational === false ? "Tidak beroperasi" : "Status disetujui", surveyedAt: n.surveyedAt ? surveyDate(n.surveyedAt) : null, coord: n.location.coordinates, floor: n.floorLevel, warnings: n.operationalNote ? [n.operationalNote] : undefined };
}
