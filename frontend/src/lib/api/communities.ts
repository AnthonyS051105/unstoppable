// Community endpoints (API_CONTRACT §20, docs/FE-GUIDE-F5-F9.md §6).
import { api, apiPaged } from "@/lib/api-client";
import { CATEGORIES } from "@/lib/data";
import type { Community, CommunityEvent, CommunityPost, CreateCommunityEvent, LngLat, NearbyReport, PageMeta } from "@/types/api";

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const id = encodeURIComponent;

export const communitiesApi = {
  // The backend requires a point (GET /communities?lng=&lat=) and sorts by distance from it.
  list: (near: LngLat) => api<Community[]>(`/communities?lng=${near[0]}&lat=${near[1]}`),
  get: (communityId: string) => api<Community>(`/communities/${id(communityId)}`),
  join: (communityId: string) => api<unknown>(`/communities/${id(communityId)}/members/me`, send("POST")),
  leave: (communityId: string) => api<unknown>(`/communities/${id(communityId)}/members/me`, send("DELETE")),
  reports: (communityId: string) => api<NearbyReport[]>(`/communities/${id(communityId)}/reports`),
  posts: (communityId: string, page = 1): Promise<{ data: CommunityPost[]; meta?: PageMeta }> =>
    apiPaged<CommunityPost[]>(`/communities/${id(communityId)}/posts?page=${page}`),
  createPost: (communityId: string, body: { title?: string; body: string }) =>
    api<unknown>(`/communities/${id(communityId)}/posts`, send("POST", body)),
  deletePost: (postId: string) => api<unknown>(`/communities/posts/${id(postId)}`, send("DELETE")),
  flag: (postId: string, reason: string) => api<unknown>(`/communities/posts/${id(postId)}/flag`, send("POST", { reason })),
  moderate: (postId: string, status: "hidden" | "visible", reason: string) =>
    api<unknown>(`/communities/posts/${id(postId)}/moderation`, send("PATCH", { status, reason })),
  events: (communityId: string) => api<CommunityEvent[]>(`/communities/${id(communityId)}/events`),
  createEvent: (communityId: string, body: CreateCommunityEvent) => api<unknown>(`/communities/${id(communityId)}/events`, send("POST", body)),
};

/** Backend report codes (`guiding_block_rusak`) → the Indonesian labels of CATEGORIES (same order). */
const CATEGORY_CODES = [
  "guiding_block_rusak",
  "guiding_block_hilang",
  "terhalang",
  "konstruksi",
  "lift_rusak",
  "ramp_terhalang",
  "permukaan_rusak",
  "genangan",
  "tanpa_penyeberangan",
  "lainnya",
];
export const reportCategoryLabel = (code: string) => CATEGORIES[CATEGORY_CODES.indexOf(code)]?.[0] ?? code.replace(/_/g, " ");
export const SEVERITY_LABEL: Record<string, string> = { low: "Ringan", medium: "Sedang", high: "Berat" };

export const formatEventTime = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time} WIB`;
};
