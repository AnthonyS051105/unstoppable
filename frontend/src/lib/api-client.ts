// Single gateway to the backend (frontend/docs/SDD.md §3.1, INTEGRATION-GUIDE §4.1).
// - Attaches the access token, refreshes once on 401 TOKEN_EXPIRED (with a mutex), then retries.
// - Unwraps { success, data } and throws ApiError with the backend's Indonesian `message`.
// - Network failure → ApiError("NETWORK"), never a raw TypeError.

import type { AuthResult, Envelope, Health, TokenPair } from "@/types/api";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");
const SERVER_ORIGIN = API_BASE_URL.replace(/\/api$/, "");
export const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || SERVER_ORIGIN).replace(/\/$/, "");

export const NETWORK_MESSAGE = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Token store. Access token lives in memory only (SDD §2.1).
// Refresh token: the contract (§2) returns it in the response body and expects it
// back in the body, so it has to be kept client-side until the backend moves it to
// an httpOnly cookie as SDD §2.1 intends. Kept in its own key, never in the demo
// state, never logged, never put in a URL.
// ---------------------------------------------------------------------------

const REFRESH_KEY = "unstoppable-refresh-v1";
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

function readRefresh() {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefresh(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {}
}

export const tokens = {
  access: () => accessToken,
  hasRefresh: () => !!readRefresh(),
  refresh: readRefresh,
  set(pair: TokenPair) {
    accessToken = pair.accessToken;
    writeRefresh(pair.refreshToken);
    listeners.forEach((l) => l(accessToken));
  },
  clear() {
    accessToken = null;
    writeRefresh(null);
    listeners.forEach((l) => l(null));
  },
  /** Notified whenever the access token changes (login, refresh, logout). */
  subscribe(fn: (token: string | null) => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

let onSessionExpired: (() => void) | null = null;
/** AuthContext registers what happens when the refresh token is no longer valid. */
export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

let refreshing: Promise<boolean> | null = null;

/**
 * Rotates the token pair. Concurrent callers in this tab share one request (SDD §3.1 mutex),
 * and a Web Lock serialises refreshes across tabs: the backend revokes every session when a
 * rotated refresh token is reused, so two tabs must never send the same one. The token is read
 * inside the lock, so a tab that waited uses the token the other tab just stored.
 */
export function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  if (!readRefresh()) return Promise.resolve(false);
  const run = async () => {
    const refreshToken = readRefresh();
    if (!refreshToken) return false;
    try {
      const pair = await request<TokenPair>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }, false);
      tokens.set(pair);
      return true;
    } catch (e) {
      // Only a rejected refresh token (401) ends the session; network/server errors keep it.
      if (e instanceof ApiError && e.status === 401) {
        tokens.clear();
        onSessionExpired?.();
      }
      return false;
    }
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const pending: Promise<boolean> = (locks ? locks.request(REFRESH_KEY, run).then((ok) => ok) : run()).finally(() => {
    refreshing = null;
  });
  refreshing = pending;
  return pending;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function request<T>(path: string, init: RequestInit, withAuth: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (withAuth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (e) {
    // A caller-cancelled request (debounced search) is not a network failure.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", NETWORK_MESSAGE, 0);
  }
  if (res.status === 204) return undefined as T;

  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError("INTERNAL_ERROR", "Server memberikan jawaban yang tidak dapat dibaca. Coba lagi sebentar lagi.", res.status);
  }
  if (body.success) return body.data;
  throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
}

/** Authenticated call; returns `data` from the envelope. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken && readRefresh()) await refreshTokens();
  try {
    return await request<T>(path, init, true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && e.code === "TOKEN_EXPIRED" && (await refreshTokens())) {
      return request<T>(path, init, true);
    }
    throw e;
  }
}

/** Call that never sends a token (login, register, public reference data). */
export function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, false);
}

export const jsonBody = (data: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(data) });

/**
 * Fire-and-forget POST that outlives the page being hidden or unloaded (keepalive).
 * Never awaits, never throws. sendBeacon is not usable: it cannot carry Authorization.
 */
export function beacon(path: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    fetch(`${API_BASE_URL}${path}`, { method: "POST", keepalive: true, headers }).catch(() => {});
  } catch {}
}

/** Stores tokens from verify-otp / login. */
export function startSession(result: AuthResult) {
  tokens.set(result);
  return result.user;
}

/** GET /health sits outside /api (API_CONTRACT §16) and has no envelope. */
export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_ORIGIN}/health`, { signal, cache: "no-store" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", NETWORK_MESSAGE, 0);
  }
  if (!res.ok) throw new ApiError("INTERNAL_ERROR", "Server sedang bermasalah. Coba lagi sebentar lagi.", res.status);
  return (await res.json()) as Health;
}

/** Message safe to show the user for any thrown value (SDD §3.2). */
export function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : NETWORK_MESSAGE;
}
