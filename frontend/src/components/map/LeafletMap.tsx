"use client";

import L from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { iconMarkup } from "@/components/ui/Icon";
import { PIN_PLACE, PLACES, placeById, placeCoord, placeHref } from "@/lib/places";
import { live } from "@/lib/live";
import { useApp } from "@/hooks/useApp";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { mapControl } from "@/lib/controls";
import {
  coordToPct,
  DEMO_DESTINATION,
  demoToCoord,
  pctToCoord,
  svgPathToLine,
  TILE_ATTRIBUTION,
  TILE_URL,
  toLeaflet,
  type LatLng,
} from "@/lib/geo";
import { DESTINATION, ORIGIN, PINS, pinLabel, pinVisible, ROUTE, SHAPES, type MapProps } from "./map-data";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const DESTINATION_ICON = L.divIcon({
  className: "mf-marker",
  iconSize: [40, 40],
  iconAnchor: [20, 37],
  html: '<svg width="40" height="40" viewBox="541 151 68 68" aria-hidden="true"><path d="M575 155 C545 155 543 190 575 214 C607 188 605 155 575 155Z" fill="#b42335" stroke="white" stroke-width="5"/></svg>',
});

const line = (d: string): LatLng[] => svgPathToLine(d).map(toLeaflet);

const geom = (c?: { coordinates: [number, number][] }): LatLng[] => (c?.coordinates ?? []).map(toLeaflet);
const liveCompare = (id: string) => live.compare?.data.results.find((r) => r.profileId === id && r.reachable && r.geometry);

function RoutePath({ d, pts: given, dash, color }: { d?: string; pts?: LatLng[]; dash?: boolean; color: string }) {
  const pts = useMemo(() => given ?? line(d!), [d, given]);
  return (
    <>
      <Polyline positions={pts} pathOptions={{ color: "#ffffff", weight: 12, lineJoin: "round", lineCap: "round", interactive: false }} />
      <Polyline
        positions={pts}
        pathOptions={{ color, weight: 6, lineJoin: "round", dashArray: dash ? "14 10" : undefined, interactive: false }}
      />
    </>
  );
}

function overlayPadding(map: L.Map): L.FitBoundsOptions {
  const el = map.getContainer();
  const m = el.getBoundingClientRect();
  const stage = el.closest(".mf-stage");
  let left = 24,
    right = 24,
    top = 24,
    bottom = 24;
  const mobile = matchMedia("(max-width:960px)").matches;
  if (mobile) {
    const sheet = stage?.querySelector(".mf-sheet")?.getBoundingClientRect();
    if (sheet && sheet.height && sheet.top < m.bottom) bottom = Math.max(bottom, m.bottom - sheet.top + 16);
    const tools = stage?.querySelector(".map-tools")?.getBoundingClientRect();
    if (tools?.width) right = Math.max(right, m.right - tools.left + 8);
  } else {
    const panel = stage?.querySelector(".mf-panel")?.getBoundingClientRect();
    if (panel && panel.width && panel.right > m.left && panel.left < m.right && panel.bottom > m.top + m.height / 2) {
      if (panel.left - m.left < m.width / 2) left = Math.max(left, panel.right - m.left + 24);
      else right = Math.max(right, m.right - panel.left + 24);
    }
  }

  for (const sel of [".map-toolbar", ".search"]) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r?.height && r.bottom > m.top && r.top < m.top + m.height / 3 && r.left < m.right && r.right > m.left)
      top = Math.max(top, r.bottom - m.top + 12);
  }
  if (left + right > m.width - 120) left = right = 24;
  if (top + bottom > m.height - 80) top = bottom = Math.max(8, (m.height - 80) / 4);
  return { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom] };
}

function Controller({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  const baseZoom = useRef(map.getZoom());
  useEffect(() => {
    const fit = (animate: boolean) => {
      const { width, height } = map.getContainer().getBoundingClientRect();
      if (!width || !height) return false;
      map.invalidateSize({ pan: false });
      map.fitBounds(bounds, { ...overlayPadding(map), animate });
      baseZoom.current = map.getZoom();
      return true;
    };
    let fitted = fit(false);

    const ro = new ResizeObserver(() => {
      if (!fitted) fitted = fit(false);
      else map.invalidateSize({ pan: false });
    });
    ro.observe(map.getContainer());

    let last = document.body.dataset.sheet;
    const mo = new MutationObserver(() => {
      const now = document.body.dataset.sheet;
      if (now !== last) {
        last = now;
        if (now !== "full") setTimeout(() => fit(true), 220);
      }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-sheet"] });
    mapControl.current = {
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      locate: () => map.fitBounds(bounds, overlayPadding(map)),
      zoomPct: () => Math.round(2 ** (map.getZoom() - baseZoom.current) * 100),
    };
    return () => {
      ro.disconnect();
      mo.disconnect();
      mapControl.current = null;
    };
  }, [map, bounds]);
  return null;
}

function EditorClicks({ onAdd }: { onAdd?: (x: number, y: number) => void }) {
  const { state } = useApp();
  useMapEvents({
    click: (e) => {
      if (state.mapMode !== 2 || !onAdd) return;
      const p = coordToPct([e.latlng.lng, e.latlng.lat]);
      onAdd(Math.round(Math.max(0, Math.min(100, p.x))), Math.round(Math.max(0, Math.min(100, p.y))));
    },
  });
  return null;
}

export default function LeafletMap(opts: MapProps) {
  const { state } = useApp();
  const router = useRouter();
  const mobile = useMediaQuery("(max-width:960px)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { editor } = opts;
  const floorNodes = state.nodes.filter((n) => (n.floor || "Luar") === state.currentFloor);

  const boundsKey = editor
    ? floorNodes.map((n) => `${n.x},${n.y}`).join("|")
    : `${opts.compare}|${state.compareA}|${state.compareB}|${opts.radius || 0}|${opts.center?.join() || ""}`;
  const L_ = live.buildings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planPts = useMemo(() => geom(live.plan?.route.geometry), [live.plan]);
  const cmpA = L_ && opts.compare ? liveCompare(state.compareA || "wheelchair") : undefined;
  const cmpB = L_ && opts.compare ? liveCompare(state.compareB || "blind") : undefined;
  const cmpAPts = useMemo(() => geom(cmpA?.geometry), [cmpA]);
  const cmpBPts = useMemo(() => geom(cmpB?.geometry), [cmpB]);
  const livePins = useMemo(
    () =>
      L_
        ? PLACES.filter((p) => p.coord).map((p) => ({
            p,
            icon: L.divIcon({
              className: "mf-marker",
              iconSize: [0, 0],
              html: `<a class="pin dark" href="${placeHref(p)}" aria-label="${esc(p.name)}"${opts.label ? ' tabindex="-1"' : ""} style="left:-17px;top:-41px">${iconMarkup(p.icon)}</a>`,
            }),
          }))
        : [],
    [L_, opts.label, live.buildings], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bounds = useMemo(() => {
    if (L_ && !editor && !opts.radius) {
      const pts = opts.compare ? [...cmpAPts, ...cmpBPts] : planPts;
      const all = pts.length ? pts : PLACES.filter((p) => p.coord).map((p) => toLeaflet(placeCoord(p)));
      if (all.length) return L.latLngBounds(all).pad(0.2);
    }
    if (opts.radius) return L.latLng(toLeaflet(opts.center || DEMO_DESTINATION)).toBounds(opts.radius * 2000);
    const pts: LatLng[] = editor
      ? floorNodes.length
        ? floorNodes.map((n) => toLeaflet(pctToCoord(n.x, n.y)))
        : [toLeaflet(DEMO_DESTINATION)]
      : opts.compare
        ? [...line(SHAPES[state.compareA || "wheelchair"]), ...line(SHAPES[state.compareB || "blind"])]
        : line(ROUTE);
    return L.latLngBounds(pts).pad(editor ? 0.25 : 0.12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, L_, planPts, cmpAPts, cmpBPts]);

  const nodeIcons = useMemo(
    () =>
      new Map(
        floorNodes.map((n) => [
          n.id,
          L.divIcon({
            className: "mf-marker",
            iconSize: [0, 0],
            html: `<button type="button" class="node ${n.status} ${state.selectedNode === n.id ? "selected" : ""}" style="left:0;top:0" data-node="${n.id}" aria-label="${esc(
              `Node ${n.id}, ${n.name}, ${n.status}`,
            )}" tabindex="${mobile ? -1 : 0}"></button>`,
          }),
        ]),
      ),
    [floorNodes, state.selectedNode, mobile],
  );

  const pinIcons = useMemo(
    () =>
      PINS.map(([color, ico]) =>
        L.divIcon({
          className: "mf-marker",
          iconSize: [0, 0],
          html: `<a class="pin ${color}" href="${(() => { const pl = placeById(PIN_PLACE[ico]); return pl ? placeHref(pl) : "#"; })()}" aria-label="${pinLabel(ico)}"${opts.label ? ' tabindex="-1"' : ""} style="left:-17px;top:-41px">${iconMarkup(ico)}</a>`,
        }),
      ),
    [opts.label],
  );

  const onClickCapture = (e: React.MouseEvent) => {
    const a = (e.target as Element).closest?.<HTMLAnchorElement>("a.pin");
    if (a) {
      e.preventDefault();
      router.push(a.getAttribute("href")!);
    }
  };

  return (
    <div className="mf-leaflet" onClickCapture={onClickCapture}>
      <MapContainer
        center={toLeaflet(DEMO_DESTINATION)}
        zoom={17}
        zoomControl={false}
        attributionControl={false}
        keyboard={false}
        zoomAnimation={!reduced}
        fadeAnimation={!reduced}
        markerZoomAnimation={!reduced}
        style={{ position: "absolute", inset: 0 }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="mf-tiles" maxZoom={19} />
        <Controller bounds={bounds} />
        {editor ? (
          <>
            <EditorClicks onAdd={opts.onAddNode} />
            {state.edges.map((e) => {
              const a = floorNodes.find((n) => n.id === e.a),
                b = floorNodes.find((n) => n.id === e.b);
              if (!a || !b) return null;
              return (
                <Polyline
                  key={e.id}
                  positions={[toLeaflet(pctToCoord(a.x, a.y)), toLeaflet(pctToCoord(b.x, b.y))]}
                  pathOptions={{
                    color: e.status === "approved" ? "#278965" : "#c99200",
                    weight: 6,
                    dashArray: e.status === "draft" ? "10 8" : undefined,
                    bubblingMouseEvents: false,
                  }}
                  eventHandlers={{ click: () => opts.onEdge?.(e.id) }}
                />
              );
            })}
            {floorNodes.map((n) => (
              <Marker
                key={n.id}
                position={toLeaflet(pctToCoord(n.x, n.y))}
                icon={nodeIcons.get(n.id)!}
                keyboard={false}
                eventHandlers={{ click: () => opts.onNode?.(n.id) }}
              />
            ))}
          </>
        ) : (
          <>
            {L_ ? (
              <>
                {opts.compare ? (
                  <>
                    {opts.hideA || !cmpAPts.length ? null : <RoutePath pts={cmpAPts} dash color="#805500" />}
                    {opts.hideB || !cmpBPts.length ? null : <RoutePath pts={cmpBPts} color="#174da8" />}
                  </>
                ) : planPts.length ? (
                  <>
                    <RoutePath pts={planPts} color="#a36a00" />
                    <CircleMarker
                      center={planPts[0]}
                      radius={9}
                      pathOptions={{ color: "#ffffff", weight: 4, fillColor: "#174da8", fillOpacity: 1, interactive: false }}
                    />
                    <Marker position={planPts[planPts.length - 1]} icon={DESTINATION_ICON} keyboard={false} interactive={false} />
                  </>
                ) : null}
                {livePins.map(({ p, icon }) => (
                  <Marker key={p.id} position={toLeaflet(placeCoord(p))} icon={icon} keyboard={false} />
                ))}
              </>
            ) : opts.compare ? (
              <>
                {opts.hideA ? null : <RoutePath d={SHAPES[state.compareA || "wheelchair"]} dash color="#805500" />}
                {opts.hideB ? null : <RoutePath d={SHAPES[state.compareB || "blind"]} color="#174da8" />}
              </>
            ) : (
              <RoutePath d={ROUTE} color="#a36a00" />
            )}
            {L_ ? null : (
              <>
                <CircleMarker
                  center={toLeaflet(demoToCoord(ORIGIN.x, ORIGIN.y))}
                  radius={9}
                  pathOptions={{ color: "#ffffff", weight: 4, fillColor: "#174da8", fillOpacity: 1, interactive: false }}
                />
                <Marker
                  position={toLeaflet(demoToCoord(DESTINATION.x, DESTINATION.y))}
                  icon={DESTINATION_ICON}
                  keyboard={false}
                  interactive={false}
                />
                {PINS.map((p, i) =>
                  pinVisible(state.filter, p) ? (
                    <Marker key={i} position={toLeaflet(pctToCoord(p[2], p[3]))} icon={pinIcons[i]} keyboard={false} />
                  ) : null,
                )}
              </>
            )}
          </>
        )}
        {opts.radius ? (
          <Circle
            center={toLeaflet(opts.center || DEMO_DESTINATION)}
            radius={opts.radius * 1000}
            pathOptions={{ color: "#ba8d00", weight: 3, dashArray: "10 8", fillColor: "#ffc629", fillOpacity: 0.15, interactive: false }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
