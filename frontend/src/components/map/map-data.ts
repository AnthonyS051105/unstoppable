import type { ProfileId } from "@/lib/data";

export type MapProps = {
  label?: string;
  summary?: string;
  filters?: boolean;
  compare?: boolean;
  planned?: boolean;
  hideA?: boolean;
  hideB?: boolean;
  editor?: boolean;

  radius?: number;
  center?: [number, number];
  onNode?: (id: number) => void;
  onEdge?: (id: number) => void;
  onAddNode?: (x: number, y: number) => void;
};

export const ORIGIN = { x: 165, y: 205 };
export const DESTINATION = { x: 575, y: 202 };
export const ROUTE = "M165 205 L171 285 L260 323 L244 355 L390 426 L515 493 L563 416 L588 356 L575 202";
export const SHAPES: Record<ProfileId, string> = {
  wheelchair: "M165 205 L195 295 L300 345 L380 450 L525 485 L592 367 L575 202",
  blind: "M165 205 L220 250 L350 285 L430 270 L575 202",
  low_vision: "M165 205 L220 250 L300 345 L430 370 L575 202",
  crutches: "M165 205 L171 285 L260 323 L390 426 L530 370 L575 202",
};

export const PINS: [string, string, number, number][] = [
  ["dark", "accessibility", 15, 41],
  ["dark", "person-standing", 43, 23],
  ["green", "person-standing", 72, 39],
  ["dark", "bus", 63, 72],
  ["red", "camera", 74, 57],
  ["yellow", "hospital", 39, 43],
  ["dark", "accessibility", 58, 80],
];
export const FILTERS = ["Semua", "Fasilitas kesehatan", "Trotoar", "Penyeberangan", "Transportasi", "Toilet"];
export const FILTER_ICONS = ["", "hospital", "person-standing", "footprints", "bus", "accessibility"];

export const pinVisible = (filter: string, [color, ico]: [string, string, number, number]) =>
  filter === "Semua" ||
  (filter === "Fasilitas kesehatan"
    ? ico === "hospital"
    : filter === "Transportasi"
      ? ico === "bus"
      : filter === "Trotoar"
        ? color === "green"
        : filter === "Toilet"
          ? ico === "accessibility"
          : ico === "person-standing");

export const pinLabel = (ico: string) =>
  ico === "bus"
    ? "Halte bus aksesibel"
    : ico === "accessibility"
      ? "Fasilitas aksesibel"
      : ico === "hospital"
        ? "Puskesmas & klinik"
        : "Tempat di sekitar rute";
