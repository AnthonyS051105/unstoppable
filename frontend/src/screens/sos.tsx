"use client";

import { useEffect, useState } from "react";
import { AppMap } from "@/components/map/AppMap";
import { Heading } from "@/components/shared";
import { SosHoldButton } from "@/components/shell/SosHoldButton";
import { Avatar, Badge, Btn, Circle, Icon } from "@/components/ui";
import { useSocket } from "@/contexts/SocketContext";
import { useApp } from "@/hooks/useApp";
import { sosApi } from "@/lib/api/sos";
import { listCaregivers } from "@/lib/api/users";
import { sosStore, useSosState } from "@/lib/sos-state";
import type { CaregiverLink } from "@/types/api";
import type { SosResolvedBroadcast, SosResponder, SosUpdateBroadcast } from "@/types/sos";

export function SosScreen() {
  const { state, update } = useApp();
  return (
    <div className="content-page narrow">
      <Heading
        title="SOS Darurat"
        subtitle="Tekan dan tahan tombol untuk mengirim sinyal darurat ke relawan terdekat."
        back="home"
      />
      <section className="card empty">
        <Circle icon="phone" kind="red" />
        <h2>Butuh bantuan segera?</h2>
        <p>Tahan tombol SOS selama 1,5 detik. Lepaskan sebelum selesai untuk membatalkan.</p>
        <SosHoldButton />
        <p className="small mt-[15px]">Dapat digunakan dengan mouse, sentuhan, atau tahan tombol Space/Enter.</p>
        <label className="check justify-center">
          <input
            type="checkbox"
            data-no-responder=""
            checked={state.noResponder}
            onChange={(e) => update({ noResponder: e.target.checked })}
          />
          Simulasikan tidak ada penerima
        </label>
      </section>
    </div>
  );
}

export function SosActiveScreen() {
  const { update, go, toast, confirmModal } = useApp();
  const { subscribe } = useSocket();
  const sosState = useSosState();
  const [cancelling, setCancelling] = useState(false);

  // Dengarkan pembaruan darurat via WebSocket sos:update
  useEffect(() => {
    const unsub = subscribe<SosUpdateBroadcast>("sos:update", (payload) => {
      if (!sosState?.sosId || payload.sosId === sosState.sosId) {
        sosStore.updateResponders(payload.responders, payload.status);
      }
    });
    return unsub;
  }, [subscribe, sosState?.sosId]);

  // Dengarkan bila insiden selesai atau dibatalkan dari sisi lain
  useEffect(() => {
    const unsub = subscribe<SosResolvedBroadcast>("sos:resolved", (payload) => {
      if (sosState?.sosId && payload.sosId === sosState.sosId) {
        sosStore.clear();
        update({ sosActive: false });
        toast("Panggilan darurat SOS telah selesai.");
        go("home");
      }
    });
    return unsub;
  }, [subscribe, sosState?.sosId, go, toast, update]);

  // Fallback polling GET /sos/:id/status tiap 10 detik
  useEffect(() => {
    if (!sosState?.sosId) return;
    const pollStatus = async () => {
      try {
        const res = await sosApi.status(sosState.sosId);
        sosStore.updateResponders(res.responders, res.status);
      } catch (err) {
        console.warn("Polling status SOS gagal:", err);
      }
    };

    const interval = setInterval(pollStatus, 10_000);
    return () => clearInterval(interval);
  }, [sosState?.sosId]);

  const handleCancel = () => {
    confirmModal(
      "Batalkan SOS",
      "Batalkan permintaan bantuan? Relawan dan kontak darurat akan diberi tahu bahwa bantuan tidak diperlukan lagi.",
      async () => {
        setCancelling(true);
        try {
          if (sosState?.sosId) {
            await sosApi.cancel(sosState.sosId, "false_alarm");
          }
        } catch (e) {
          console.error("Gagal membatalkan SOS di server:", e);
        } finally {
          sosStore.clear();
          update({ sosActive: false });
          go("home");
          toast("Panggilan darurat SOS dibatalkan.");
          setCancelling(false);
        }
      },
    );
  };

  const responders: SosResponder[] = sosState?.responders || [];

  return (
    <div className="content-page narrow">
      <Heading title="SOS aktif" subtitle="Permintaan bantuan darurat sedang diproses." back="sos" />
      <section className="card stack">
        <div className="warning red">
          <Icon name="siren" />
          {sosState?.status === "responded" || responders.length > 0
            ? "Relawan terhubung dan sedang menuju lokasi Anda."
            : "Bantuan diminta. Menghubungi relawan terdekat..."}
        </div>

        <h2>Responden di sekitar Anda</h2>
        <ul className="list">
          {responders.length > 0 ? (
            responders.map((r, i) => {
              const isMoving = r.status === "en_route";
              const isArrived = r.status === "arrived";
              const label = isArrived ? "Tiba di Lokasi" : isMoving ? "Menuju Anda" : "Terhubung";
              const kind = isArrived ? "blue" : isMoving ? "green" : "yellow";
              return (
                <li key={r.id || i} className="list-item">
                  <Avatar name={r.name || "Relawan"} />
                  <div>
                    <strong>{r.name || "Relawan"}</strong>
                    <small>
                      {r.distanceM !== null ? `${r.distanceM} m dari lokasi Anda` : "Relawan terdekat"}
                      {r.etaMin !== null ? `, ETA ${r.etaMin} menit` : ""}
                    </small>
                  </div>
                  <Badge label={label} kind={kind} />
                </li>
              );
            })
          ) : (
            <li className="list-item">
              <Circle icon="phone" kind="red" />
              <div>
                <strong>Mencari relawan terdekat...</strong>
                <small>
                  {sosState?.notifiedVolunteers
                    ? `${sosState.notifiedVolunteers} relawan terdekat telah diberi notifikasi.`
                    : "Sinyal darurat disiarkan ke wilayah sekitar Anda."}
                </small>
              </div>
              <Badge label="Menunggu respons" kind="yellow" />
            </li>
          )}
        </ul>

        <AppMap filters={false} />

        <Btn
          label={cancelling ? "Membatalkan..." : "Batalkan SOS"}
          action="cancel-sos"
          kind="danger full"
          disabled={cancelling}
          onClick={handleCancel}
        />
      </section>
    </div>
  );
}

export function SosEmptyScreen() {
  const { state, update, go } = useApp();
  const [caregiverPhone, setCaregiverPhone] = useState<string | null>(null);
  const [caregiverName, setCaregiverName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listCaregivers()
      .then((links: CaregiverLink[]) => {
        if (!alive) return;
        const first = links.find((l) => l.caregiver?.phoneNumber) || links[0];
        if (first?.caregiver) {
          setCaregiverPhone(first.caregiver.phoneNumber);
          setCaregiverName(first.caregiver.name || "Keluarga");
        }
      })
      .catch(() => {
        // Fallback jika offline
      });

    return () => {
      alive = false;
    };
  }, []);

  const phone = caregiverPhone || state.contactPhone || null;
  const name = caregiverName || state.contactName || "Kontak Darurat Keluarga";

  return (
    <div className="content-page narrow">
      <Heading title="Belum ada penerima" subtitle="SOS tidak boleh gagal tanpa penjelasan." back="sos" />
      <section className="card empty">
        <Circle icon="phone" kind="red" />
        <h2>Belum ada relawan yang bisa dihubungi di sekitar Anda.</h2>
        <p>Gunakan tombol cepat 112 atau hubungi kontak darurat keluarga di bawah ini.</p>

        <a className="btn danger full min-h-[64px] text-[1.45rem]" href="tel:112">
          <Icon name="phone" />
          Hubungi 112
        </a>

        {phone ? (
          <a
            className="btn primary full min-h-[58px] text-[1.2rem] mt-[12px]"
            href={`tel:${phone.replace(/\s+/g, "")}`}
          >
            <Icon name="phone" />
            Hubungi {name} ({phone})
          </a>
        ) : (
          <div className="card notice mt-[12px] text-center">
            <p className="small">Belum ada nomor kontak darurat keluarga yang terhubung.</p>
            <Btn
              label="Tautkan Kontak Keluarga"
              action="link-caregiver"
              kind="outline sm"
              onClick={() => go("caregiver-link")}
            />
          </div>
        )}

        <p className="small mt-[13px]">Menekan tombol akan membuka aplikasi telepon perangkat Anda.</p>

        <Btn
          label="Coba lagi"
          action="retry-sos"
          kind="secondary full mt-[8px]"
          onClick={() => {
            update({ noResponder: false, sosActive: false });
            go("sos");
          }}
        />
      </section>
    </div>
  );
}
