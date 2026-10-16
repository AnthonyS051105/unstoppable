"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { notificationsApi } from "@/lib/api/notifications";
import type { AppNotification } from "@/types/api";

// Unread count shown on the bell. The API has no count endpoint (§18), so it is derived from the
// first page of GET /notifications and kept current by notification:new; the inbox screen
// adjusts it through `unreadStore` when items are marked read. Server state, never persisted.

const FALLBACK_POLL_MS = 30_000;
let unread = 0;
const listeners = new Set<() => void>();

function setUnread(n: number) {
  const next = Math.max(0, n);
  if (next === unread) return;
  unread = next;
  listeners.forEach((l) => l());
}

export const unreadStore = {
  set: setUnread,
  add: (n: number) => setUnread(unread + n),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  get: () => unread,
};

/** Mount once (the bell in AppShell): loads the count and follows notification:new. */
export function useUnreadNotifications() {
  const { status } = useAuth();
  const { fallback } = useSocket();
  const authed = status === "authenticated";

  useEffect(() => {
    if (!authed) {
      setUnread(0);
      return;
    }
    let alive = true;
    const load = () =>
      notificationsApi
        .list(1)
        .then(({ data }) => alive && setUnread(data.filter((n) => !n.readAt).length))
        .catch(() => {}); // the bell just keeps its last count; the inbox screen reports errors itself
    load();
    const timer = fallback ? setInterval(load, FALLBACK_POLL_MS) : undefined;
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authed, fallback]);

  useSocketEvent<Pick<AppNotification, "id">>("notification:new", () => unreadStore.add(1));

  return useSyncExternalStore(unreadStore.subscribe, unreadStore.get, () => 0);
}
