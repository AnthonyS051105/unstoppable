"use client";

import { useEffect } from "react";
import { useSocket } from "@/contexts/SocketContext";
import { sessionsApi } from "@/lib/api/sessions";

/**
 * Tells the backend when the app is hidden (screen locked, tab switched) and visible again
 * (API_CONTRACT §13 pause/resume, §15.2). Mounted once in ActiveSessionProvider.
 *
 * Pause always goes over REST with keepalive: by the time the page is hidden the socket is often
 * already gone or about to be frozen. Resume prefers the socket and falls back to REST.
 */
export function useSessionVisibility(sessionId: string | null) {
  const { socket } = useSocket();
  useEffect(() => {
    if (!sessionId) return;
    // visibilitychange and pagehide usually fire together; only send real transitions.
    let hidden = document.visibilityState === "hidden";
    const onChange = (e: Event) => {
      const now = e.type === "pagehide" || document.visibilityState === "hidden";
      if (now === hidden) return;
      hidden = now;
      if (now) {
        if (socket?.connected) socket.emit("session:pause", { sessionId });
        sessionsApi.pause(sessionId);
      } else if (socket?.connected) socket.emit("session:resume", { sessionId });
      else sessionsApi.resume(sessionId).catch(() => {});
    };
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("pagehide", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("pagehide", onChange);
    };
  }, [sessionId, socket]);
}
