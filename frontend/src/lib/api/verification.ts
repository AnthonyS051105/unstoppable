// Verification API client (API_CONTRACT §8, API_DOCS §9).
import { api, apiPaged, ApiError, jsonBody } from "@/lib/api-client";
import type { VolunteerProfile } from "@/types/volunteers";

export type VerificationItemType = "node" | "edge" | "report_effect" | "report";

export interface VerificationQueueItem {
  id: string;
  itemType: "node" | "edge" | "report_effect";
  itemId: string;
  changeType: "create" | "update";
  submittedBy: { id: string; name: string } | null;
  submittedAt: string | Date;
  preview: Record<string, unknown>;
  currentValue: Record<string, unknown> | null;
}

export interface VerificationQueueQuery {
  type?: VerificationItemType;
  page?: number;
  limit?: number;
}

export interface ApproveOptions {
  note?: string;
  effect?: "block" | "degrade" | "info";
  type?: VerificationItemType;
}

export interface RejectOptions {
  type?: VerificationItemType;
}

export interface VerificationResult {
  id: string;
  itemType: string;
  status: string;
  [key: string]: unknown;
}

export interface ReviewVolunteerInput {
  verificationStatus: "verified" | "rejected";
  canCompanion?: boolean;
  canMapData?: boolean;
}

function buildQueueQuery(query?: VerificationQueueQuery): string {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (query?.page) params.set("page", String(query.page));
  if (query?.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Only administrators have verification review permissions per API_DOCS §9. */
export function canVerify(role: string | undefined): boolean {
  return role === "admin";
}

export const verificationApi = {
  queue: (query?: VerificationQueueQuery, signal?: AbortSignal) =>
    apiPaged<VerificationQueueItem[]>(`/verification/queue${buildQueueQuery(query)}`, { signal, cache: "no-store" }),

  approve: (id: string, options?: ApproveOptions, signal?: AbortSignal) =>
    api<VerificationResult>(`/verification/${encodeURIComponent(id)}/approve`, {
      ...jsonBody(options ?? {}),
      signal,
    }),

  reject: (id: string, reason: string, options?: RejectOptions, signal?: AbortSignal) => {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new ApiError("VALIDATION_ERROR", "Alasan penolakan wajib diisi.", 400);
    }
    return api<VerificationResult>(`/verification/${encodeURIComponent(id)}/reject`, {
      ...jsonBody({ reason: trimmed, ...(options?.type ? { type: options.type } : {}) }),
      signal,
    });
  },

  reviewVolunteer: (volunteerId: string, data: ReviewVolunteerInput, signal?: AbortSignal) =>
    api<VolunteerProfile>(`/volunteers/${encodeURIComponent(volunteerId)}/verification`, {
      method: "PATCH",
      body: JSON.stringify(data),
      signal,
    }),
};
