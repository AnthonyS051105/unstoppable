// Planned trips (API_CONTRACT §19, docs/FE-GUIDE-F1-F4.md §4).
import { api } from "@/lib/api-client";
import type { CreatePlannedTrip, PlannedTrip } from "@/types/api";

export const tripsApi = {
  /** Own trips; for family also the trips of linked seniors. */
  list: () => api<PlannedTrip[]>("/trips/planned"),
  create: (b: CreatePlannedTrip) => api<PlannedTrip>("/trips/planned", { method: "POST", body: JSON.stringify(b) }),
  cancel: (id: string) => api<unknown>(`/trips/planned/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

const PENDING_KEY = "unstoppable-planned-trip-v1";

/**
 * Trip opened from /preview?trip=<id>. POST /sessions/start (wave I3) sends it as plannedTripId;
 * until then the backend still matches a planned trip by destination (§13).
 */
export function setPendingTrip(id: string | null) {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

export function pendingTrip() {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

/** departAt as ISO 8601 with the WIB offset (§1.3), from the values of <input type="date"> and <input type="time">. */
export const wibIso = (date: string, time: string) => `${date}T${time}:00+07:00`;

/** Default for the schedule dialog: 30 minutes from now, rounded up to 5 minutes, in WIB. */
export function defaultDepart(now = Date.now()) {
  const step = 5 * 60_000;
  const t = new Date(Math.ceil((now + 30 * 60_000) / step) * step + 7 * 3600_000);
  const iso = t.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** "Senin, 20 Okt · 09.00 WIB" */
export function formatDepart(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time} WIB`;
}
