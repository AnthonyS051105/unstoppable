"use client";

import { useEffect, useState } from "react";
import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import { Heading } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, Icon, LinkBtn, TextField } from "@/components/ui";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import { coordText } from "@/lib/geocode";
import type { LocationValue } from "@/lib/geocode";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { errorMessage } from "@/lib/api-client";
import { COMPANION_POLL_MS, companionsApi, formatClock, formatSchedule } from "@/lib/api/companions";
import { PROFILES } from "@/lib/data";
import { volunteersApi } from "@/lib/api/volunteers";
import type { CompanionInvite, CompanionInviteEvent } from "@/types/api";


function useVolunteerProfile() {
  const { user } = useAuth();
  const q = useApiQuery(user ? async () => ({ ownerId: user.id, profile: await volunteersApi.profile() }) : null, [user?.id]);
  return { ...q, data: q.data?.ownerId === user?.id ? q.data?.profile : undefined };
}

function QueryState({ loading, error, retry }: { loading: boolean; error: { message: string } | null; retry: () => void }) {
  if (error) return <div className="stack"><p role="alert" className="notice">{error.message}</p><Btn label="Coba lagi" onClick={retry} /></div>;
  if (loading) return <p role="status">Memuat data relawan…</p>;
  return null;
}

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
  const { state, go, toast } = useApp();
  const { user, setUser } = useAuth();
  const profile = useVolunteerProfile();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  return (
    <div className="content-page volunteer-dashboard">
      <Heading
        title="Dashboard Relawan"
        subtitle={"Selamat datang, " + state.name + ". Pendampingan perjalanan lansia sehari-hari."}
        back=""
        actions={<LinkBtn label="Atur wilayah" route="service-area" icon="map-pin" />}
      />
      {profile.data?.verificationStatus !== "verified" ? (
        <div className="warning blue mb-[18px]">
          <Icon name="shield-alert" />
          Izin relawan mengikuti status server dan baru aktif setelah ditinjau verifikator.{" "}
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
            ["handshake", profile.data ? String(profile.data.totalHelps) : "—", "Pendampingan selesai", "blue"],
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
          <p>Daftar jadwal relawan belum tersedia dari server. Pendampingan terkonfirmasi tetap berjalan saat status tidak tersedia.</p>
          <LinkBtn label="Detail jadwal" route="volunteer-schedule" kind="full" />
          <hr className="divider" />
          <div className="row between">
            <h3>Status Anda</h3>
            <input
              className="switch"
              type="checkbox"
              data-available=""
              aria-label="Tersedia menerima permintaan"
              checked={profile.data?.isActive ?? false}
              disabled={!profile.data || !!profile.error || profile.loading || saving}
              onChange={async (e) => {
                if (!user || saving) return;
                const active = e.target.checked;
                setSaving(true);
                setSaveError(null);
                try {
                  const saved = await volunteersApi.setActive(active);
                  setUser({ ...user, volunteerProfile: saved });
                  profile.reload();
                  toast(saved.isActive ? "Status tersedia tersimpan di server." : "Status tidak tersedia tersimpan di server.");
                } catch (error) {
                  setSaveError(errorMessage(error));
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
          <QueryState loading={profile.loading && profile.data === undefined} error={profile.error} retry={profile.reload} />
          {saveError ? <p role="alert">{saveError}</p> : null}
          {saving ? <p role="status">Menyimpan status…</p> : null}
          {profile.data ? <>
            <p>{profile.data.isActive
              ? "Status tersedia aktif di server. Permintaan baru mengikuti izin pendampingan, wilayah, dan jadwal Anda."
              : "Tidak tersedia: permintaan baru tidak ditampilkan kepada Anda. Jadwal yang sudah dikonfirmasi tetap berjalan."}</p>
            <p>Rating {profile.data.ratingAvg.toFixed(1)}, {profile.data.totalHelps} pendampingan selesai</p>
          </> : !profile.loading && !profile.error ? <p>Anda belum mendaftar sebagai relawan. <LinkBtn label="Daftar relawan" route="volunteer-register" kind="sm" /></p> : null}
          <LinkBtn label="Kelola wilayah dan jadwal" route="service-area" kind="sm" />
        </section>
      </div>
    </div>
  );
}

export function VolunteerRegisterScreen() {
  const { user } = useAuth();
  return (
    <div className="content-page narrow">
      <Heading title="Daftar relawan" subtitle="Lengkapi identitas dan motivasi Anda." back="role" />
      <form className="card stack" data-form="volunteer-register" onSubmit={(e) => e.preventDefault()}>
        <div className="notice" role="status">Pendaftaran belum dapat dikirim karena unggah identitas privat belum tersedia. Tidak ada berkas atau permohonan yang disimpan dari formulir ini.</div>
        <fieldset disabled className="stack">
          <TextField label="Nama lengkap" name="name" value={user?.name ?? ""} inputProps={{ readOnly: true }} />
          <AreaField label="Motivasi menjadi relawan" name="motivation" placeholder="Ceritakan alasan Anda ingin membantu..." />
          <label className="check"><input type="checkbox" name="consent" />Saya memahami kode etik dan persetujuan pengguna.</label>
          <button type="submit" className="btn primary full" disabled>Ajukan verifikasi</button>
        </fieldset>
        <LinkBtn label="Lihat status pendaftaran" route="volunteer-pending" />
      </form>
    </div>
  );
}

export function VolunteerPendingScreen() {
  const profile = useVolunteerProfile();
  const { refreshUser } = useAuth();
  const { toast } = useApp();
  const verified = profile.data?.verificationStatus === "verified";
  return (
    <div className="content-page narrow">
      <Heading title="Status verifikasi relawan" back="dashboard" />
      <section className="card empty">
        <QueryState loading={profile.loading && profile.data === undefined} error={profile.error} retry={profile.reload} />
        {profile.data && !profile.error ? <>
          <Circle icon={verified ? "badge-check" : "hourglass"} kind={verified ? "green" : ""} />
          <h2>{verified ? "Terverifikasi" : profile.data.verificationStatus === "rejected" ? "Pendaftaran ditolak" : "Menunggu verifikasi"}</h2>
          <p>Status berasal dari server. Izin pendampingan dan pemetaan hanya dapat diberikan oleh admin.</p>
          <p>Pendampingan: {profile.data.canCompanion ? "diizinkan" : "belum diizinkan"}. Pemetaan: {profile.data.canMapData ? "diizinkan" : "belum diizinkan"}.</p>
        </> : !profile.loading && !profile.error ? <><h2>Belum terdaftar</h2><p>Belum ada permohonan relawan untuk akun Anda.</p><LinkBtn label="Daftar relawan" route="volunteer-register" /></> : null}
        <div className="row mt-[20px] justify-center">
          <LinkBtn label="Ke Dashboard" route="dashboard" kind="primary" />
          <Btn label="Perbarui status" disabled={profile.loading} onClick={() => { profile.reload(); void refreshUser().catch((e) => toast(errorMessage(e))); }} />
        </div>
      </section>
    </div>
  );
}

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function ServiceAreaScreen() {
  const { toast, confirmModal } = useApp();
  const { user } = useAuth();
  const slots = useApiQuery(user ? async () => ({ ownerId: user.id, rows: await volunteersApi.availability() }) : null, [user?.id]);
  const rows = slots.data?.ownerId === user?.id ? slots.data?.rows : undefined;
  const [radius, setRadius] = useState(3);
  const [center, setCenter] = useState<LocationValue | null>(null);
  const [picking, setPicking] = useState(false);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const closePicker = () => {
    setPicking(false);
    setTimeout(() => document.getElementById("loc-service")?.focus(), 0);
  };
  if (picking)
    return <LocationPicker title="Titik pusat wilayah" subtitle="Dari mana Anda biasa membantu? Wilayah layanan dihitung dari titik ini."
      initial={center} onPick={(v) => { setCenter(v); closePicker(); }} onCancel={closePicker} />;

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setFailed(false);
    setMessage("");
    if (!center || !days.length || !startTime || !endTime || startTime >= endTime || !Number.isFinite(radius) || radius < 1 || radius > 5) {
      setFailed(true);
      setMessage("Pilih pusat wilayah, minimal satu hari, radius 1–5 km, serta jam mulai sebelum jam selesai (WIB).");
      if (!center) document.getElementById("loc-service")?.focus();
      return;
    }
    if (!rows || slots.error || slots.loading) return;
    const missing = days.filter((day) => !rows.some((s) => s.isActive && s.dayOfWeek === day && s.startTime === startTime && s.endTime === endTime && s.radiusMeters === radius * 1000 && s.centerPoint.coordinates.every((n, i) => n === center.coord[i])));
    if (!missing.length) { setMessage("Semua jadwal tersebut sudah tersimpan di server."); return; }
    setBusy(true);
    let saved = 0;
    try {
      // The contract has no atomic replace operation: preserve existing slots and report partial saves.
      for (const dayOfWeek of missing) {
        await volunteersApi.addAvailability({ centerPoint: { type: "Point", coordinates: center.coord }, radiusMeters: radius * 1000, dayOfWeek, startTime, endTime });
        saved++;
      }
      setMessage(`${saved} jadwal baru tersimpan di server. Jadwal sebelumnya tetap berlaku.`);
      toast("Wilayah dan jadwal tersimpan di server.");
    } catch (error) {
      setFailed(true);
      setMessage(`${saved} dari ${missing.length} jadwal baru tersimpan. ${errorMessage(error)} Periksa daftar sebelum mencoba lagi.`);
    } finally {
      setBusy(false);
      slots.reload();
    }
  };

  const remove = (id: string) => {
    if (busy) return;
    confirmModal("Hapus jadwal", "Hapus slot ketersediaan ini dari server? Jadwal pendampingan terkonfirmasi tetap berjalan.", async () => {
      setBusy(true);
      setFailed(false);
      try {
        await volunteersApi.removeAvailability(id);
        setMessage("Jadwal ketersediaan dihapus dari server.");
      } catch (error) {
        setFailed(true);
        setMessage(errorMessage(error));
      } finally { setBusy(false); slots.reload(); }
    });
  };
  const onRadius = (v: string) => setRadius(Math.max(1, Math.min(5, Number(v) || 1)));
  return (
    <MapStage id="area-sheet" ariaLabel="Wilayah layanan" skipLabel="Lewati ke formulir wilayah" name="wilayah"
      map={<AppMap filters={false} label="Peta wilayah layanan" summary={center ? `Draf wilayah ${radius} kilometer dari ${center.name}. Simpan formulir agar berlaku di server.` : "Pilih pusat wilayah melalui formulir. Belum ada wilayah baru yang dipilih."} radius={center ? radius : undefined} center={center?.coord} />}>
      <div className="peek-keep peek-sub"><Heading title="Wilayah layanan" subtitle="Tentukan area dan waktu ketersediaan Anda." back="dashboard" /></div>
      <form className="card stack" data-form="service-area" onSubmit={(e) => void save(e)}>
        {center ? <p className="notice">Penanda pada peta radius adalah contoh [DEV], bukan hasil survei. Wilayah layanan disimpan sesuai titik pusat dan radius yang Anda pilih.</p> : null}
        <LocationField id="loc-service" label="Titik pusat wilayah" value={center} placeholder="Pilih titik pusat" onOpen={() => setPicking(true)} />
        <label className="field"><span>Radius layanan: <output id="radius-label">{radius}</output> km</span><input type="range" name="radius" min="1" max="5" step="1" value={radius} aria-label="Radius layanan dalam kilometer" onChange={(e) => onRadius(e.target.value)} /></label>
        <label className="field"><span>Radius (padanan keyboard)</span><input type="number" name="radius-number" value={radius} min="1" max="5" step="1" onChange={(e) => onRadius(e.target.value)} /></label>
        <div className="grid-2">
          <label className="field"><span>Jam mulai (WIB)</span><input name="start" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
          <label className="field"><span>Jam selesai (WIB)</span><input name="end" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
        </div>
        <div className="row">{DAYS.map((day, i) => <label key={day} className="check"><input type="checkbox" name="day" value={i} checked={days.includes(i)} onChange={(e) => setDays((current) => e.target.checked ? [...current, i] : current.filter((d) => d !== i))} />{day}</label>)}</div>
        <p className="small">Menambah jadwal berulang per hari. Jadwal yang sudah tersimpan tidak diganti; hapus slot yang tidak lagi berlaku dari daftar di bawah.</p>
        <button type="submit" className="btn primary full" disabled={busy || slots.loading || !!slots.error || !rows}>{busy ? "Menyimpan…" : "Simpan wilayah"}</button>
        {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
        <h2>Jadwal tersimpan</h2>
        <QueryState loading={slots.loading && !rows} error={slots.error} retry={slots.reload} />
        {!slots.error && rows?.length ? <ul className="list">{rows.map((slot) => <li key={slot.id} className="list-item"><div>
          <strong>{slot.dayOfWeek === null ? "Setiap hari" : DAYS[slot.dayOfWeek]} · {slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime} WIB` : "Sepanjang hari"}</strong>
          <small>{coordText(slot.centerPoint.coordinates)} · {slot.radiusMeters / 1000} km · {slot.isActive ? "Aktif" : "Tidak aktif"}</small>
        </div><Btn label="Gunakan wilayah" kind="sm" disabled={busy} onClick={() => { setCenter({ name: "Wilayah tersimpan", address: coordText(slot.centerPoint.coordinates), coord: slot.centerPoint.coordinates, source: "map" }); setRadius(slot.radiusMeters / 1000); }} /><Btn label="Hapus jadwal" kind="sm" disabled={busy} onClick={() => remove(slot.id)} /></li>)}</ul> : !slots.loading && !slots.error ? <p>Belum ada jadwal ketersediaan tersimpan.</p> : null}
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
