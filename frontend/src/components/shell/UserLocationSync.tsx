"use client";

import { usePathname } from "next/navigation";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { useEffect } from "react";
import { useUserPosition } from "@/hooks/useUserPosition";
import { live, setRouteOrigin } from "@/lib/live";

export function UserLocationSync() {
  const { coord, status } = useUserPosition();
  const pathname = usePathname();
  const { session } = useActiveSession();
  useEffect(() => {
    // Keep explicit origins and any route already being calculated or followed intact.
    if (status !== "ready" || !coord || session || live.planning) return;
    if (pathname !== "/home" && (live.plan || live.blocked || live.compare)) return;
    if (live.origin && live.origin.label !== "Lokasi GPS Anda") return;
    const previous = live.origin?.point.coordinates;
    if (previous && Math.abs(previous[0] - coord[0]) < 0.00005 && Math.abs(previous[1] - coord[1]) < 0.00005) return;
    setRouteOrigin({ label: "Lokasi GPS Anda", point: { type: "Point", coordinates: coord } });
  }, [coord, status, pathname, session]);
  return null;
}
