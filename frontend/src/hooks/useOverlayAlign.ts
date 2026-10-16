"use client";

import { useEffect } from "react";

export function useOverlayAlign(stage: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = stage.current;
    if (!enabled || !el) return;
    let frame = 0;
    const align = () => {
      frame = 0;
      const map = el.querySelector<HTMLElement>(":scope>.map"),
        toggle = el.querySelector<HTMLElement>(".mf-panel-left .panel-toggle"),
        bar = map?.querySelector<HTMLElement>(".map-toolbar"),
        filter = bar?.querySelector<HTMLElement>(".map-filter-toggle");
      if (!map || !toggle || !bar || !filter) return;
      if (!matchMedia("(min-width:961px)").matches) {
        bar.style.removeProperty("left");
        bar.style.removeProperty("top");
        filter.style.removeProperty("min-height");
        return;
      }
      const m = map.getBoundingClientRect(),
        t = toggle.getBoundingClientRect(),
        panelEl = toggle.closest(".mf-panel")!,
        panel = panelEl.getBoundingClientRect();
      if (!t.width) return;
      const anchor = panelEl.hasAttribute("data-collapsed") ? panel : t;
      const left = panel.right - m.left + 12;
      bar.style.left = left + "px";
      bar.style.top = anchor.top - m.top + "px";
      filter.style.minHeight = anchor.height + "px";
      if (left + filter.getBoundingClientRect().width > m.width - 12) {
        bar.style.left = panel.left - m.left + "px";
        bar.style.top = panel.bottom - m.top + 12 + "px";
      }
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(align);
    };
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    const toggle = el.querySelector(".mf-panel-left .panel-toggle");
    if (toggle) ro.observe(toggle);
    const mo = new MutationObserver(queue);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-collapsed"] });
    addEventListener("resize", queue);
    document.fonts.ready.then(queue);
    queue();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      removeEventListener("resize", queue);
    };
  }, [stage, enabled]);
}
