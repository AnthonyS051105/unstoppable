"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { MapSourceButton } from "@/components/map/MapSourceButton";
import { TILE_ATTRIBUTION, TILE_URL, toLeaflet, type Coord } from "@/lib/geo";

const PIN = L.divIcon({
  className: "mf-marker",
  iconSize: [44, 44],
  iconAnchor: [22, 41],
  html: '<svg width="44" height="44" viewBox="541 151 68 68" aria-hidden="true"><path d="M575 155 C545 155 543 190 575 214 C607 188 605 155 575 155Z" fill="#b42335" stroke="white" stroke-width="5"/><circle cx="575" cy="178" r="8" fill="white"/></svg>',
});

function Clicks({ onChange }: { onChange: (c: Coord) => void }) {
  useMapEvents({ click: (e) => onChange([e.latlng.lng, e.latlng.lat]) });
  return null;
}

function KeepInView({ coord }: { coord: Coord }) {
  const map = useMap();
  useEffect(() => {
    map.panInside(toLeaflet(coord), { padding: [48, 48], animate: false });
  }, [map, coord]);
  return null;
}

export default function LocationConfirmMap({
  value,
  onChange,
  label,
  describedBy,
}: {
  value: Coord;
  onChange: (c: Coord) => void;
  label: string;
  describedBy: string;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const el = markerRef.current?.getElement();
    const map = mapRef.current;
    if (!el || !map) return;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Penanda lokasi. Gunakan tombol panah untuk memindahkan.");
    el.setAttribute("aria-describedby", describedBy);
    const onKey = (e: KeyboardEvent) => {
      const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      const size = map.getSize();
      const step = e.shiftKey ? 5 : 20;
      const p = map.latLngToContainerPoint(toLeaflet(value)).add([(d[0] * size.x) / step, (d[1] * size.y) / step]);
      const ll = map.containerPointToLatLng(p);
      onChange([ll.lng, ll.lat]);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [value, onChange, describedBy]);

  return (
    <div className="report-location-map location-confirm-map">
      <MapContainer
        ref={mapRef}
        center={toLeaflet(value)}
        zoom={18}
        zoomControl={false}
        attributionControl={false}
        keyboard
        style={{ position: "absolute", inset: 0 }}
        aria-label={label}
        aria-describedby={describedBy}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="mf-tiles" maxZoom={19} />
        <Clicks onChange={onChange} />
        <KeepInView coord={value} />
        <Marker
          ref={markerRef}
          position={toLeaflet(value)}
          icon={PIN}
          draggable
          keyboard
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange([ll.lng, ll.lat]);
            },
          }}
        />
      </MapContainer>
      <MapSourceButton className="corner" />
    </div>
  );
}
