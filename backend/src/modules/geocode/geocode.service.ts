import { AppError } from "../../shared/errors.js";
import type { SearchQueryInput, ReverseQueryInput } from "./geocode.schema.js";

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

type Coord = [number, number];
type PhotonProperties = Partial<
  Record<
    "name" | "street" | "housenumber" | "district" | "locality" | "city" | "county",
    string
  >
>;

export interface PhotonFeature {
  properties?: PhotonProperties;
  geometry?: { coordinates?: Coord };
}

export interface GeocodeResult {
  name: string;
  address: string;
  location: { type: "Point"; coordinates: Coord };
}

const cache = new Map<string, { createdAt: number; value: GeocodeResult[] }>();

function geocoderBaseUrl(): string {
  return (process.env.GEOCODER_URL ?? "https://photon.komoot.io").replace(/\/$/, "");
}

function unavailable(): AppError {
  return new AppError(
    "GEOCODER_UNAVAILABLE",
    "Pencarian alamat sedang tidak tersedia. Pilih lokasi langsung di peta.",
    503,
  );
}

function joinParts(parts: Array<string | undefined>): string {
  return [...new Set(parts.filter((part): part is string => Boolean(part)))].join(", ");
}

export function toGeocodeResult(feature: PhotonFeature): GeocodeResult {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;

  if (!coordinates || coordinates.length !== 2) {
    throw unavailable();
  }

  const street = properties.street
    ? `${properties.street}${properties.housenumber ? ` ${properties.housenumber}` : ""}`
    : undefined;
  const name = properties.name || street || properties.district || properties.city || "Lokasi pada peta";
  const address =
    joinParts([
      properties.name ? street : undefined,
      properties.district || properties.locality,
      properties.city || properties.county,
    ]) || "Yogyakarta";

  return {
    name,
    address,
    location: { type: "Point", coordinates },
  };
}

function cacheGet(key: string): GeocodeResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key: string, value: GeocodeResult[]): void {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { createdAt: Date.now(), value });
}

export function clearGeocodeCache(): void {
  cache.clear();
}

async function photon(path: string, key: string): Promise<GeocodeResult[]> {
  const cached = cacheGet(key);
  if (cached) return cached;

  let response: Response;
  try {
    response = await fetch(`${geocoderBaseUrl()}${path}`, {
      headers: { "User-Agent": "Unstoppable/1.0 (JOINTS UGM 2026)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }

  if (!response.ok) throw unavailable();

  let payload: { features?: PhotonFeature[] };
  try {
    payload = (await response.json()) as { features?: PhotonFeature[] };
  } catch {
    throw unavailable();
  }

  try {
    const value = (payload.features ?? []).map(toGeocodeResult);
    cacheSet(key, value);
    return value;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  }
}

export async function search({ q, lng, lat, limit }: SearchQueryInput): Promise<GeocodeResult[]> {
  const bias =
    lng !== undefined && lat !== undefined
      ? `&lat=${lat}&lon=${lng}&location_bias_scale=0.4`
      : "";
  const key = `search|${q.toLowerCase()}|${lng?.toFixed(2) ?? ""}|${lat?.toFixed(2) ?? ""}|${limit}`;
  return photon(`/api/?q=${encodeURIComponent(q)}&limit=${limit}${bias}`, key);
}

export async function reverse({ lng, lat }: ReverseQueryInput): Promise<GeocodeResult> {
  const key = `reverse|${lng.toFixed(5)}|${lat.toFixed(5)}`;
  const [first] = await photon(`/reverse?lat=${lat}&lon=${lng}&limit=1`, key);
  return (
    first ?? {
      name: "Lokasi pada peta",
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      location: { type: "Point", coordinates: [lng, lat] },
    }
  );
}
