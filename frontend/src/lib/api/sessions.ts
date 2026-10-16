// Travel session endpoints (API_CONTRACT §13). Start/end/location arrive with wave I3.
import { api, jsonBody } from "@/lib/api-client";
import type { FeedbackRating, FeedbackResult } from "@/types/api";

export const sessionsApi = {
  /** Only the owner of a `completed` session, only once (409 CONFLICT afterwards). */
  feedback: (id: string, rating: FeedbackRating) => api<FeedbackResult>(`/sessions/${id}/feedback`, jsonBody({ rating })),
};
