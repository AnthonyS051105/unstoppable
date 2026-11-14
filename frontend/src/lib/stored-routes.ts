import { ApiError } from "@/lib/api-client";
import { setRouteOrigin } from "@/lib/live";
import { retainFacility, type Place } from "@/lib/places";
import type { GeoPoint } from "@/types/api";

export const canUseLocalRoutes = (authenticated: boolean, error: ApiError | null) =>
  !authenticated || error?.code === "NETWORK";

/** Custom saved-route names need not exist in the building catalogue. */
export function prepareStoredRoute(route: { id: string; name: string; origin: GeoPoint; destination: GeoPoint }): Place {
  const place: Place = {
    id: `node:stored:${route.id}`, name: route.name, coord: route.destination.coordinates,
    kind: "Tujuan tersimpan", icon: "map-pin", meta: "", surveyedAt: null,
  };
  setRouteOrigin({ label: "Titik asal rute tersimpan", point: route.origin });
  retainFacility(place);
  return place;
}
