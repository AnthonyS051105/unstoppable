// API/GeoJSON use [lng, lat]; Leaflet uses [lat, lng]. Convert only in this file.
export type Coord = [number, number];
export type LatLng = [number, number];

export const toLeaflet = ([lng, lat]: Coord): LatLng => [lat, lng];
export const toGeoJSON = ([lat, lng]: LatLng): Coord => [lng, lat];
export const lineToLeaflet = (coords: Coord[]): LatLng[] => coords.map(toLeaflet);

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
