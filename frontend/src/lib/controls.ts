export type SheetPos = "peek" | "half" | "full";

export const sheetControl: {
  current: { set: (p: SheetPos) => void; scroller: () => HTMLElement | null; escape: (e: KeyboardEvent) => void } | null;
} = { current: null };

export const filterControl: { current: { isOpen: () => boolean; close: () => void } | null } = { current: null };

export const searchControl: { current: { openWith: (query: string) => void } | null } = { current: null };

export const mapControl: { current: { zoomIn: () => void; zoomOut: () => void; locate: () => void; zoomPct: () => number } | null } = {
  current: null,
};
