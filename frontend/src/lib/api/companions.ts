// Companion + volunteer endpoints (API_CONTRACT §11, §12, docs/FE-GUIDE-F5-F9.md §5).
import { api } from "@/lib/api-client";
import type {
  AvailableVolunteer,
  CompanionInvite,
  CompanionOffer,
  CompanionRequest,
  CreateCompanionRequest,
  LngLat,
} from "@/types/api";

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const id = encodeURIComponent;

export const companionsApi = {
  available: (at: LngLat, scheduledStart?: string, estimatedDurationMin?: number) => {
    const q = new URLSearchParams({ lng: String(at[0]), lat: String(at[1]) });
    if (scheduledStart) q.set("scheduledStart", scheduledStart);
    if (estimatedDurationMin) q.set("estimatedDurationMin", String(estimatedDurationMin));
    return api<AvailableVolunteer[]>(`/volunteers/available?${q}`);
  },
  mine: () => api<CompanionRequest[]>("/companions/requests"),
  create: (b: CreateCompanionRequest) => api<{ id: string; status: string }>("/companions/requests", post(b)),
  cancel: (requestId: string, reason: string) => api<unknown>(`/companions/requests/${id(requestId)}/cancel`, post({ reason })),
  broadcast: (requestId: string) => api<unknown>(`/companions/requests/${id(requestId)}/broadcast`, post()),
  offers: (requestId: string) => api<CompanionOffer[]>(`/companions/requests/${id(requestId)}/offers`),
  select: (requestId: string, offerId: string) => api<unknown>(`/companions/requests/${id(requestId)}/select`, post({ offerId })),
  checkin: (requestId: string, checkinType: "meet" | "complete") =>
    api<{ status: string }>(`/companions/requests/${id(requestId)}/checkin`, post({ checkinType })),
  rate: (volunteerId: string, requestId: string, rating: number) =>
    api<unknown>(`/volunteers/${id(volunteerId)}/rate`, post({ requestId, rating })),
  // Volunteer side
  invites: () => api<CompanionInvite[]>("/companions/invites"),
  respond: (requestId: string, accept: boolean, reason?: string) =>
    api<unknown>(`/companions/requests/${id(requestId)}/respond`, post(accept ? { accept } : { accept, ...(reason ? { reason } : {}) })),
};

const POLL_MS = 30_000;
export const COMPANION_POLL_MS = { normal: POLL_MS, fallback: 10_000 };

/** "Senin, 20 Okt · 09.00 WIB" */
export { formatDepart as formatSchedule } from "@/lib/api/trips";

/** "08.30 WIB" — the invite deadline is shown as a clock time, never a per-second countdown (§5.1). */
export const formatClock = (iso: string) =>
  `${new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB`;
