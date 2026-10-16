"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRoute } from "@/components/shared";
import { useApp } from "@/hooks/useApp";
import { cancelActiveHold } from "@/lib/sos-hold";

export function RouteSync() {
  const route = useRoute();
  const { update, stateRef } = useApp();
  const first = useRef(true);

  useLayoutEffect(() => {
    document.body.dataset.route = route;
  }, [route]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    cancelActiveHold();
    window.scrollTo(0, 0);
    const h = document.querySelector<HTMLElement>("main h1");
    if (h) {
      h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
      if (document.activeElement !== h) document.querySelector<HTMLElement>(".mf-sheet")?.focus({ preventScroll: true });
    }
  }, [route]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href^="/"]');
      if (!a) return;
      const s = stateRef.current;
      cancelActiveHold();
      const patch: Record<string, unknown> = {};
      if (s.menu) patch.menu = false;
      if (Object.keys(patch).length) update(patch);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [stateRef, update]);

  return null;
}
