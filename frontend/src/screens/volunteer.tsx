"use client";

import { useEffect, useState } from "react";
import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import { Heading } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, FileInput, Icon, LinkBtn, TextField } from "@/components/ui";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import { DEMO_DESTINATION } from "@/lib/geo";
import type { LocationValue } from "@/lib/geocode";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { errorMessage } from "@/lib/api-client";
import { COMPANION_POLL_MS, companionsApi, formatClock, formatSchedule } from "@/lib/api/companions";
import { PROFILES } from "@/lib/data";
import type { CompanionInvite, CompanionInviteEvent } from "@/types/api";

export function VolunteerRequestList() {
  const { state } = useApp();

  if (!state.available)
    return (
      <div className="notice">
        Mode tersedia sedang mati. Permintaan baru tidak dikirim ke Anda dan Anda tidak tampil di daftar relawan. Aktifkan di Dashboard saat
        siap membantu.
      </div>
    );
  return (
    <ul className="list">
      {(
        [
          ["Rina", "Puskesmas Mergangsan", "Hari ini, 10:30"],
          ["Budi", "Perpustakaan Pusat", "Hari ini, 14:00"],
          ["Siti", "Kantor Administrasi", "Besok, 08:00"],
        ] as const
      ).map(([n, d, t]) => (
        <li key={n} className="list-item">
          <Avatar name={n} />
          <div>
            <strong>{n}</strong>
            <small>Ke {d}</small>
            <small>
              {t}, {PROFILES[n === "Budi" ? 2 : n === "Siti" ? 3 : 0][1]}
            </small>
          </div>
          <LinkBtn label="Lihat" route="volunteer-request" kind="sm primary" />
        </li>
      ))}
    </ul>
  );
}

/** "Undangan untuk Anda" (API_CONTRACT §12.1): direct requests waiting for this volunteer's answer. */
function InvitesSection() {
  const { toast, modal } = useApp();
  const { fallback } = useSocket();
  const invites = useApiQuery<CompanionInvite[]>(() => companionsApi.invites(), []);
  const { reload } = invites;
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(reload, fallback ? COMPANION_POLL_MS.fallback : COMPANION_POLL_MS.normal);
    return () => clearInterval(t);
  }, [reload, fallback]);
  useSocketEvent<CompanionInviteEvent>("companion:invite", (e) => {
    toast(`Undangan pendampingan baru dari ${e.requester.name.split(" ")[0]} ke ${e.destinationName}.`);
    reload();
  });

  const answer = (i: CompanionInvite, accept: boolean, reason?: string) => {
    setBusy(i.id);
    return companionsApi
      .respond(i.id, accept, reason)
      .then(() => toast(accept ? "Undangan diterima. Pendampingan terjadwal." : "Undangan ditolak. Pengguna diberi tahu."))
      .catch((e) => toast(errorMessage(e)))
      .finally(() => {
        setBusy(null);
        reload();
      });
  };

  const decline = (i: CompanionInvite) =>
    modal({
      title: "Tolak undangan",
      body: (
        <label className="field">
          <span>Alasan (opsional, akan dibaca pengguna)</span>
          <textarea name="decline-reason" maxLength={300}></textarea>
        </label>
      ),
      confirmLabel: "Tolak undangan",
      danger: true,
      onConfirm: (dialog) => {
        const reason = dialog.querySelector<HTMLTextAreaElement>("textarea")?.value.trim() ?? "";
        if (reason && reason.length < 3) {
          toast("Alasan minimal 3 huruf, atau kosongkan.");
          return false;
        }
        void answer(i, false, reason || undefined);
      },
    });

  return (
    <section className="card stack mb-[18px]" aria-labelledby="invites-title">
      <h3 id="invites-title">Undangan untuk Anda</h3>
      {invites.error && !invites.data ? (
        <>
          <div className="notice" role="alert">
            {invites.error.message}
          </div>
          <Btn label="Coba lagi" action="reload-invites" kind="sm" icon="repeat" onClick={reload} />
        </>
      ) : invites.loading && !invites.data ? (
        <>
          <div className="skeleton line" aria-hidden="true"></div>
          <p role="status">Memuat undangan…</p>
        </>
      ) : invites.data?.length ? (
        <ul className="list">
          {invites.data.map((i) => (
            <li key={i.id} className="list-item">
              <Avatar name={i.requester.name} />
              <div>
                <strong>{`${i.requester.name.split(" ")[0]} · Ke ${i.destinationName}`}</strong>
                <small>{formatSchedule(i.scheduledStart)}</small>
                <small>{`Jawab sebelum ${formatClock(i.inviteExpiresAt)}`}</small>
              </div>
              <div className="row">
                <Btn label="Terima" action="accept-invite" kind="sm primary" disabled={busy === i.id} onClick={() => void answer(i, true)} />
                <Btn label="Tolak" action="decline-invite" kind="sm" disabled={busy === i.id} onClick={() => decline(i)} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>Belum ada undangan langsung dari pengguna.</p>
      )}
    </section>
  );
}

export function DashboardScreen() {
  const { state, update, go, toast } = useApp();
  const { user } = useAuth();
  const [declined, setDeclined] = useState(false);
  return (
    <div className="content-page volunteer-dashboard">
      <Heading
        title="Dashboard Relawan"
        subtitle={"Selamat datang, " + state.name + ". Pendampingan perjalanan lansia sehari-hari."}
        back=""
        actions={<LinkBtn label="Atur wilayah" route="service-area" icon="map-pin" />}
      />
      {!state.verified ? (
        <div className="warning blue mb-[18px]">
          <Icon name="shield-alert" />
          Akun demo belum terverifikasi. Kapabilitas relawan baru aktif setelah ditinjau verifikator.{" "}
          <LinkBtn label="Lihat status" route="volunteer-pending" kind="sm" />
        </div>
      ) : null}
      <div className="urgent stack">
        {declined ? (
          <div className="notice">Anda tidak dapat merespons SOS ini. Permintaan tetap tersedia untuk relawan lain dalam simulasi.</div>
        ) : (
          <>
            <div className="row between">
              <h2>SOS AKTIF</h2>
              <Badge label="Prioritas tertinggi" kind="red" icon="siren" />
            </div>
            <div className="list-item">
              <Avatar name="Budi" />
              <div>
                <strong>Budi, 320 m dari Anda</strong>
                <small>2 menit lalu, Jl. Kolonel Sugiyono, Yogyakarta</small>
              </div>
              <div className="row">
                <Btn
                  label="Terima"
                  action="accept-sos"
                  kind="danger"
                  disabled={!state.verified}
                  onClick={() => {
                    go("sos-active");
                    toast("Respons SOS diterima dalam simulasi.");
                  }}
                />
                <Btn
                  label="Tidak bisa"
                  action="decline-sos"
                  onClick={() => {
                    toast("Status tidak tersedia tercatat dalam simulasi.");
                    setDeclined(true);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="stat-grid dashboard-stats m-[18px_0]">
        {(
          [
            ["siren", "3", "SOS Aktif", "red"],
            ["handshake", "5", "Pendampingan", "blue"],
            ["clipboard-check", "12", "Laporan baru", "yellow"],
          ] as const
        ).map(([i, n, t, c]) => (
          <div key={t} className="card stat">
            <Circle icon={i} kind={c} />
            <div>
              <strong>{n}</strong>
              <p>{t}</p>
            </div>
          </div>
        ))}
      </div>
      {user?.volunteerProfile?.canCompanion ? <InvitesSection /> : null}
      <div className="grid-2">
        <section className="card stack">
          <div className="row between">
            <h3>Permintaan pendampingan terbuka</h3>
            <LinkBtn label="Lihat semua" route="volunteer-requests" kind="sm" />
          </div>
          <VolunteerRequestList />
        </section>
        <section className="card stack">
          <h3>Pendampingan terjadwal Anda</h3>
          <div className="list-item">
            <Circle icon="calendar" />
            <div>
              <strong>Besok 09:00, Klinik Sehat Lantai 2</strong>
              <small>Budi, Memandu jalan</small>
            </div>
          </div>
          <LinkBtn label="Detail jadwal" route="volunteer-schedule" kind="full" />
          <hr className="divider" />
          <div className="row between">
            <h3>Status Anda</h3>
            <input
              className="switch"
              type="checkbox"
              data-available=""
              aria-label="Tersedia menerima permintaan"
              checked={state.available}
              onChange={(e) => {
                update({ available: e.target.checked });
                toast(
                  e.target.checked
                    ? "Anda tersedia. Permintaan baru akan dikirim ke Anda."
                    : "Anda tidak tersedia. Permintaan baru tidak dikirim ke Anda.",
                );
              }}
            />
          </div>
          <p>
            {state.available
              ? "Tersedia: Anda tampil di daftar relawan dan menerima permintaan baru."
              : "Tidak tersedia: Anda tidak tampil di daftar relawan dan tidak menerima permintaan baru. Jadwal yang sudah dikonfirmasi tetap berjalan."}
          </p>
          <p>Wilayah: {state.radius} km dari Puskesmas Mergangsan</p>
          <p>Rating 4.8, 12 pendampingan</p>
        </section>
      </div>
    </div>
  );
}

export function VolunteerRegisterScreen() {
  const { state, update, go, toast } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Daftar relawan" subtitle="Lengkapi identitas dan motivasi Anda." back="role" />
      <form
        className="card stack"
        data-form="volunteer-register"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (!String(fd.get("motivation") || "").trim()) {
            toast("Isi motivasi sebelum mendaftar.");
            return;
          }
          update({ name: String(fd.get("name") || ""), verified: false });
          go("volunteer-pending");
        }}
      >
        <TextField label="Nama lengkap" name="name" value={state.name} placeholder="Nama lengkap" required />
        <AreaField label="Motivasi menjadi relawan" name="motivation" placeholder="Ceritakan alasan Anda ingin membantu..." />
        <FileInput
          label="Unggah identitas"
          name="identity"
          accept="image/*,application/pdf"
          required
          buttonLabel="Pilih berkas"
          icon="clipboard"
          emptyText="Belum ada berkas dipilih"
          hint="Foto KTP/KTM atau PDF. Demo tidak menyimpan berkas identitas."
        />
        <label className="check">
          <input type="checkbox" name="consent" required />
          Saya memahami kode etik dan persetujuan pengguna.
        </label>
        <button type="submit" className="btn primary full">
          Ajukan verifikasi
        </button>
      </form>
    </div>
  );
}

export function VolunteerPendingScreen() {
  const { state } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Status verifikasi relawan" back="dashboard" />
      <section className="card empty">
        <Circle icon={state.verified ? "badge-check" : "hourglass"} kind={state.verified ? "green" : ""} />
        <h2>{state.verified ? "Terverifikasi" : "Menunggu verifikasi"}</h2>
        <p>
          {state.verified
            ? "Kapabilitas relawan demo sudah diaktifkan oleh verifikator."
            : "Pendaftaran Anda akan ditinjau verifikator. Izin pendampingan dan pemetaan diaktifkan oleh verifikator. Anda belum dapat menerima SOS dan menawarkan pendampingan selama status pending."}
        </p>
        <div className="notice">Perkiraan proses: 1–3 hari kerja.</div>
        <div className="row mt-[20px] justify-center">
          <LinkBtn label="Ke Dashboard" route="dashboard" kind="primary" />
          <LinkBtn label="Tinjau sebagai verifikator demo" route="volunteer-review" />
        </div>
      </section>
    </div>
  );
}

export function ServiceAreaScreen() {
  const { state, update, go, toast } = useApp();
  const [radius, setRadius] = useState(state.radius);
  const [picking, setPicking] = useState(false);
  const center: LocationValue = state.serviceCenter || {
    name: "Puskesmas Mergangsan",
    address: "Wirogunan, Yogyakarta",
    coord: DEMO_DESTINATION,
    source: "place",
  };
  if (picking)
    return (
      <LocationPicker
        title="Titik pusat wilayah"
        subtitle="Dari mana Anda biasa membantu? Wilayah layanan dihitung dari titik ini."
        initial={center}
        onPick={(v) => {
          update({ serviceCenter: v });
          setPicking(false);
        }}
        onCancel={() => setPicking(false)}
      />
    );
  const onRadius = (v: string) => setRadius(Math.max(1, Math.min(5, Number(v) || 1)));
  return (
    <MapStage
      id="area-sheet"
      ariaLabel="Wilayah layanan"
      skipLabel="Lewati ke formulir wilayah"
      name="wilayah"
      map={
        <AppMap
          filters={false}
          label="Peta wilayah layanan"
          summary={`Wilayah layanan ${radius} kilometer dari ${center.name}. Formulir wilayah layanan ada di panel wilayah.`}
          radius={radius}
          center={center.coord}
        />
      }
    >
      <div className="peek-keep peek-sub">
        <Heading title="Wilayah layanan" subtitle="Tentukan area dan waktu ketersediaan Anda." back="dashboard" />
      </div>
      <form
        className="card stack"
        data-form="service-area"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const r = Number(fd.get("radius-number"));
          if (!Number.isFinite(r) || r < 1 || r > 5) {
            toast("Radius layanan harus 1–5 km.");
            return;
          }
          update({ radius: r });
          toast("Wilayah dan ketersediaan demo tersimpan.");
          go("dashboard");
        }}
      >
        <LocationField
          id="loc-service"
          label="Titik pusat wilayah"
          value={center}
          placeholder="Pilih titik pusat"
          onOpen={() => setPicking(true)}
        />
        <label className="field">
          <span>
            Radius layanan: <output id="radius-label">{radius}</output> km
          </span>
          <input
            type="range"
            name="radius"
            min="1"
            max="5"
            step="1"
            value={radius}
            aria-label="Radius layanan dalam kilometer"
            onChange={(e) => onRadius(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Radius (padanan keyboard)</span>
          <input
            type="number"
            name="radius-number"
            value={radius}
            placeholder=""
            min="1"
            max="5"
            step="1"
            onChange={(e) => onRadius(e.target.value)}
          />
        </label>
        <div className="grid-2">
          <TextField label="Jam mulai" name="start" value="08:00" type="time" />
          <TextField label="Jam selesai" name="end" value="17:00" type="time" />
        </div>
        <div className="row">
          {["Sen", "Sel", "Rab", "Kam", "Jum"].map((t) => (
            <label key={t} className="check">
              <input type="checkbox" name="day" value={t} defaultChecked />
              {t}
            </label>
          ))}
        </div>
        <button type="submit" className="btn primary full">
          Simpan wilayah
        </button>
      </form>
    </MapStage>
  );
}

export function VolunteerRequestsScreen() {
  return (
    <div className="content-page">
      <Heading title="Permintaan pendampingan terbuka" back="dashboard" />
      <section className="card">
        <VolunteerRequestList />
      </section>
    </div>
  );
}

export function VolunteerRequestScreen() {
  const { state, go, toast } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Detail permintaan" subtitle="Pendampingan yang sesuai dengan kapabilitas Anda." back="volunteer-requests" />
      <section className="card stack">
        <div className="profile-card">
          <Avatar name="Rina Safitri" big />
          <div>
            <h2>Rina Safitri</h2>
            <p>Lansia dengan gangguan penglihatan berat</p>
          </div>
        </div>
        <ul className="list">
          <li>Tujuan: Puskesmas Mergangsan</li>
          <li>Waktu: Hari ini, 10:30</li>
          <li>Jenis: Memandu jalan</li>
          <li>Titik temu: Pintu Utama Puskesmas Mergangsan</li>
        </ul>
        <p>Butuh bantuan menyeberang jalan dan menemukan ruang sidang.</p>
        <AreaField label="Pesan penawaran Anda" name="offer-message" placeholder="Tuliskan pesan untuk pengguna..." />
        <div className="row">
          <Btn
            label="Tawarkan diri"
            action="offer-help"
            kind="primary"
            disabled={!state.verified}
            onClick={() => {
              toast("Penawaran demo terkirim. Menunggu pilihan pengguna.");
              go("dashboard");
            }}
          />
          <Btn
            label="Tidak bisa"
            action="decline-request"
            onClick={() => {
              go("volunteer-requests");
              toast("Permintaan tidak diambil.");
            }}
          />
        </div>
        {!state.verified ? (
          <div className="notice">
            Anda perlu diverifikasi sebelum menawarkan diri. <LinkBtn label="Lihat status" route="volunteer-pending" kind="sm" />
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function VolunteerScheduleScreen() {
  const { go, toast, modal } = useApp();
  const [status, setStatus] = useState("");
  return (
    <div className="content-page narrow">
      <Heading title="Pendampingan terjadwal" subtitle="Konfirmasi saat bertemu dan setelah selesai." back="dashboard" />
      <section className="card stack">
        <div className="profile-card">
          <Avatar name="Budi" big />
          <div>
            <h2>Budi</h2>
            <p>Besok 09:00, Klinik Sehat Lantai 2</p>
          </div>
        </div>
        <p>Titik temu: pintu utama GIK</p>
        <div className="row">
          <Btn
            label="Saya sudah bertemu"
            action="volunteer-checkin"
            kind="primary"
            onClick={() => {
              setStatus("Check-in relawan tercatat. Menunggu konfirmasi pengguna (simulasi).");
              toast("Check-in tercatat.");
            }}
          />
          <Btn
            label="Pendampingan selesai"
            action="volunteer-finish"
            onClick={() =>
              modal({
                title: "Konfirmasi selesai",
                body: (
                  <p>Pendampingan selesai setelah kedua pihak menyatakan selesai. Klik berikut untuk mensimulasikan konfirmasi pengguna.</p>
                ),
                confirmLabel: "Konfirmasi demo",
                onConfirm: () => {
                  go("dashboard");
                  toast("Pendampingan demo selesai.");
                },
              })
            }
          />
        </div>
        <p>Check-in dua arah: konfirmasi Anda dicatat, lalu menunggu pihak lansia.</p>
        <div id="volunteer-status" className="small">
          {status}
        </div>
      </section>
    </div>
  );
}
