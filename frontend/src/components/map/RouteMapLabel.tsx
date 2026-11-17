"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { Marker, useMap } from "react-leaflet";
import { routeLabelPosition } from "@/lib/route-label-layout";
import type { LatLng } from "@/lib/geo";

export function RouteMapLabel({ lines, duration, distance }: { lines: LatLng[][]; duration: number | null; distance: number }) {
  const map = useMap();
  const [position, setPosition] = useState<L.LatLng | null>(null);
  const icon = useMemo(() => L.divIcon({
    className: "route-map-label",
    iconSize: [132, 58], iconAnchor: [0, 0],
    html: `<strong>${duration == null ? "Rute perjalanan" : `${duration} menit`}</strong><span>${Math.round(distance)} meter</span>`,
  }), [duration, distance]);
  useEffect(() => {
    const place = () => {
      const el = map.getContainer();
      const rect = el.getBoundingClientRect();
      const stage = el.closest(".mf-stage");
      const sheet = stage?.querySelector(".mf-sheet")?.getBoundingClientRect();
      const tools = stage?.querySelector(".map-tools")?.getBoundingClientRect();
      const status = stage?.querySelector(".trip-top-status")?.getBoundingClientRect();
      const caption = stage?.querySelector(".map-caption")?.getBoundingClientRect();
      const bottom = Math.min(rect.height - 12, sheet ? sheet.top - rect.top - 12 : rect.height,
        caption?.height ? caption.top - rect.top - 8 : rect.height);
      const point = routeLabelPosition(lines.map((line) => line.map((p) => map.latLngToContainerPoint(p))), {
        left: 12, top: status?.height ? status.bottom - rect.top + 12 : 12,
        right: tools?.width ? tools.left - rect.left - 12 : rect.width - 12, bottom,
      });
      setPosition(point ? map.containerPointToLatLng([point.x, point.y]) : null);
    };
    map.on("moveend zoomend resize", place);
    const ro = new ResizeObserver(place);
    ro.observe(map.getContainer());
    const sheet = map.getContainer().closest(".mf-stage")?.querySelector(".mf-sheet");
    if (sheet) ro.observe(sheet);
    place();
    return () => { map.off("moveend zoomend resize", place); ro.disconnect(); };
  }, [map, lines]);
  return position ? <Marker position={position} icon={icon} interactive={false} keyboard={false} /> : null;
}
