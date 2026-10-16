"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Icon } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { filterControl, mapControl } from "@/lib/controls";
import { PROFILE_SHORT } from "@/lib/data";
import { FILTER_ICONS, FILTERS, type MapProps } from "./map-data";
import { MapSourceButton } from "./MapSourceButton";

function MapChrome({ opts }: { opts: MapProps }) {
  const { state, update, announce, toast } = useApp();
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const showFilters = !opts.editor && opts.filters !== false;

  useEffect(() => {
    if (!showFilters) return;
    filterControl.current = {
      isOpen: () => !!barRef.current?.hasAttribute("data-open"),
      close: () => {
        setOpen(false);
        toggleRef.current?.focus();
      },
    };
    const outside = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.(".map-toolbar")) setOpen(false);
    };
    document.addEventListener("click", outside);
    return () => {
      filterControl.current = null;
      document.removeEventListener("click", outside);
    };
  }, [showFilters]);

  const zoom = (fn: "zoomIn" | "zoomOut" | "locate") => {
    const m = mapControl.current;
    if (!m) return;
    m[fn]();

    setTimeout(() => announce(`Zoom peta ${m.zoomPct()} persen.`), 300);
    if (fn === "locate") toast("Peta dipusatkan pada lingkungan sekitar (demo).");
  };
  const a = state.compareA || "wheelchair",
    b = state.compareB || "blind";

  return (
    <>
      {showFilters ? (
        <div className="map-toolbar" ref={barRef} data-open={open ? "" : undefined}>
          <button
            type="button"
            ref={toggleRef}
            className="tab white map-filter-toggle"
            data-action="toggle-filters"
            aria-expanded={open}
            aria-controls="map-filter-list"
            onClick={() => setOpen(!open)}
          >
            <Icon name="sliders-horizontal" />
            <span>Filter: {state.filter}</span>
            <Icon name="chevron-down" />
          </button>
          <div className="map-filter-list" id="map-filter-list" role="group" aria-label="Filter peta">
            {FILTERS.map((f, i) => (
              <button
                key={f}
                type="button"
                className={`tab ${state.filter === f ? "active" : "white"}`}
                data-filter={f}
                aria-pressed={state.filter === f}
                onClick={() => {
                  update({ filter: f });
                  toggleRef.current?.focus();
                }}
              >
                {i ? <Icon name={FILTER_ICONS[i]} /> : null}
                {f}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="map-tools">
        <Btn action="map-locate" kind="btn-round" icon="navigation" aria-label="Pusatkan peta" onClick={() => zoom("locate")} />
        <Btn action="zoom-in" kind="btn-round" icon="plus" aria-label="Perbesar peta" onClick={() => zoom("zoomIn")} />
        <Btn action="zoom-out" kind="btn-round" icon="minus" aria-label="Perkecil peta" onClick={() => zoom("zoomOut")} />
      </div>
      <div className="map-caption">
        {opts.editor ? (
          <>
            <span className="line-sample"></span>Disetujui <span className="line-sample dash"></span>Draft
          </>
        ) : opts.compare ? (
          <>
            <span>
              <span className="line-sample dash"></span>
              {PROFILE_SHORT[a]}
              {opts.hideA ? ", tidak terjangkau" : ""}
            </span>
            <span>
              <span className="line-sample blue"></span>
              {PROFILE_SHORT[b]}
              {opts.hideB ? ", tidak terjangkau" : ""}
            </span>
          </>
        ) : (
          <>
            <span>
              <span className="line-sample"></span>Rute yang sesuai
            </span>
            <span>Trotoar & penyeberangan</span>
          </>
        )}
      </div>
    </>
  );
}

export function MapFrame({ opts, children }: { opts: MapProps; children: React.ReactNode }) {
  const { editor } = opts;
  return (
    <div
      className={`map ${editor ? "editor-map" : ""}`}
      data-map=""
      aria-label={editor && !opts.label ? "Peta editor. Gunakan daftar node untuk akses keyboard." : opts.label}
      id={opts.label ? "map-region" : undefined}
      role={opts.label ? "region" : undefined}
      tabIndex={opts.label ? -1 : undefined}
    >
      {opts.summary ? <p className="sr-only">{opts.summary}</p> : null}
      {children}
      <MapChrome opts={opts} />
      <MapSourceButton />
    </div>
  );
}
