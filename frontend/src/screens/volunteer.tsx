"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { canOfferCompanion, volunteersApi } from "@/lib/api/volunteers";
import { sosApi } from "@/lib/api/sos";
import type { CompanionInvite, CompanionInviteEvent } from "@/types/api";
import type { SosNewBroadcast, SosResolvedBroadcast } from "@/types/sos";


function useVolunteerProfile() {
  const { user } = useAuth();
  const q = useApiQuery(user ? async () => ({ ownerId: user.id, profile: await volunteersApi.profile() }) : null, [user?.id]);
  const { reload } = q;
  useEffect(() => {
    const timer = setInterval(reload, COMPANION_POLL_MS.normal);
    return () => clearInterval(timer);
  }, [reload]);
  return { ...q, data: q.data?.ownerId === user?.id ? q.data?.profile : undefined };
}

function QueryState({ loading, error, retry }: { loading: boolean; error: { message: string } | null; retry: () => void }) {
  if (error) return <div className="stack"><p role="alert" className="notice">{error.message}</p><Btn label="Coba lagi" onClick={retry} /></div>;
  if (loading) return <p role="status">Memuat data relawan…</p>;
  return null;
}

function useOpenRequests() {
  const { user } = useAuth();
  const profile = useVolunteerProfile();
  const { fallback } = useSocket();
  const allowed = canOfferCompanion(user?.role, profile.data);
  const enabled = allowed && profile.data?.isActive === true;
  const q = useApiQuery(enabled && user ? async () => ({ ownerId: user.id, rows: await companionsApi.open() }) : null, [user?.id, enabled]);
  const { reload } = q;
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(reload, fallback ? COMPANION_POLL_MS.fallback : COMPANION_POLL_MS.normal);
    return () => clearInterval(timer);
  }, [enabled, reload, fallback]);
  useSocketEvent("companion:confirmed", reload);
  useSocketEvent("companion:not_selected", reload);
  return { ...q, data: enabled && q.data?.ownerId === user?.id ? q.data?.rows : undefined, profile, enabled, allowed };
}

export function VolunteerRequestList() {
  const q = useOpenRequests();
  if (q.profile.loading && q.profile.data === undefined || q.profile.error)
    return <QueryState loading={q.profile.loading} error={q.profile.error} retry={q.profile.reload} />;
  if (!q.allowed) return <p className="notice">Izin pendampingan belum aktif di server. <LinkBtn label="Lihat status" route="volunteer-pending" kind="sm" /></p>;
  if (!q.enabled) return <p className="notice">Status tidak tersedia aktif di server. Aktifkan di Dashboard saat siap menerima permintaan baru.</p>;
  if (q.error || q.loading && !q.data) return <QueryState loading={q.loading} error={q.error} retry={q.reload} />;
  if (!q.data?.length) return <p>Belum ada permintaan terbuka yang sesuai wilayah dan jadwal Anda.</p>;
  return <ul className="list">{q.data.map((r) => <li key={r.id} className="list-item">
    <Circle icon="handshake" /><div><strong>Ke {r.destinationName}</strong><small>{formatSchedule(r.scheduledStart)}</small><small>{r.assistanceTypes.map((t) => HELP_LABELS[t]).join(", ")}</small></div>
    <LinkBtn label="Lihat" route={`volunteer-request?id=${encodeURIComponent(r.id)}`} kind="sm primary" />
  </li>)}</ul>;
}

const HELP_LABELS: Record<string, string> = { memandu_jalan: "Memandu jalan", bantu_kursi_roda: "Bantu kursi roda", bacakan_informasi: "Bacakan informasi", dampingi_acara: "Dampingi acara" };

/** "Undangan untuk Anda" (API_CONTRACT §12.1): direct requests waiting for this volunteer's answer. */
function InvitesSection() {
  const { toast, modal } = useApp();
  const { fallback } = useSocket();
  const invites = useApiQuery<CompanionInvite[]>(() => companionsApi.invites(), []);
  const { reload } = invites;
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(timer); }, []);

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
      {invites.error ? (
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
                <Btn label="Terima" action="accept-invite" kind="sm primary" disabled={!!busy || invites.loading || new Date(i.inviteExpiresAt).getTime() <= now} onClick={() => void answer(i, true)} />
                <Btn label="Tolak" action="decline-invite" kind="sm" disabled={!!busy || invites.loading || new Date(i.inviteExpiresAt).getTime() <= now} onClick={() => decline(i)} />
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

type ActiveSosCall = {
  sosId: string;
  userName: string;
  distanceM: number;
  time: string;
  status: "incoming" | "en_route" | "arrived" | "declined";
};

export function DashboardScreen() {
  const { state, toast } = useApp();
  const { user, setUser } = useAuth();
  const { subscribe } = useSocket();
  const profile = useVolunteerProfile();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [sosCall, setSosCall] = useState<ActiveSosCall | null>({
    sosId: "demo-sos",
    userName: "Budi",
    distanceM: 320,
    time: "2 menit lalu, Jl. Kolonel Sugiyono, Yogyakarta",
    status: "incoming",
  });

  // Dengarkan siaran panggilan darurat baru (sos:new) via WebSocket
  useEffect(() => {
    const unsub = subscribe<SosNewBroadcast>("sos:new", (payload) => {
      setSosCall({
        sosId: payload.sosId,
        userName: payload.user?.name || "Pengguna Lansia",
        distanceM: payload.distanceM ?? 320,
        time: "Baru saja",
        status: "incoming",
      });
      toast(`Panggilan darurat SOS dari ${payload.user?.name || "pengguna"}!`);
      navigator.vibrate?.([100, 50, 100]);
    });
    return unsub;
  }, [subscribe, toast]);

  // Dengarkan jika insiden SOS diselesaikan
  useEffect(() => {
    const unsub = subscribe<SosResolvedBroadcast>("sos:resolved", (payload) => {
      if (sosCall && payload.sosId === sosCall.sosId) {
        toast("Panggilan darurat SOS telah diselesaikan.");
        setSosCall(null);
      }
    });
    return unsub;
  }, [subscribe, sosCall, toast]);

  const handleRespond = async () => {
    if (!sosCall) return;
    setResponding(true);
    try {
      if (sosCall.sosId && sosCall.sosId !== "demo-sos") {
        await sosApi.respond(sosCall.sosId, "accepted");
        await sosApi.respond(sosCall.sosId, "en_route");
      }
      setSosCall((prev) => (prev ? { ...prev, status: "en_route" } : null));
      toast("Respons SOS dikirim. Status Anda: Menuju Lokasi.");
    } catch (err) {
      console.warn("Gagal merespons SOS di server:", err);
      setSosCall((prev) => (prev ? { ...prev, status: "en_route" } : null));
      toast("Status relawan: Menuju Lokasi pengguna.");
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    if (!sosCall) return;
    try {
      if (sosCall.sosId && sosCall.sosId !== "demo-sos") {
        await sosApi.respond(sosCall.sosId, "declined");
      }
    } catch (err) {
      console.warn("Gagal menolak SOS di server:", err);
    } finally {
      setSosCall((prev) => (prev ? { ...prev, status: "declined" } : null));
      toast("Status tidak tersedia tercatat.");
    }
  };

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
        {!sosCall || sosCall.status === "declined" ? (
          <div className="notice">
            Anda tidak dapat merespons SOS ini. Permintaan tetap tersedia untuk relawan lain dalam simulasi.
          </div>
        ) : sosCall.status === "en_route" ? (
          <>
            <div className="row between">
              <h2>STATUS: MENUJU LOKASI PENGGUNA</h2>
              <Badge label="Menuju Lokasi" kind="green" icon="map-pin" />
            </div>
            <div className="list-item">
              <Avatar name={sosCall.userName} />
              <div>
                <strong>Membantu {sosCall.userName}</strong>
                <small>Jarak: {sosCall.distanceM} m • Status relawan disinkronkan ke pengguna</small>
              </div>
              <div className="row">
                <Btn
                  label="Tiba di Lokasi"
                  action="arrived-sos"
                  kind="primary"
                  onClick={async () => {
                    try {
                      if (sosCall.sosId && sosCall.sosId !== "demo-sos") {
                        await sosApi.respond(sosCall.sosId, "arrived");
                      }
                    } catch {}
                    setSosCall((prev) => (prev ? { ...prev, status: "arrived" } : null));
                    toast("Status diperbarui: Sudah tiba di lokasi.");
                  }}
                />
                <Btn
                  label="Selesai"
                  action="finish-sos"
                  onClick={() => {
                    setSosCall(null);
                    toast("Misi bantuan SOS selesai.");
                  }}
                />
              </div>
            </div>
          </>
        ) : sosCall.status === "arrived" ? (
          <>
            <div className="row between">
              <h2>STATUS: TIBA DI LOKASI</h2>
              <Badge label="Bersama Pengguna" kind="blue" icon="check" />
            </div>
            <div className="list-item">
              <Avatar name={sosCall.userName} />
              <div>
                <strong>Mendampingi {sosCall.userName}</strong>
                <small>Anda telah tiba di lokasi darurat pengguna</small>
              </div>
              <div className="row">
                <Btn
                  label="Selesai Membantu"
                  action="finish-sos"
                  kind="primary"
                  onClick={() => {
                    setSosCall(null);
                    toast("Misi bantuan darurat selesai.");
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="row between">
              <h2>SOS AKTIF</h2>
              <Badge label="Prioritas tertinggi" kind="red" icon="siren" />
            </div>
            <div className="list-item">
              <Avatar name={sosCall.userName} />
              <div>
                <strong>
                  {sosCall.userName}, {sosCall.distanceM} m dari Anda
                </strong>
                <small>{sosCall.time}</small>
              </div>
              <div className="row">
                <Btn
                  label={responding ? "Menghubungkan..." : "Bantu / Menuju Lokasi"}
                  action="respond-sos"
                  kind="danger"
                  disabled={responding || profile.data?.verificationStatus !== "verified"}
                  onClick={handleRespond}
                />
                <Btn
                  label="Tidak bisa"
                  action="decline-sos"
                  disabled={responding}
                  onClick={handleDecline}
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
      {canOfferCompanion(user?.role, profile.data) ? <InvitesSection /> : null}
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
          <p>Kelola pendampingan terkonfirmasi dan konfirmasi check-in dua arah saat bertugas.</p>
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
  const { user, refreshUser } = useAuth();
  const { toast } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const form = e.currentTarget;
    const motivation = (form.elements.namedItem("motivation") as HTMLTextAreaElement | null)?.value?.trim() || "";
    const consent = form.querySelector<HTMLInputElement>('input[name="consent"]')?.checked ?? false;

    if (!motivation || motivation.length < 10) {
      setError("Motivasi minimal 10 karakter.");
      return;
    }
    if (!file) {
      setError("Pilih berkas dokumen identitas format JPEG atau PNG (maks 5 MB).");
      return;
    }
    if (!consent) {
      setError("Anda harus menyetujui kode etik dan persetujuan pengguna.");
      return;
    }

    setSubmitting(true);
    try {
      const uploadRes = await volunteersApi.uploadIdentity(file);
      await volunteersApi.apply({
        motivation,
        idCardUrl: uploadRes.idCardUrl,
      });
      await refreshUser();
      toast("Permohonan verifikasi relawan berhasil diajukan.");
      setSubmitted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="content-page narrow">
        <Heading title="Daftar relawan" back="dashboard" />
        <section className="card stack">
          <Circle icon="hourglass" />
          <h2>Permohonan Terkirim</h2>
          <p>
            Permohonan verifikasi relawan Anda telah tersimpan di server dengan status menunggu verifikasi admin.
          </p>
          <LinkBtn label="Lihat status pendaftaran" route="volunteer-pending" kind="primary" />
        </section>
      </div>
    );
  }

  return (
    <div className="content-page narrow">
      <Heading title="Daftar relawan" subtitle="Lengkapi identitas dan motivasi Anda." back="role" />
      <form className="card stack" data-form="volunteer-register" onSubmit={(e) => void handleSubmit(e)}>
        <p className="notice">
          Dokumen identitas disimpan secara privat di server dan hanya dapat diakses oleh Anda dan admin untuk keperluan verifikasi.
        </p>
        <fieldset disabled={submitting} className="stack">
          <TextField label="Nama lengkap" name="name" value={user?.name ?? ""} inputProps={{ readOnly: true }} />
          <AreaField label="Motivasi menjadi relawan" name="motivation" placeholder="Ceritakan alasan Anda ingin membantu..." />
          <label className="field">
            <span>Dokumen identitas (KTP/identitas, JPEG/PNG maks 5 MB)</span>
            <input
              type="file"
              name="document"
              accept="image/jpeg,image/png"
              aria-label="Dokumen identitas"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
              }}
            />
          </label>
          {file ? <small>Berkas terpilih: {file.name} ({(file.size / 1024).toFixed(1)} KB)</small> : null}
          <label className="check">
            <input type="checkbox" name="consent" />
            Saya memahami kode etik dan persetujuan pengguna.
          </label>
          {error ? <p role="alert" className="notice">{error}</p> : null}
          <button type="submit" className="btn primary full" disabled={submitting}>
            {submitting ? "Mengajukan verifikasi…" : "Ajukan verifikasi"}
          </button>
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

function VolunteerRequestBody() {
  const params = useSearchParams();
  const q = useOpenRequests();
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [offeredId, setOfferedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const id = params.get("id");
  const request = q.data?.find((r) => r.id === id);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!request || busy || offeredId === request.id || !q.enabled || q.error || q.profile.error) return;
    const message = String(new FormData(e.currentTarget).get("offer-message") || "").trim();
    setBusy(true);
    setFailure(null);
    try {
      await companionsApi.offer(request.id, message);
      setOfferedId(request.id);
      toast("Penawaran tercatat di server. Pengguna yang memilih pendampingnya.");
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); q.reload(); }
  };
  return <div className="content-page narrow">
    <Heading title="Detail permintaan" subtitle="Pendampingan yang sesuai dengan kapabilitas Anda." back="volunteer-requests" />
    <section className="card stack">
      <QueryState loading={q.profile.loading && q.profile.data === undefined || q.enabled && q.loading && !q.data} error={q.profile.error || q.error} retry={() => { q.profile.reload(); q.reload(); }} />
      {!q.allowed && !q.profile.loading && !q.profile.error ? <p>Izin pendampingan belum aktif di server.</p> : !q.enabled && q.allowed ? <p>Anda sedang tidak tersedia. Aktifkan status di Dashboard untuk menawarkan diri.</p> : null}
      {request && q.enabled && !q.error && !q.profile.error ? <form className="stack" onSubmit={(e) => void submit(e)}>
        <h2>{request.destinationName}</h2>
        <ul className="list"><li>Waktu: {formatSchedule(request.scheduledStart)}</li><li>Jenis: {request.assistanceTypes.map((t) => HELP_LABELS[t]).join(", ")}</li><li>Titik temu: {request.meetingPointNote || "Belum ada keterangan titik temu."}</li></ul>
        {request.notes ? <p>{request.notes}</p> : null}
        <p className="small">Identitas pengguna tidak ditampilkan sebelum pendampingan dikonfirmasi.</p>
        <label className="field"><span>Pesan penawaran Anda</span><textarea name="offer-message" maxLength={500} placeholder="Tuliskan pesan untuk pengguna..." disabled={busy || offeredId === request.id} /></label>
        <div className="row"><button type="submit" className="btn primary" disabled={busy || offeredId === request.id}>{busy ? "Mengirim…" : "Tawarkan diri"}</button><LinkBtn label="Kembali ke permintaan" route="volunteer-requests" /></div>
      </form> : q.enabled && !q.loading && !q.error && !q.profile.error ? <p>Permintaan tidak ada atau sudah tidak terbuka untuk Anda. <LinkBtn label="Lihat permintaan lain" route="volunteer-requests" /></p> : null}
      {failure ? <p role="alert">{failure}</p> : null}
      {offeredId === id ? <p role="status">Penawaran Anda tercatat di server. Menunggu pilihan pengguna; ini belum menjadi pendampingan terkonfirmasi.</p> : null}
    </section>
  </div>;
}

export function VolunteerRequestScreen() {
  return <Suspense fallback={<p role="status">Memuat permintaan…</p>}><VolunteerRequestBody /></Suspense>;
}

export function VolunteerScheduleScreen() {
  const { user } = useAuth();
  const { toast } = useApp();
  const { fallback } = useSocket();
  const [busyId, setBusyId] = useState<string | null>(null);

  const assignments = useApiQuery(
    user && user.role === "volunteer"
      ? async () => ({ ownerId: user.id, rows: await companionsApi.assignments() })
      : null,
    [user?.id, user?.role],
  );
  const { reload } = assignments;
  const rows = assignments.data?.ownerId === user?.id ? assignments.data?.rows : undefined;

  useEffect(() => {
    const timer = setInterval(reload, fallback ? COMPANION_POLL_MS.fallback : COMPANION_POLL_MS.normal);
    return () => clearInterval(timer);
  }, [reload, fallback]);
  useSocketEvent("companion:confirmed", reload);

  const doCheckin = async (assignmentId: string, type: "meet" | "complete") => {
    if (busyId) return;
    setBusyId(`${assignmentId}:${type}`);
    try {
      await companionsApi.checkin(assignmentId, type);
      toast(type === "meet" ? "Konfirmasi bertemu tersimpan di server." : "Konfirmasi selesai tersimpan di server.");
      reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const STATUS_LABEL: Record<string, string> = {
    confirmed: "Terkonfirmasi",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };

  return (
    <div className="content-page narrow">
      <Heading title="Pendampingan terjadwal" subtitle="Konfirmasi saat bertemu dan setelah selesai." back="dashboard" />
      <section className="card stack">
        <p className="notice" role="status">
          Pendampingan baru selesai setelah pengguna dan relawan mengirim konfirmasi selesai dari akun masing-masing.
          Tidak ada konfirmasi pihak lain yang disimulasikan.
        </p>

        <QueryState
          loading={assignments.loading && !rows}
          error={assignments.error}
          retry={reload}
        />

        {!assignments.error && rows && rows.length === 0 ? (
          <p>Belum ada jadwal pendampingan yang ditugaskan kepada Anda.</p>
        ) : null}

        {!assignments.error && rows && rows.length > 0 ? (
          <ul className="list">
            {rows.map((a) => {
              const isConfirmed = a.status === "confirmed";
              const meetDone = a.checkins.volunteer.meet;
              const completeDone = a.checkins.volunteer.complete;

              return (
                <li key={a.id} className="card stack">
                  <div className="row between">
                    <strong>Ke {a.destinationName}</strong>
                    <Badge
                      label={STATUS_LABEL[a.status] ?? a.status}
                      kind={a.status === "completed" ? "green" : a.status === "confirmed" ? "blue" : "gray"}
                    />
                  </div>
                  <ul className="list">
                    <li>Waktu: {formatSchedule(a.scheduledStart)}</li>
                    {a.estimatedDurationMin ? <li>Estimasi durasi: {a.estimatedDurationMin} menit</li> : null}
                    <li>Bantuan: {a.assistanceTypes.map((t) => HELP_LABELS[t] || t).join(", ")}</li>
                    {isConfirmed ? (
                      <>
                        <li>Pemohon: {a.requester ? a.requester.name : "—"}</li>
                        <li>Titik temu: {a.meetingPointNote || "Belum ada keterangan titik temu."}</li>
                        {a.notes ? <li>Catatan: {a.notes}</li> : null}
                      </>
                    ) : (
                      <li><small className="notice">Detail pemohon dan titik temu ditutup untuk privasi.</small></li>
                    )}
                  </ul>

                  {isConfirmed ? (
                    <div className="stack mt-2">
                      <div className="row between">
                        <small>
                          Status Anda: {meetDone ? "✓ Bertemu" : "Belum bertemu"} · {completeDone ? "✓ Selesai" : "Belum selesai"}
                        </small>
                        <small>
                          Status Pemohon: {a.checkins.requester.meet ? "✓ Bertemu" : "Belum bertemu"} · {a.checkins.requester.complete ? "✓ Selesai" : "Belum selesai"}
                        </small>
                      </div>
                      <div className="row">
                        <Btn
                          label={meetDone ? "Sudah bertemu" : "Konfirmasi bertemu"}
                          disabled={meetDone || !!busyId}
                          kind={meetDone ? "" : "primary"}
                          onClick={() => void doCheckin(a.id, "meet")}
                        />
                        <Btn
                          label={completeDone ? "Sudah selesai" : "Konfirmasi selesai"}
                          disabled={completeDone || !!busyId}
                          kind={completeDone ? "" : "primary"}
                          onClick={() => void doCheckin(a.id, "complete")}
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <LinkBtn label="Ke Dashboard" route="dashboard" />
      </section>
    </div>
  );
}
