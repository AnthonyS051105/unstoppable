"use client";

// Travel session state (frontend/CLAUDE.md §3, SDD §10): the active session, the one that just
// ended (so /feedback knows what to rate), and the client side of the session lifecycle:
// Wake Lock, pause/resume on visibility, the "Sudah sampai?" check and server-ended sessions.
// Wave I3 calls setSession after POST /sessions/start.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useApp } from "@/hooks/useApp";
import { useSessionVisibility } from "@/hooks/useSessionVisibility";
import { useWakeLock } from "@/hooks/useWakeLock";
import { ApiError, errorMessage } from "@/lib/api-client";
import { sessionsApi } from "@/lib/api/sessions";
import type { ArrivalCheck, SessionEnded, SessionEndedReason, SessionStatus, WellbeingStatus } from "@/types/api";

export type ActiveSession = { id: string; userId: string; destinationName: string };

type ActiveSessionValue = {
  /** The signed-in user's active travel session, as last confirmed by the server. */
  session: ActiveSession | null;
  setSession: (s: ActiveSession | null) => void;
  /** POST /sessions/:id/end, then the same flow as any other completed session. Resolves true once it is over. */
  endSession: () => Promise<boolean>;
  /** Id of the last session the server reported as ended; set when the trip finishes. */
  lastEndedSessionId: string | null;
  setLastEndedSessionId: (id: string | null) => void;
  /** POST /sessions/:id/wellbeing for a notification action; throws ApiError so the caller can offer another way. */
  answerWellbeing: (id: string, status: WellbeingStatus) => Promise<void>;
};

const Ctx = createContext<ActiveSessionValue | null>(null);

// Per tab, so a refresh on /feedback keeps the session but another tab or a later visit does not.
const KEY = "unstoppable-last-session-v1";
// Per device, so the Beranda banner survives closing the browser; re-checked with the server on load.
const ACTIVE_KEY = "unstoppable-active-session-v1";

const ENDED_TEXT: Partial<Record<SessionEndedReason, string>> = {
  timeout: "Perjalanan diakhiri otomatis karena sudah berjalan terlalu lama.",
  replaced: "Perjalanan ini digantikan oleh perjalanan baru.",
  user: "Perjalanan dihentikan.",
};

function readActive(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}

export function ActiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [lastEndedSessionId, setId] = useState<string | null>(null);
  const [session, setSessionState] = useState<ActiveSession | null>(null);
  const { user, status } = useAuth();
  const { subscribe } = useSocket();
  const { state, update, toast, announce, speak, modal, closeModal, finishTrip } = useApp();
  const sessionRef = useRef(session);
  const handled = useRef(new Set<string>());
  const arrivalOpen = useRef<string | null>(null);
  /** Session the user just answered "Ya, sudah sampai" for; its session:ended may beat the HTTP reply. */
  const arriving = useRef<string | null>(null);

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

  const setSession = useCallback((s: ActiveSession | null) => {
    sessionRef.current = s;
    setSessionState(s);
    try {
      if (s) localStorage.setItem(ACTIVE_KEY, JSON.stringify(s));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }, []);

  // Restore the stored session once signed in, keeping it only if the server says it is still active.
  // Signed out → forget it, so the next person on this device never sees it.
  useEffect(() => {
    if (status === "anonymous" || status === "signed-out") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the auth status; localStorage is only readable after hydration
      setSession(null);
      return;
    }
    if (status !== "authenticated" || !user) return;
    const stored = readActive();
    if (!stored) return;
    if (stored.userId !== user.id) {
      setSession(null);
      return;
    }
    setSession(stored);
    let cancelled = false;
    sessionsApi
      .summary(stored.id)
      .then((s) => {
        if (cancelled) return;
        if (s.status === "active") setSession({ ...stored, destinationName: s.destinationName || stored.destinationName });
        else setSession(null);
      })
      .catch((e) => {
        // Offline: keep the banner (the trip may well still be running). Gone or not ours: drop it.
        if (!cancelled && e instanceof ApiError && (e.status === 404 || e.status === 403)) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status, user, setSession]);

  /**
   * One place for every way a session ends: the "Sudah sampai" answer, the Akhiri button, or a
   * server event. `arrived` = the user is at the destination (answer "Ya" or arrived_auto) → /arrived.
   */
  const onEnded = useCallback(
    (id: string, endStatus: SessionStatus, reason: SessionEndedReason | null, arrived = reason === "arrived_auto") => {
      if (handled.current.has(id)) return;
      handled.current.add(id);
      if (arrivalOpen.current === id) {
        arrivalOpen.current = null;
        closeModal();
      }
      if (sessionRef.current?.id === id) setSession(null);
      // Only a completed session can be rated (§13 feedback).
      if (endStatus === "completed") setLastEndedSessionId(id);
      if (endStatus === "completed" && (arrived || arriving.current === id)) {
        finishTrip();
        if (reason === "arrived_auto") announce("Perjalanan diakhiri otomatis karena Anda sudah di tujuan.");
        return;
      }
      update({ activeTrip: false });
      const text = reason ? ENDED_TEXT[reason] : undefined;
      if (text) toast(text);
    },
    [closeModal, setSession, setLastEndedSessionId, finishTrip, announce, update, toast],
  );

  const askArrival = useCallback(
    ({ sessionId, destinationName }: ArrivalCheck) => {
      // The server only asks about this user's active session, even one this tab did not start.
      if (!sessionRef.current || sessionRef.current.id !== sessionId) {
        if (user) setSession({ id: sessionId, userId: user.id, destinationName });
      }
      const question = `Sudah sampai di ${destinationName}?`;
      speak(question);
      navigator.vibrate?.([200, 100, 200]);
      arrivalOpen.current = sessionId;
      modal({
        title: question,
        body: <p>Jika tidak dijawab dalam 2 menit dan Anda masih di tujuan, perjalanan diakhiri otomatis.</p>,
        confirmLabel: "Ya, sudah sampai",
        cancelLabel: "Belum",
        focusConfirm: true,
        onConfirm: () => {
          arrivalOpen.current = null;
          arriving.current = sessionId;
          sessionsApi
            .arrival(sessionId, true)
            .then((r) => onEnded(sessionId, r.status, r.endedReason ?? "user", true))
            .catch((e) => {
              arriving.current = null;
              toast(`${errorMessage(e)} Coba lagi lewat tombol Akhiri di Beranda.`);
            });
        },
        onCancel: () => {
          arrivalOpen.current = null;
          announce("Baik, panduan dilanjutkan.");
          sessionsApi.arrival(sessionId, false).catch((e) => toast(errorMessage(e)));
        },
      });
    },
    [user, setSession, speak, modal, onEnded, toast, announce],
  );

  useEffect(() => subscribe<ArrivalCheck>("session:arrival-check", askArrival), [subscribe, askArrival]);
  useEffect(
    () =>
      subscribe<SessionEnded>("session:ended", (e) => {
        if (sessionRef.current?.id === e.sessionId || arrivalOpen.current === e.sessionId) onEnded(e.sessionId, e.status, e.endedReason);
      }),
    [subscribe, onEnded],
  );

  const endSession = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return true;
    try {
      await sessionsApi.end(s.id);
    } catch (e) {
      // 404: the server already ended it (timeout, another device), so the banner was stale.
      if (e instanceof ApiError && e.status === 404) {
        handled.current.add(s.id);
        setSession(null);
        update({ activeTrip: false });
        toast("Perjalanan ini sudah berakhir.");
        return true;
      }
      toast(errorMessage(e));
      return false;
    }
    onEnded(s.id, "completed", "user");
    return true;
  }, [onEnded, setSession, update, toast]);

  const answerWellbeing = useCallback(
    async (id: string, answer: WellbeingStatus) => {
      if (answer === "arrived") arriving.current = id;
      try {
        await sessionsApi.wellbeing(id, answer);
      } catch (e) {
        if (arriving.current === id) arriving.current = null;
        throw e;
      }
      // arrived → completed (the same flow as "Ya, sudah sampai"); help → the server ended it as sos_triggered.
      if (answer === "arrived") onEnded(id, "completed", "user", true);
      else if (answer === "help") onEnded(id, "sos_triggered", "sos");
    },
    [onEnded],
  );

  useWakeLock(!!session || state.activeTrip);
  useSessionVisibility(session?.id ?? null);

  const value = useMemo(
    () => ({ session, setSession, endSession, lastEndedSessionId, setLastEndedSessionId, answerWellbeing }),
    [session, setSession, endSession, lastEndedSessionId, setLastEndedSessionId, answerWellbeing],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveSession must be used inside ActiveSessionProvider");
  return v;
}
