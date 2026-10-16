// Web Push subscription (API_CONTRACT §18, SDD §9, docs/FE-GUIDE-F1-F4.md §3).
// The service worker (public/sw.js) only shows notifications; it never holds a token. Actions
// come back to the app as a URL or a postMessage and the signed-in app makes the API call.

import { api, jsonBody } from "@/lib/api-client";
import type { PushPublicKey } from "@/types/api";

export type PushResult = "granted" | "denied" | "unsupported" | "needs-install";
/** What the device can do right now, without asking anything. "default" = not asked yet. */
export type PushStatus = PushResult | "default";

const SW_URL = "/sw.js";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhone, iPod, and iPadOS (which reports itself as a Mac with a touch screen). */
export const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

function base64UrlToUint8Array(value: string) {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  // Push on iPhone only exists inside the Home Screen app (iOS 16.4+).
  if (isIos() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  // A subscribe in flight may still roll back; read the outcome, not the moment in between.
  await subscribing?.catch(() => {});
  return (await currentSubscription()) ? "granted" : "default";
}

/** One subscribe at a time: parallel callers (sign-in resume and a button press) share it. */
let subscribing: Promise<void> | null = null;

function subscribe() {
  subscribing ??= doSubscribe().finally(() => {
    subscribing = null;
  });
  return subscribing;
}

/** Registers the worker, subscribes with the server's VAPID key, and stores it (POST upserts per endpoint). */
async function doSubscribe() {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api<PushPublicKey>("/push/public-key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) });
  }
  const { endpoint, keys } = sub.toJSON();
  try {
    await api("/push/subscriptions", jsonBody({ endpoint, keys, userAgent: navigator.userAgent.slice(0, 500) }));
  } catch (e) {
    // Not stored on the server → do not leave a subscription the app believes is active.
    await sub.unsubscribe().catch(() => {});
    throw e;
  }
}

/** Must run from a user gesture: Safari only shows the permission prompt for one. Throws ApiError if the server refuses. */
export async function enablePush(): Promise<PushResult> {
  if (isIos() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  await subscribe();
  return "granted";
}

/**
 * After sign-in on a device where this user already allowed notifications: store the subscription
 * again (logout removed it). Never asks for permission.
 */
export async function resumePush() {
  if (!pushSupported() || Notification.permission !== "granted" || (isIos() && !isStandalone())) return;
  await subscribe();
}

/** Removes the subscription from the server, then from the browser. Called on logout and "Matikan". */
export async function disablePush() {
  if (!pushSupported()) return;
  // A sign-in resume still in flight would store the subscription again after this DELETE.
  await subscribing?.catch(() => {});
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await api("/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Notification taps while a window is already open arrive as a message from public/sw.js. */
export function onNotificationAction(fn: (url: string) => void) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const handler = (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: unknown } | null;
    if (d?.type === "notification-action" && typeof d.url === "string" && d.url.startsWith("/")) fn(d.url);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
