"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Btn, Icon } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { errorMessage } from "@/lib/api-client";
import { sosApi } from "@/lib/api/sos";
import { reportCategoryLabel } from "@/lib/api/communities";
import type { SosResolvedBroadcast } from "@/types/sos";

type FamilySos = { sosId: string; user: { id: string; name: string | null }; coordinates: [number, number] };
type NearbyReport = { reportId: string; category: string; severity: string };
const IncidentMap = dynamic(() => import("@/components/map/RequestPointsMap"), { ssr: false });

/** Live alerts are separate from the durable notification inbox; delivery requires an open connection. */
export function LiveDomainAlerts() {
  const { state, toast, speak, modal } = useApp();
  const [incidents, setIncidents] = useState<FamilySos[]>([]);
  useSocketEvent<FamilySos>("sos:triggered", event => {
    if (state.role !== "caregiver" || !event?.sosId || !event.user?.id) return;
    setIncidents(previous => [event, ...previous.filter(i => i.sosId !== event.sosId)].slice(0, 3));
    const text = `SOS dari ${event.user.name || "anggota keluarga"}. Permintaan bantuan telah diteruskan ke jaringan relawan.`;
    toast(text);
    if (state.voice) speak(text);
  });
  useSocketEvent<SosResolvedBroadcast>("sos:resolved", event => {
    if (state.role !== "caregiver") return;
    setIncidents(previous => previous.filter(i => i.sosId !== event.sosId));
    toast("SOS anggota keluarga sudah ditutup.");
  });
  useSocketEvent<NearbyReport>("report:nearby", event => {
    if (!event?.reportId) return;
    const text = `Laporan hambatan di sekitar perjalanan: ${reportCategoryLabel(event.category)}. Periksa kondisi jalur dan hitung ulang rute bila perlu.`;
    toast(text);
    if (state.voice && state.activeTrip) speak(text);
  });

  const inspect = async (incident: FamilySos) => {
    try {
      // The event is a signal, not permission: the server rechecks the current family sharing rules.
      const status = await sosApi.status(incident.sosId);
      const name = incident.user.name || "anggota keluarga";
      modal({ title: `SOS dari ${name}`, confirmLabel: "Tutup", hideCancel: true, body: <>
        <p>Status dari server: {status.status === "active" ? "menunggu respons relawan" : status.status === "responded" ? "sudah direspons relawan" : "sudah ditutup"}.</p>
        <IncidentMap destination={incident.coordinates} label={`Lokasi SOS ${name}`} />
        <p>Lokasi ini adalah titik ketika SOS dikirim.</p>
        {status.responders.length ? <ul>{status.responders.map(r => <li key={r.id}>{r.name || "Relawan"}: {r.status === "en_route" ? "menuju lokasi" : r.status === "arrived" ? "sudah tiba" : r.status === "accepted" ? "menerima permintaan" : "tidak dapat membantu"}</li>)}</ul> : null}
      </> });
    } catch (error) { toast(errorMessage(error)); }
  };
  return state.role === "caregiver" ? incidents.map(incident => <aside key={incident.sosId} className="warning red row mb-[12px]" role="alert">
    <Icon name="triangle-alert" />
    <span className="fit"><strong>SOS dari {incident.user.name || "anggota keluarga"}</strong></span>
    <Btn label="Lihat lokasi SOS" kind="sm" onClick={() => void inspect(incident)} />
    <Btn icon="x" kind="sm" aria-label="Tutup pemberitahuan SOS" onClick={() => setIncidents(previous => previous.filter(i => i.sosId !== incident.sosId))} />
  </aside>) : null;
}
