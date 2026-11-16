"use client";

import { useEffect, useState } from "react";
import type { LngLat } from "@/types/api";

export type UserPosition = { coord: LngLat | null; status: "pending" | "ready" | "denied"; retry: () => void };

/** Device position as [lng, lat]. Never guessed: `denied` when the browser cannot or will not give it. */
export function useUserPosition(): UserPosition {
  const [coord, setCoord] = useState<LngLat | null>(null);
  const [status, setStatus] = useState<UserPosition["status"]>("pending");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!navigator.geolocation) {
      queueMicrotask(() => setStatus("denied"));
      return;
    }
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!alive) return;
        setCoord([p.coords.longitude, p.coords.latitude]);
        setStatus("ready");
      },
      () => alive && setStatus("denied"),
      { timeout: 8000, maximumAge: 60_000 },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  return {
    coord,
    status,
    retry: () => {
      setStatus("pending");
      setAttempt((a) => a + 1);
    },
  };
}
