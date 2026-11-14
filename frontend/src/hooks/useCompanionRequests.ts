"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { COMPANION_POLL_MS, companionsApi } from "@/lib/api/companions";
import type { CompanionInviteAnswerEvent } from "@/types/api";

/**
 * The user's own companion requests, always from GET /companions/requests (API_CONTRACT §12).
 * Socket events only trigger a reload and an announcement; polling is the fallback (§15.4).
 */
export function useCompanionRequests() {
  const { announce } = useApp();
  const { fallback } = useSocket();
  const { user } = useAuth();
  const query = useApiQuery(user ? async () => ({ ownerId: user.id, rows: await companionsApi.mine() }) : null, [user?.id]);
  const { reload } = query;
  // The decline reason is only carried by the socket event (GET /companions/requests does not return it).
  const [reasonState, setReasons] = useState<{ ownerId: string; values: Record<string, string> } | null>(null);

  useEffect(() => {
    const t = setInterval(reload, fallback ? COMPANION_POLL_MS.fallback : COMPANION_POLL_MS.normal);
    return () => clearInterval(t);
  }, [reload, fallback]);

  useSocketEvent<CompanionInviteAnswerEvent>("companion:invite-declined", (e) => {
    announce(`${e.volunteer.name} tidak dapat menerima permintaan Anda.`);
    if (e.reason && user) setReasons((r) => ({ ownerId: user.id, values: { ...(r?.ownerId === user.id ? r.values : {}), [e.requestId]: e.reason! } }));
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

  return { ...query, data: query.data?.ownerId === user?.id ? query.data?.rows : undefined, reasons: reasonState?.ownerId === user?.id ? reasonState?.values ?? {} : {} };
}
