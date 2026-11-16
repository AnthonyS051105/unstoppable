"use client";

import dynamic from "next/dynamic";
import { preconnect } from "react-dom";
import { Icon } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { planFor } from "@/lib/live";
import { placeByName } from "@/lib/places";
import { routeStats } from "@/lib/demo-state";
import { MapFrame } from "./MapFrame";
import type { MapProps } from "./map-data";

export type { MapProps } from "./map-data";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

export function AppMap(opts: MapProps) {
  const { state } = useApp();
  preconnect("https://tile.openstreetmap.org");
  const plan = planFor(placeByName(state.destination)?.id, state.profiles[0]);
  const stats = routeStats(state);
  return (
    <MapFrame opts={opts}>
      <div className="map-world" style={{ position: "absolute", inset: 0 }}>
        <LeafletMap {...opts} />
        {!opts.editor && !opts.compare && opts.planned && planFor(placeByName(state.destination)?.id, state.profiles[0]) ? (
          <div className="map-label">
            <Icon name="person-standing" />
            <div>
              <strong>{plan?.route.estimatedDurationMin != null ? `${plan.route.estimatedDurationMin} menit` : "Durasi belum tersedia"}</strong>
              <small>{stats.distance} m</small>
            </div>
          </div>
        ) : null}
      </div>
    </MapFrame>
  );
}
