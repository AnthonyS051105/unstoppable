"use client";

import { useEffect, useRef, useState } from "react";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import { useUserPosition } from "@/hooks/useUserPosition";
import { coordText } from "@/lib/geocode";
import { live, setRouteOrigin, useLive } from "@/lib/live";
import { allPlaces } from "@/lib/places";
import { Btn } from "@/components/ui";

export function MobileRouteOrigin() {
  useLive();
  const [editing, setEditing] = useState(false);
  const position = useUserPosition();
  const gpsRequested = useRef(false);
  useEffect(() => {
    if (!gpsRequested.current || position.status !== "ready" || !position.coord) return;
    gpsRequested.current = false;
    setRouteOrigin({ label: "Lokasi GPS Anda", point: { type: "Point", coordinates: position.coord } });
  }, [position.coord, position.status]);
  const origin = live.origin;
  const value = origin ? { name: origin.label, address: coordText(origin.point.coordinates), coord: origin.point.coordinates, source: "map" as const } : null;
  if (editing) return <LocationPicker
    title="Cari titik asal"
    subtitle="Cari nama tempat atau alamat di mana saja, atau pilih titik di peta."
    initial={value}
    shortcuts={allPlaces().filter((p) => p.coord).map((p) => ({ label: p.name, detail: p.meta, icon: p.icon,
      value: { name: p.name, address: p.kind, coord: p.coord!, source: "place" as const } }))}
    onPick={(location) => {
      setRouteOrigin({ label: location.source === "gps" ? "Lokasi GPS Anda" : location.name, point: { type: "Point", coordinates: location.coord } });
      setEditing(false);
    }}
    onCancel={() => setEditing(false)}
  />;
  return <section className="route-origin-search stack-sm" aria-label="Titik asal rute">
    <LocationField id="route-origin" label="Dari" value={value} placeholder="Cari alamat atau titik asal" onOpen={() => setEditing(true)} />
    <Btn label="Gunakan lokasi saya" icon="locate-fixed" onClick={() => {
      if (position.status === "ready" && position.coord) setRouteOrigin({ label: "Lokasi GPS Anda", point: { type: "Point", coordinates: position.coord } });
      else { gpsRequested.current = true; position.retry(); }
    }} />
    {position.error ? <p className="small" role="status">{position.error}</p> : null}
  </section>;
}
