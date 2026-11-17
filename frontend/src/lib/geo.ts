// API/GeoJSON use [lng, lat]; Leaflet uses [lat, lng]. Convert only in this file.
export type Coord = [number, number];
export type LatLng = [number, number];

export const toLeaflet = ([lng, lat]: Coord): LatLng => [lat, lng];
export const toGeoJSON = ([lat, lng]: LatLng): Coord => [lng, lat];
export const lineToLeaflet = (coords: Coord[]): LatLng[] => coords.map(toLeaflet);

/** Preserve separate GeoJSON parts and break at invalid vertices. Never join a
 * missing survey segment or render a same-node route as a misleading line dot. */
export function routeLinesToLeaflet(geometry: unknown): LatLng[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const { type, coordinates } = geometry as { type?: string; coordinates?: unknown };
  if (!Array.isArray(coordinates)) return [];
  const parts: unknown[] = type === "LineString" ? [coordinates] : type === "MultiLineString" ? coordinates : [];
  const lines: LatLng[][] = [];
  for (const part of parts) {
    if (!Array.isArray(part)) continue;
    let line: LatLng[] = [];
    const flush = () => {
      if (line.length >= 2 && line.some(p => p[0] !== line[0][0] || p[1] !== line[0][1])) lines.push(line);
      line = [];
    };
    for (const point of part) {
      if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) { flush(); continue; }
      line.push(toLeaflet([point[0], point[1]]));
    }
    flush();
  }
  return lines;
}

/** Great-circle distance in metres between two [lng, lat] points (haversine). */
export function distanceM([lng1, lat1]: Coord, [lng2, lat2]: Coord) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

// Demo geometry (v6 schematic, 0.75 m per unit) anchored on Puskesmas Mergangsan from OSM.
export const DEMO_DESTINATION: Coord = [110.3753222, -7.8101201];
const ANCHOR = { x: 575, y: 202 };
const M_PER_UNIT = 0.75;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((DEMO_DESTINATION[1] * Math.PI) / 180);

export function demoToCoord(x: number, y: number): Coord {
  return [
    DEMO_DESTINATION[0] + ((x - ANCHOR.x) * M_PER_UNIT) / M_PER_DEG_LNG,
    DEMO_DESTINATION[1] - ((y - ANCHOR.y) * M_PER_UNIT) / M_PER_DEG_LAT,
  ];
}

export function coordToDemo([lng, lat]: Coord): { x: number; y: number } {
  return {
    x: ANCHOR.x + ((lng - DEMO_DESTINATION[0]) * M_PER_DEG_LNG) / M_PER_UNIT,
    y: ANCHOR.y - ((lat - DEMO_DESTINATION[1]) * M_PER_DEG_LAT) / M_PER_UNIT,
  };
}

export const pctToCoord = (px: number, py: number) => demoToCoord(px * 8, py * 7);
export const coordToPct = (c: Coord) => {
  const { x, y } = coordToDemo(c);
  return { x: x / 8, y: y / 7 };
};

export const svgPathToLine = (d: string): Coord[] =>
  [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => demoToCoord(Number(m[1]), Number(m[2])));

export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">Kontributor OpenStreetMap</a>, rute dan titik: data demonstrasi';
