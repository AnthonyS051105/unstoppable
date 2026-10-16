"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRoute } from "@/components/shared";
import { Icon } from "@/components/ui/Icon";
import { useUi } from "@/contexts/UiContext";
import { useOverlayAlign } from "@/hooks/useOverlayAlign";
import { sheetControl, type SheetPos } from "@/lib/controls";

const STEPS: SheetPos[] = ["peek", "half", "full"];
const SHEET_DEFAULT: Record<string, SheetPos> = {
  home: "peek",
  preview: "half",
  trip: "peek",
  places: "peek",
  monitor: "half",
  "service-area": "half",
  compare: "half",
  editor: "half",
  review: "half",
};
const sheetMemo: Record<string, SheetPos> = {};
const panelMemo: Record<string, boolean> = {};
const ANNOUNCE: Record<SheetPos, string> = { peek: "diciutkan", half: "dibuka setengah tinggi", full: "dibuka penuh" };

const sheetLabel = (pos: SheetPos, name: string) =>
  pos === "peek" ? `Perluas panel ${name}` : pos === "half" ? `Perluas panel ${name} penuh` : `Ciutkan panel ${name}`;

type Props = {
  id: string;
  ariaLabel: string;
  skipLabel: string;

  name: string;

  handleAction?: boolean;
  panelId?: string;
  docked?: boolean;
  pageClass?: string;
  before?: React.ReactNode;
  after?: React.ReactNode;
  map: React.ReactNode;
  children: React.ReactNode;
};

export function MapStage({
  id,
  ariaLabel,
  skipLabel,
  name,
  handleAction,
  panelId = "main",
  docked,
  pageClass = "",
  before,
  after,
  map,
  children,
}: Props) {
  const route = useRoute();
  const { announce, setSkipTargets } = useUi();
  const [pos, setPos] = useState<SheetPos>(() => sheetMemo[route] || SHEET_DEFAULT[route] || "peek");
  const handleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useOverlayAlign(stageRef, route === "home");
  const bodyId = id + "-body";

  const panelKey = route + ":" + panelId;
  const [collapsed, setCollapsed] = useState(() =>
    panelKey in panelMemo
      ? panelMemo[panelKey]
      : panelId === "side" && typeof window !== "undefined" && matchMedia("(max-width:1230px)").matches,
  );

  const setSheet = useCallback(
    (p: SheetPos) => {
      if (p === "peek") {
        const a = document.activeElement;
        if (a && a !== handleRef.current && a.closest(".mf-sheet") && !a.closest(".peek-keep")) handleRef.current?.focus();
      }
      sheetMemo[route] = p;
      setPos(p);
      announce(`Panel ${name} ${ANNOUNCE[p]}.`);
    },
    [route, name, announce],
  );

  const scroller = useCallback(() => {
    const s = sheetRef.current;
    return s
      ? matchMedia("(max-width:960px)").matches
        ? s.querySelector<HTMLElement>(".sheet-body")
        : s.querySelector<HTMLElement>(".panel-body")
      : null;
  }, []);

  useLayoutEffect(() => {
    document.body.classList.add("mf");
    return () => {
      document.body.classList.remove("mf");
      delete document.body.dataset.sheet;
    };
  }, []);
  useLayoutEffect(() => {
    document.body.dataset.sheet = pos;
  }, [pos]);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const body = document.body;
    const measure = () => {
      if (!matchMedia("(max-width:960px)").matches || body.dataset.sheet !== "peek") return body.style.removeProperty("--mf-peek");
      const top = sheet.getBoundingClientRect().top;
      let bottom = 0;
      sheet.querySelectorAll<HTMLElement>(".peek-keep").forEach((el) => {
        if (el.getClientRects().length) bottom = Math.max(bottom, el.getBoundingClientRect().bottom - top);
      });
      if (!bottom) return body.style.removeProperty("--mf-peek");
      const sos = document.querySelector(".fixed-sos") ? 60 : 0;
      body.style.setProperty("--mf-peek", Math.ceil(bottom + 14 + sos) + "px");
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet.querySelector(".sheet-body") || sheet);
    addEventListener("resize", measure);
    document.fonts.ready.then(measure);
    return () => {
      ro.disconnect();
      removeEventListener("resize", measure);
      body.style.removeProperty("--mf-peek");
    };
  }, [pos]);
  useEffect(() => {
    setSkipTargets({ sheetId: id, sheetLabel: skipLabel, map: !!document.getElementById("map-region") });
    return () => setSkipTargets(null);
  }, [id, skipLabel, setSkipTargets]);

  useEffect(() => {
    const posRef = { current: pos };
    sheetControl.current = {
      set: setSheet,
      scroller,
      escape: (e) => {
        if (posRef.current === "peek" || document.querySelector("dialog[open]")) return;
        const t = e.target as HTMLElement;
        if (t.matches?.("input[list]")) return;
        if (t === document.body || t.closest?.(".mf-sheet")) setSheet("peek");
      },
    };
    return () => {
      sheetControl.current = null;
    };
  }, [pos, setSheet, scroller]);

  const dragY = useRef<number | null>(null);
  const dragSuppress = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary) return;
    dragY.current = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragY.current === null) return;
    const dy = e.clientY - dragY.current;
    dragY.current = null;
    if (Math.abs(dy) >= 28) {
      dragSuppress.current = true;
      setTimeout(() => (dragSuppress.current = false), 400);
      const i = STEPS.indexOf(pos),
        n = Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)));
      if (n !== i) setSheet(STEPS[n]);
    }
  };
  const onHandleClick = () => {
    if (dragSuppress.current) {
      dragSuppress.current = false;
      return;
    }
    setSheet(STEPS[(STEPS.indexOf(pos) + 1) % 3]);
  };

  const togglePanel = () => {
    const next = !collapsed;
    panelMemo[panelKey] = next;
    setCollapsed(next);
    announce(`Panel ${name} ${next ? "disembunyikan" : "ditampilkan"}.`);
  };
  const w = (collapsed ? "Tampilkan" : "Sembunyikan") + " panel";

  return (
    <div className={`content-page mf-page ${pageClass}`.trim()}>
      <div className={`mf-stage${docked ? " mf-docked" : ""}`} ref={stageRef}>
        {before}
        <section
          className="mf-sheet"
          id={id}
          aria-label={ariaLabel}
          data-skip-label={skipLabel}
          tabIndex={-1}
          ref={sheetRef}
          onClick={(e) => {
            if (pos === "peek" && (e.target as Element).closest(".peek-tease")) setSheet("half");
          }}
        >
          <button
            type="button"
            ref={handleRef}
            className={`sheet-handle${handleAction ? " has-action" : ""}`}
            data-action="sheet-toggle"
            data-sheet-name={name}
            aria-label={sheetLabel(pos, name)}
            aria-expanded={pos !== "peek"}
            aria-controls={bodyId}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (dragY.current = null)}
            onClick={onHandleClick}
          >
            <span className="sheet-grabber" aria-hidden="true"></span>
          </button>
          <div className="sheet-body stack" id={bodyId}>
            <div
              className="mf-panel mf-panel-left"
              data-panel={panelId}
              data-panel-label={name}
              data-collapsed={collapsed ? "" : undefined}
            >
              <button
                type="button"
                className="panel-toggle"
                data-action="panel-toggle"
                data-panel-id={panelId}
                aria-expanded={!collapsed}
                aria-controls={`pb-${panelId}`}
                aria-label={w + " " + name}
                onClick={togglePanel}
              >
                <Icon name="panel-left-close" />
                <span>{collapsed ? w + " " + name : w}</span>
              </button>
              <div className="panel-body" id={`pb-${panelId}`}>
                {children}
              </div>
            </div>
          </div>
        </section>
        {map}
        {after}
      </div>
    </div>
  );
}
