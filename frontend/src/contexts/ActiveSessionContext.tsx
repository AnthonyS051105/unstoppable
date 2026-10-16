"use client";

// Travel session state (frontend/CLAUDE.md §3). For now it only remembers the session that just
// ended, so /feedback knows what to rate; wave I3 adds the active session, location and Wake Lock.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ActiveSessionValue = {
  /** Id of the last session the server reported as ended; set when the trip finishes (I3). */
  lastEndedSessionId: string | null;
  setLastEndedSessionId: (id: string | null) => void;
};

const Ctx = createContext<ActiveSessionValue | null>(null);

// Per tab, so a refresh on /feedback keeps the session but another tab or a later visit does not.
const KEY = "unstoppable-last-session-v1";

export function ActiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [lastEndedSessionId, setId] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
      setId(sessionStorage.getItem(KEY));
    } catch {}
  }, []);

  const setLastEndedSessionId = useCallback((id: string | null) => {
    setId(id);
    try {
      if (id) sessionStorage.setItem(KEY, id);
      else sessionStorage.removeItem(KEY);
    } catch {}
  }, []);

  const value = useMemo(() => ({ lastEndedSessionId, setLastEndedSessionId }), [lastEndedSessionId, setLastEndedSessionId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveSession must be used inside ActiveSessionProvider");
  return v;
}
