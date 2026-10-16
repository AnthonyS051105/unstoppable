"use client";

import { useEffect } from "react";
import { useUi } from "@/contexts/UiContext";

const FAILED = "Layar mungkin mati sendiri. Ketuk layar sesekali agar panduan tetap berjalan.";

/**
 * Keeps the screen on while `active` (frontend/docs/SDD.md §5.2). The browser drops the lock
 * whenever the tab is hidden, so it is taken again on return. A failure is told, never silent (PRD N6).
 */
export function useWakeLock(active: boolean) {
  const { toast } = useUi();
  useEffect(() => {
    if (!active) return;
    if (!("wakeLock" in navigator)) {
      toast(FAILED);
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    let told = false;
    const acquire = async () => {
      if (lock && !lock.released) return;
      try {
        const l = await navigator.wakeLock.request("screen");
        // The effect may have ended while the request was pending.
        if (stopped) void l.release();
        else lock = l;
      } catch {
        if (!stopped && !told) {
          told = true;
          toast(FAILED);
        }
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active, toast]);
}
