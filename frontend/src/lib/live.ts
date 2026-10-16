// Server-backed map data (INTEGRATION-GUIDE wave I2): buildings of the pilot area and the last planned route.
// PLACES / DESTINATIONS / NEARBY are filled in place from GET /buildings so every screen keeps its markup.
// When the backend cannot be reached they keep the labelled demo content.
import { useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api-client";
import { routesApi } from "@/lib/api/routes";
import { DESTINATIONS, NEARBY, STEPS } from "@/lib/data";
import { PLACES, type Place } from "@/lib/places";
import type { Building, CompareResponse, GeoPoint, ProfileId, RouteResult, UnreachableDetails } from "@/types/api";
import type { Coord } from "./geo";

type Plan = { placeId: string; profileId: ProfileId; route: RouteResult };
type Blocked = { placeId: string; profileId: ProfileId; message: string; details?: UnreachableDetails };
export const live = {
  buildings: false,
  plan: null as Plan | null,
  blocked: null as Blocked | null,
  compare: null as { key: string; data: CompareResponse } | null,
};

let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
export const useLive = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => version,
    () => 0,
  );

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" });

function toPlace(b: Building): Place {
  const aspects = b.scoreBreakdown ? Object.entries(b.scoreBreakdown).map(([k, v]) => [k, v.note] as [string, string]) : undefined;
  return {
    id: b.id,
    name: b.name,
    kind: b.faculty,
    icon: "building-2",
    meta: `${b.floorCount} lantai${b.hasLift ? ", ada lift" : ""}`,
    surveyedAt: b.surveyedAt ? date(b.surveyedAt) : null,
    aspects,
    warnings: b.floorCount > 1 && !b.hasLift ? ["Gedung ini tidak memiliki lift ke lantai atas."] : undefined,
    coord: b.location.coordinates,
  };
}

export async function loadBuildings() {
  try {
    const list = await routesApi.buildings();
    if (!list.length) return;
    PLACES.splice(0, PLACES.length, ...list.map(toPlace));
    DESTINATIONS.splice(0, DESTINATIONS.length, ...PLACES.map((p) => p.name));
    NEARBY.splice(0, NEARBY.length, ...PLACES.map((p): [string, string, string] => [p.name, p.meta, p.icon]));
    live.buildings = true;
    emit();
  } catch {
    // keep the labelled demo content
  }
}

const stepIcon = (t: string, first: boolean, last: boolean) =>
  last ? "flag" : first ? "map-pin" : /belok/i.test(t) ? "corner-up-right" : /seberang/i.test(t) ? "person-standing" : "arrow-up";

async function origin(dest: Coord): Promise<GeoPoint> {
  const pos = await new Promise<Coord | null>((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res([p.coords.longitude, p.coords.latitude]),
      () => res(null),
      { timeout: 3000, maximumAge: 60000 },
    );
  });
  // Only use the GPS fix inside the surveyed pilot area; otherwise start from the campus gate.
  if (pos && Math.abs(pos[0] - dest[0]) < 0.02 && Math.abs(pos[1] - dest[1]) < 0.02) return { type: "Point", coordinates: pos };
  const d = 0.01;
  const nodes = await routesApi.nodes([dest[0] - d, dest[1] - d, dest[0] + d, dest[1] + d]);
  const gate = nodes.find((n) => n.nodeType === "gate") || nodes[0];
  if (!gate) throw new ApiError("NO_ORIGIN", "Titik awal rute belum tersedia di area ini.", 0);
  return gate.location;
}

let seq = 0;
export const cancelPlan = () => void seq++;

/** Resolves "ok" | "unreachable"; throws ApiError for real failures; "stale" if cancelled meanwhile. */
export async function planRoute(place: Place, profileId: ProfileId): Promise<"ok" | "unreachable" | "stale"> {
  const me = ++seq;
  const dest: GeoPoint = { type: "Point", coordinates: place.coord! };
  try {
    const route = await routesApi.plan(await origin(place.coord!), dest, profileId);
    if (me !== seq) return "stale";
    live.plan = { placeId: place.id, profileId, route };
    live.blocked = null;
    STEPS.splice(
      0,
      STEPS.length,
      ...route.steps.map((s, i): [string, string, string] => [s.instruction, `${Math.round(s.distanceM)} m`, stepIcon(s.instruction, i === 0, i === route.steps.length - 1)]),
    );
    emit();
    return "ok";
  } catch (e) {
    if (me !== seq) return "stale";
    if (e instanceof ApiError && e.code === "ROUTE_UNREACHABLE") {
      live.plan = null;
      live.blocked = { placeId: place.id, profileId, message: e.message, details: e.details as UnreachableDetails };
      emit();
      return "unreachable";
    }
    throw e;
  }
}

export async function planCompare(place: Place, ids: ProfileId[]) {
  const key = `${place.id}|${ids.join()}`;
  const o = await origin(place.coord!);
  const data = await routesApi.compare(o, { type: "Point", coordinates: place.coord! }, ids);
  live.compare = { key, data };
  emit();
}

export const planFor = (placeId?: string) => (live.plan && live.plan.placeId === placeId ? live.plan : null);
