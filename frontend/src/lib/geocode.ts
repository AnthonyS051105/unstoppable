// Photon (OSM) supports search-as-you-type; public Nominatim forbids it. Move behind GET /geocode/* later.
import { DEMO_DESTINATION, type Coord } from "./geo";

const BASE = process.env.NEXT_PUBLIC_GEOCODER_URL || "https://photon.komoot.io";

export type LocationValue = {
  name: string;

  address: string;
  coord: Coord;

  note?: string;
  source: "search" | "gps" | "map" | "saved" | "place";
};

type PhotonProps = {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
  osm_value?: string;
};
type PhotonFeature = { properties: PhotonProps; geometry: { coordinates: Coord } };

const join = (parts: (string | undefined)[]) => [...new Set(parts.filter(Boolean))].join(", ");

function toLocation(f: PhotonFeature, source: LocationValue["source"]): LocationValue {
  const p = f.properties;
  const street = p.street ? join([p.street + (p.housenumber ? " " + p.housenumber : "")]) : undefined;
  const name = p.name || street || p.district || p.city || "Lokasi pada peta";
  const address = join([p.name ? street : undefined, p.district || p.locality, p.city || p.county]);
  return { name, address: address || "Yogyakarta", coord: f.geometry.coordinates, source };
}

export async function searchLocations(q: string, signal?: AbortSignal): Promise<LocationValue[]> {
  const [lng, lat] = DEMO_DESTINATION;
  const res = await fetch(`${BASE}/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=6&location_bias_scale=0.4`, { signal });
  if (!res.ok) throw new Error("geocoder " + res.status);
  const data = (await res.json()) as { features: PhotonFeature[] };
  return data.features.map((f) => toLocation(f, "search"));
}

export async function reverseLocation(coord: Coord, signal?: AbortSignal): Promise<LocationValue> {
  const res = await fetch(`${BASE}/reverse?lat=${coord[1]}&lon=${coord[0]}&limit=1`, { signal });
  if (!res.ok) throw new Error("geocoder " + res.status);
  const data = (await res.json()) as { features: PhotonFeature[] };
  const f = data.features[0];
  const loc = f ? toLocation(f, "map") : { name: "Lokasi pada peta", address: coordText(coord), coord, source: "map" as const };
  return { ...loc, coord };
}

export const coordText = ([lng, lat]: Coord) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
