"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { initialState, loadSaved, persist, type DemoState } from "@/lib/demo-state";

type Patch = Partial<DemoState> | ((s: DemoState) => Partial<DemoState>);

type Ctx = {
  state: DemoState;

  update: (patch: Patch) => void;

  stateRef: React.RefObject<DemoState>;

  hydrated: boolean;
};

const DemoStateContext = createContext<Ctx | null>(null);

export function DemoStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, ...loadSaved() }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) persist(state);
  }, [state, hydrated]);

  useLayoutEffect(() => {
    if (!hydrated) return;
    const b = document.body;
    b.classList.toggle("large-text", state.large);
    b.classList.toggle("high-contrast", state.contrast);
    b.dataset.audience = ["volunteer", "admin"].includes(state.role) ? "work" : "senior";
    b.dataset.userRole = state.role;
  }, [hydrated, state.large, state.contrast, state.role]);

  const update = useCallback((patch: Patch) => {
    setState((s) => {
      const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
      stateRef.current = next;
      return next;
    });
  }, []);

  const value = useMemo(() => ({ state, update, stateRef, hydrated }), [state, update, hydrated]);
  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoStateContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoStateProvider");
  return ctx;
}
