// Address search goes through the backend proxy (API_CONTRACT §17), which forwards to Photon (OSM):
// the browser never sends typed addresses or home coordinates to a third party directly.
import { api, ApiError } from "@/lib/api-client";
import type { GeocodeResult } from "@/types/api";
import { DEMO_DESTINATION, type Coord } from "./geo";

export type LocationValue = {
  name: string;

  address: string;
  coord: Coord;

  note?: string;
  source: "search" | "gps" | "map" | "saved" | "place";
};

/** 503 GEOCODER_UNAVAILABLE: the message is the backend's, safe to show as is. */
export class GeocoderUnavailable extends Error {
  name = "GeocoderUnavailable";
}

const toLocation = (r: GeocodeResult, source: LocationValue["source"]): LocationValue => ({
  name: r.name,
  address: r.address,
  coord: r.location.coordinates,
  source,
});

async function geocode<T>(path: string, signal?: AbortSignal): Promise<T> {
  try {
    return await api<T>(path, { signal });
  } catch (e) {
    if (e instanceof ApiError && e.code === "GEOCODER_UNAVAILABLE") throw new GeocoderUnavailable(e.message);
    throw e;
  }
}

// Bias toward the user's position when the caller knows it; otherwise the demo map's anchor
// (no pilot-area centre constant is agreed yet, see FE-GUIDE-F1-F4 §5.1).
export async function searchLocations(q: string, signal?: AbortSignal, near: Coord = DEMO_DESTINATION): Promise<LocationValue[]> {
  const params = new URLSearchParams({ q, lng: String(near[0]), lat: String(near[1]), limit: "6" });
  const results = await geocode<GeocodeResult[]>(`/geocode/search?${params}`, signal);
  return results.map((r) => toLocation(r, "search"));
}

export async function reverseLocation(coord: Coord, signal?: AbortSignal): Promise<LocationValue> {
  const params = new URLSearchParams({ lng: String(coord[0]), lat: String(coord[1]) });
  const r = await geocode<GeocodeResult>(`/geocode/reverse?${params}`, signal);
  // Keep the requested point: the backend returns the matched OSM feature's point, and the pin must not jump.
  return { ...toLocation(r, "map"), coord };
}

export const coordText = ([lng, lat]: Coord) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
