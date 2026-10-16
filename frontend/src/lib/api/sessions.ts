// Travel session endpoints (API_CONTRACT §13). Start and location arrive with wave I3.
import { api, beacon, jsonBody } from "@/lib/api-client";
import type { ArrivalResult, FeedbackRating, FeedbackResult, SessionSummary, WellbeingStatus } from "@/types/api";

export const sessionsApi = {
  /** Owner (or a linked caregiver) only; `status` tells whether the session is still active. */
  summary: (id: string) => api<SessionSummary>(`/sessions/${id}/summary`),
  /** Ends as completed / endedReason "user" (§13 lifecycle table). */
  end: (id: string) => api<unknown>(`/sessions/${id}/end`, jsonBody({ status: "completed" })),
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
