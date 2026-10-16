"use client";

import { useEffect, useRef } from "react";
import { distanceM, type Coord } from "@/lib/geo";

const THRESHOLD_M = 40;

/**
 * Calls `onDeparted` once when the user moves THRESHOLD_M away from `origin` while the route
 * preview is open without pressing Mulai (UI_UX_FLOW §7a). Without an `origin` (no planned
 * route yet) the first accurate fix is used as the starting point.
 *
 * Only runs when location permission is already granted: this must never trigger the prompt.
 */
export function useDepartureDetector(origin: Coord | null, enabled: boolean, onDeparted: () => void) {
  const fired = useRef(false);
  const callback = useRef(onDeparted);
  useEffect(() => {
    callback.current = onDeparted;
  }, [onDeparted]);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator) || !navigator.permissions) return;
    fired.current = false;
    let start: Coord | null = origin;
    let watch: number | null = null;
    let stopped = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (stopped || p.state !== "granted") return;
        watch = navigator.geolocation.watchPosition(
          ({ coords }) => {
            // Ignore fixes worse than the threshold itself; indoor GPS often jumps 30–50 m.
            if (fired.current || coords.accuracy > THRESHOLD_M) return;
            const here: Coord = [coords.longitude, coords.latitude];
            if (!start) start = here;
            else if (distanceM(start, here) >= THRESHOLD_M) {
              fired.current = true;
              callback.current();
            }
          },
          undefined,
          { enableHighAccuracy: true, maximumAge: 10_000 },
        );
      })
      .catch(() => {});
    return () => {
      stopped = true;
      if (watch !== null) navigator.geolocation.clearWatch(watch);
    };
  }, [origin, enabled]);
}
