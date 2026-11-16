// Only Puskesmas Mergangsan has surveyed attributes; never invent accessibility data for the rest.
import type { ProfileId } from "./data";
import { pctToCoord, type Coord } from "./geo";
import { live } from "./live";

export type Place = {
  id: string;
  name: string;
  kind: string;
  icon: string;
  meta: string;
  surveyedAt: string | null;
  aspects?: [string, string][];
  warnings?: string[];

  floor?: number;
  stepFree?: boolean;

  pos?: [number, number];
  /** Real [lng, lat] from GET /buildings; demo places derive it from pos. */
  coord?: Coord;
};

export const PLACES: Place[] = [];
export const FACILITY_PLACES: Place[] = [];
let selectedFacility: Place | null = null;
export const allPlaces = () => [...PLACES, ...FACILITY_PLACES, ...(selectedFacility && !FACILITY_PLACES.some((p) => p.id === selectedFacility?.id) ? [selectedFacility] : [])];
export const retainFacility = (place: Place) => { selectedFacility = place; };

// Kept for screens outside I2; never used as the live catalogue.
export const DEMO_PLACES: Place[] = [
  {
    id: "puskesmas-mergangsan",
    pos: [71.9, 28.9],
    name: "Puskesmas Mergangsan",
    kind: "Fasilitas kesehatan",
    icon: "building-2",
    meta: "800 m, 18 menit",
    surveyedAt: "5 September 2026",
    aspects: [
      ["Masuk gedung", "Ramp tersedia di pintu timur, 5%"],
      ["Lebar jalur", "140 cm"],
      ["Permukaan", "Beton rata di lantai dasar"],
      ["Petunjuk arah", "Ubin pemandu tersedia, satu bagian perlu diperiksa"],
      ["Penerangan", "Terang pada siang hari; malam belum disurvei"],
      ["Tempat beristirahat", "Bangku dekat pintu masuk"],
      ["Toilet aksesibel", "Di lantai dasar"],
    ],
    warnings: ["Akses ke lantai atas belum memiliki lift."],
  },
  {
    id: "apotek-lingkungan",
    pos: [52, 58],
    name: "Apotek Lingkungan",
    kind: "Apotek",
    icon: "building-2",
    meta: "450 m, 10 menit",
    surveyedAt: null,
  },
  {
    id: "posyandu-lansia",
    pos: [30, 66],
    name: "Posyandu Lansia",
    kind: "Layanan kesehatan",
    icon: "building-2",
    meta: "600 m, 14 menit",
    surveyedAt: null,
  },
  {
    id: "klinik-sehat-lantai-2",
    pos: [84, 62],
    name: "Klinik Sehat Lantai 2",
    kind: "Fasilitas kesehatan",
    icon: "map-pin",
    meta: "900 m, 20 menit",
    surveyedAt: null,
    floor: 2,
  },
  {
    id: "balai-warga-lantai-3",
    pos: [26, 30],
    name: "Balai Warga Lantai 3",
    kind: "Layanan umum",
    icon: "map-pin",
    meta: "1.100 m, 24 menit",
    surveyedAt: null,
    floor: 3,
    stepFree: false,
  },
  {
    id: "toilet-aksesibel",
    pos: [15, 41],
    name: "Toilet aksesibel",
    kind: "Fasilitas umum",
    icon: "accessibility",
    meta: "150 m",
    surveyedAt: null,
  },
  {
    id: "halte-bus-aksesibel",
    pos: [63, 72],
    name: "Halte Bus Aksesibel",
    kind: "Transportasi",
    icon: "bus",
    meta: "300 m",
    surveyedAt: null,
  },
  {
    id: "rest-area-aksesibel",
    pos: [43, 23],
    name: "Rest Area Aksesibel",
    kind: "Tempat beristirahat",
    icon: "users",
    meta: "450 m",
    surveyedAt: null,
  },
];

export const PIN_PLACE: Record<string, string> = {
  hospital: "puskesmas-mergangsan",
  bus: "halte-bus-aksesibel",
  accessibility: "toilet-aksesibel",
  "person-standing": "rest-area-aksesibel",
  camera: "puskesmas-mergangsan",
};

export const placeById = (id?: string | null) => allPlaces().find((p) => p.id === id);
export const placeByName = (name: string) => selectedFacility?.name === name ? selectedFacility : allPlaces().find((p) => p.name === name);
export const placeHref = (p: Place) => p.id.startsWith("node:") && p.coord
  ? `/place?node=${encodeURIComponent(p.id.slice(5))}&lng=${p.coord[0]}&lat=${p.coord[1]}` : `/place?id=${p.id}`;
export const placeCoord = (p: Place): Coord => p.coord ?? pctToCoord(p.pos![0], p.pos![1]);

export const externalPlaceHref = (l: { name: string; address: string; coord: [number, number] }) =>
  `/place?${new URLSearchParams({ name: l.name, address: l.address, lng: l.coord[0].toFixed(6), lat: l.coord[1].toFixed(6) })}`;

export function placeBlocked(p: Place, profiles: ProfileId[]) {
  if (p.coord) return live.blocked?.placeId === p.id && profiles[0] === live.blocked.profileId;
  return p.stepFree === false && profiles.includes("wheelchair");
}
