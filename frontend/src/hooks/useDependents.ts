"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "@/contexts/SocketContext";
import { useApp } from "@/hooks/useApp";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { errorMessage } from "@/lib/api-client";
import { listDependents } from "@/lib/api/users";
import type { Dependent, SessionEnded, SessionOverdue, SessionStalled, SessionStarted } from "@/types/api";

// Family dashboard state (FE-GUIDE-F5-F9 §3.1). Trip status always comes from the server:
// GET /users/me/dependents plus the session:* events, never from localStorage.

export type TripStatus = "idle" | "active" | "paused" | "overdue" | "stalled";
export type FamilyEvent = { label: string; time: string };

// REST fallback while the socket is down (SocketContext `fallback`, §15.4).
const FALLBACK_POLL_MS = 30_000;
// pausedAt has no socket event for the family (§15.3), so refresh slowly while a trip is under way.
const TRIP_POLL_MS = 60_000;

/** HH.MM in WIB, e.g. "09.24". */
export const wibTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "";

export const firstName = (name: string) => name.split(" ")[0] || name;

// Events received in this tab, kept while moving between /caregiver and /monitor.
// A display log only: trip status itself is re-derived from the API on every load.
let eventLog: FamilyEvent[] = [];

function endedLabel(e: SessionEnded, name: string) {
  const to = e.destinationName ?? "tujuan";
  if (e.status === "sos_triggered") return `${name} menekan SOS dalam perjalanan ke ${to}`;
  if (e.endedReason === "arrived_auto") return `${name} tiba di ${to}`;
  if (e.endedReason === "timeout") return `Perjalanan ${name} ke ${to} diakhiri otomatis`;
  if (e.endedReason === "replaced") return null; // session:started for the new trip follows
  return `${name} menyelesaikan perjalanan ke ${to}`;
}

export function useDependents() {
  const { isConnected, fallback } = useSocket();
  const { announce, speak } = useApp();
  const [list, setList] = useState<Dependent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keyed by sessionId: the overdue/stalled payloads always carry it (`user` is not sent by every emitter).
  const [flags, setFlags] = useState<Record<string, { overdue?: boolean; stalled?: boolean }>>({});
  const [events, setEvents] = useState<FamilyEvent[]>(eventLog);
  const listRef = useRef(list);

  const load = useCallback(async () => {
    try {
      const data = await listDependents();
      listRef.current = data;
      setList(data);
      setError(null);
      // session:stalled is only sent for a paused session; once the app is active again it no longer applies.
      setFlags((f) => {
        const next = { ...f };
        for (const d of data) {
          const s = d.activeSession;
          if (s && !s.pausedAt && next[s.id]?.stalled) next[s.id] = { ...next[s.id], stalled: false };
        }
        return next;
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // On mount, and again whenever the socket connects or drops: events may have been missed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after the request resolves
    void load();
  }, [isConnected, load]);

  const hasTrip = !!list?.some((d) => d.activeSession && d.locationSharingMode !== "off");
  useEffect(() => {
    const ms = fallback ? FALLBACK_POLL_MS : hasTrip ? TRIP_POLL_MS : 0;
    if (!ms) return;
    const id = setInterval(() => void load(), ms);
    return () => clearInterval(id);
  }, [fallback, hasTrip, load]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const nameOf = (sessionId: string, user?: { name: string }) =>
    firstName(user?.name ?? listRef.current?.find((d) => d.activeSession?.id === sessionId)?.name ?? "Anggota keluarga");

  const log = (label: string) => {
    eventLog = [{ label, time: wibTime(new Date().toISOString()) }, ...eventLog].slice(0, 20);
    setEvents(eventLog);
  };

  useSocketEvent<SessionStarted>("session:started", (e) => {
    const label = `${firstName(e.user.name)} berangkat menuju ${e.destinationName ?? "tujuan"}`;
    log(label);
    announce(label + ".");
    void load();
  });

  useSocketEvent<SessionEnded>("session:ended", (e) => {
    setFlags((f) => {
      const next = { ...f };
      delete next[e.sessionId];
      return next;
    });
    const label = endedLabel(e, nameOf(e.sessionId, e.user));
    if (label) {
      log(label);
      announce(label + ".");
    }
    void load();
  });

  useSocketEvent<SessionOverdue>("session:overdue", (e) => {
    setFlags((f) => ({ ...f, [e.sessionId]: { ...f[e.sessionId], overdue: true } }));
    const label = `${nameOf(e.sessionId, e.user)} belum tiba di ${e.destinationName ?? "tujuan"}, lewat dari perkiraan`;
    log(label);
    announce(label + ".");
  });

  useSocketEvent<SessionStalled>("session:stalled", (e) => {
    setFlags((f) => ({ ...f, [e.sessionId]: { ...f[e.sessionId], stalled: true } }));
    const name = nameOf(e.sessionId, e.user);
    log(`${name} belum menjawab cek keadaan`);
    // The status card itself is role="alert" (assertive); speak it too for families who listen.
    speak(`${name} belum menjawab cek keadaan. Anda bisa menelepon atau meminta bantuan relawan.`);
    void load();
  });

  const statusOf = (d: Dependent): TripStatus => {
    const s = d.activeSession;
    // Mode "off": the family receives no trip news at all (§3, UI_UX_FLOW §7).
    if (!s || d.locationSharingMode === "off") return "idle";
    const f = flags[s.id];
    if (f?.stalled) return "stalled";
    if (f?.overdue) return "overdue";
    return s.pausedAt ? "paused" : "active";
  };

  return { list, error, loading: list === null && !error, reload: load, statusOf, events };
}
