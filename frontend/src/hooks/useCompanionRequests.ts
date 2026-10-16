"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/contexts/SocketContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { COMPANION_POLL_MS, companionsApi } from "@/lib/api/companions";
import type { CompanionInviteAnswerEvent, CompanionRequest } from "@/types/api";

/**
 * The user's own companion requests, always from GET /companions/requests (API_CONTRACT §12).
 * Socket events only trigger a reload and an announcement; polling is the fallback (§15.4).
 */
export function useCompanionRequests() {
  const { announce } = useApp();
  const { fallback } = useSocket();
  const query = useApiQuery<CompanionRequest[]>(() => companionsApi.mine(), []);
  const { reload } = query;
  // The decline reason is only carried by the socket event (GET /companions/requests does not return it).
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setInterval(reload, fallback ? COMPANION_POLL_MS.fallback : COMPANION_POLL_MS.normal);
    return () => clearInterval(t);
  }, [reload, fallback]);

  useSocketEvent<CompanionInviteAnswerEvent>("companion:invite-declined", (e) => {
    announce(`${e.volunteer.name} tidak dapat menerima permintaan Anda.`);
    if (e.reason) setReasons((r) => ({ ...r, [e.requestId]: e.reason! }));
    reload();
  });
  useSocketEvent<{ requestId: string }>("companion:invite-expired", () => {
    announce("Relawan yang Anda undang belum menjawab sampai batas waktu.");
    reload();
  });
  useSocketEvent<{ volunteer?: { name: string } }>("companion:confirmed", (e) => {
    announce(e.volunteer ? `Pendampingan dikonfirmasi bersama ${e.volunteer.name}.` : "Pendampingan dikonfirmasi.");
    reload();
  });
  useSocketEvent<{ requestId: string }>("companion:offer", () => {
    announce("Ada relawan yang menawarkan diri.");
    reload();
  });

  return { ...query, reasons };
}
