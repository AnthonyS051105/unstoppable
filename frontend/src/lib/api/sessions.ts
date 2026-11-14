import { api, apiPaged, beacon, jsonBody } from "@/lib/api-client";
import type {
  ArrivalResult,
  FeedbackRating,
  FeedbackResult,
  HeartbeatResponse,
  LocationPingResponse,
  SessionSummary,
  SessionHistory,
  StartSessionInput,
  StartedSession,
  WellbeingStatus,
} from "@/types/api";

export const sessionsApi = {
  history: (page = 1) => apiPaged<SessionHistory[]>(`/sessions/history?page=${page}&limit=20`, { cache: "no-store" }),
  /** POST /sessions/start: starts a new travel session */
  start: (payload: StartSessionInput) =>
    api<StartedSession>("/sessions/start", jsonBody(payload)),

  /** POST /sessions/:id/location: REST fallback for location coordinates [lng, lat] */
  location: (id: string, coordinates: [number, number], accuracyM?: number) =>
    api<LocationPingResponse>(
      `/sessions/${id}/location`,
      jsonBody({
        location: { type: "Point", coordinates },
        ...(accuracyM !== undefined ? { accuracyM } : {}),
      }),
    ),

  /** POST /sessions/:id/heartbeat: heartbeat for active session */
  heartbeat: (id: string) =>
    api<HeartbeatResponse>(`/sessions/${id}/heartbeat`, { method: "POST" }),

  /** Owner (or a linked caregiver) only; `status` tells whether the session is still active. */
  summary: (id: string) => api<SessionSummary>(`/sessions/${id}/summary`),

  /** Ends as completed / endedReason "user" (§13 lifecycle table). */
  end: (id: string, status: "completed" | "cancelled" = "completed", destinationName?: string) =>
    api<{ sessionId: string; status: string }>(
      `/sessions/${id}/end`,
      jsonBody({ status, ...(destinationName ? { destinationName } : {}) }),
    ),

  /** Answer to session:arrival-check: true ends the session, false snoozes the question 5 minutes. */
  arrival: (id: string, arrived: boolean) => api<ArrivalResult>(`/sessions/${id}/arrival`, jsonBody({ arrived })),

  /** Answer to the wellbeing push, run by the app after a notification action (never by the service worker). */
  wellbeing: (id: string, status: WellbeingStatus) => api<unknown>(`/sessions/${id}/wellbeing`, jsonBody({ status })),

  /** Only the owner of a `completed` session, only once (409 CONFLICT afterwards). */
  feedback: (id: string, rating: FeedbackRating) => api<FeedbackResult>(`/sessions/${id}/feedback`, jsonBody({ rating })),

  // pause fires while the page is being hidden, so it must survive that (keepalive beacon).
  pause: (id: string) => beacon(`/sessions/${id}/pause`),

  // resume fires once the page is visible again; a normal call can refresh a token that expired meanwhile.
  resume: (id: string) => api<unknown>(`/sessions/${id}/resume`, { method: "POST" }),
};
