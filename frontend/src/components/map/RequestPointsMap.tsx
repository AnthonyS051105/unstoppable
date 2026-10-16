"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { TILE_ATTRIBUTION, TILE_URL, toLeaflet, type Coord } from "@/lib/geo";
import { MapSourceButton } from "./MapSourceButton";

const DEST_ICON = L.divIcon({
  className: "mf-marker",
  iconSize: [32, 32],
  iconAnchor: [16, 30],
  html: '<svg width="32" height="32" viewBox="541 151 68 68" aria-hidden="true"><path d="M575 155 C545 155 543 190 575 214 C607 188 605 155 575 155Z" fill="#b42335" stroke="white" stroke-width="5"/></svg>',
});

function Frame({ a, b }: { a: Coord; b?: Coord }) {
  const map = useMap();
  useEffect(() => {
    if (!b) map.setView(toLeaflet(a), 17, { animate: false });
    else map.fitBounds(L.latLngBounds([toLeaflet(a), toLeaflet(b)]).pad(0.6), { animate: false, maxZoom: 18 });
  }, [map, a, b]);
  return null;
}

export default function RequestPointsMap({ destination, meeting, label }: { destination: Coord; meeting?: Coord; label: string }) {
  const key = useMemo(() => destination.join() + (meeting?.join() || ""), [destination, meeting]);
  return (
    <div className="report-location-map" role="img" aria-label={label}>
      <MapContainer
        key={key}
        center={toLeaflet(destination)}
        zoom={17}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        style={{ position: "absolute", inset: 0 }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="mf-tiles" maxZoom={19} />
        <Frame a={destination} b={meeting} />
        <Marker position={toLeaflet(destination)} icon={DEST_ICON} interactive={false} keyboard={false} />
        {meeting ? (
          <CircleMarker
            center={toLeaflet(meeting)}
            radius={8}
            pathOptions={{ color: "#ffffff", weight: 4, fillColor: "#174da8", fillOpacity: 1, interactive: false }}
          />
        ) : null}
      </MapContainer>
      <MapSourceButton className="corner" />
    </div>
  );
}
