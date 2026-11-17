import type { LngLat } from "@/types/api";

export type PositionSnapshot = { coord: LngLat | null; status: "pending" | "ready" | "denied"; error: string };
export const initialPosition: PositionSnapshot = { coord: null, status: "pending", error: "" };

/** One device watcher shared by maps, search, and forms; never shares location with family. */
export function createPositionStore() {
  let snapshot = initialPosition;
  const listeners = new Set<() => void>();
  let watch: number | undefined;
  let generation = 0;
  const publish = (next: PositionSnapshot) => { snapshot = next; listeners.forEach((fn) => fn()); };
  const stop = () => {
    generation++;
    if (watch !== undefined) navigator.geolocation?.clearWatch(watch);
    watch = undefined;
  };
  const start = () => {
    stop();
    const current = generation;
    if (!navigator.geolocation) {
      publish({ coord: null, status: "denied", error: "Lokasi tidak tersedia di perangkat ini." });
      return;
    }
    watch = navigator.geolocation.watchPosition(
      (p) => {
        if (current !== generation) return;
        publish({ coord: [p.coords.longitude, p.coords.latitude], status: "ready", error: "" });
      },
      (e) => {
        if (current !== generation) return;
        publish({ coord: snapshot.coord, status: "denied", error: e.code === 1
          ? "Izinkan lokasi di browser untuk melihat posisi Anda."
          : "Lokasi belum tersedia. Coba GPS lagi atau cari alamat." });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  };
  const resume = () => { if (document.visibilityState === "visible") start(); };
  return {
    getSnapshot: () => snapshot,
    retry: () => { publish({ ...snapshot, status: "pending", error: "" }); if (listeners.size) start(); },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) { start(); document.addEventListener("visibilitychange", resume); }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop();
          document.removeEventListener("visibilitychange", resume);
          snapshot = initialPosition;
        }
      };
    },
  };
}
