"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { PushPermission } from "@/components/PushPermission";
import { Heading } from "@/components/shared";
import { Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, SelectField, TextField } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { VoiceButton } from "@/contexts/VoiceContext";
import { useApp } from "@/hooks/useApp";
import { accessRole, href, isSeniorRole } from "@/lib/access";
import { listCaregivers, patchCaregiver, patchMe } from "@/lib/api/users";
import { ApiError, errorMessage } from "@/lib/api-client";
import { PROFILES, ROLE_LABEL, SHARING_NOTE, SHARING_OPTIONS, sharingOption } from "@/lib/data";
import { clearSaved, INITIAL, SERVER_KEYS, type DemoState } from "@/lib/demo-state";
import { useApiQuery, type QueryState } from "@/hooks/useApiQuery";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { unreadStore } from "@/hooks/useUnreadNotifications";
import { notificationsApi } from "@/lib/api/notifications";
import type {
  AppNotification,
  CaregiverLink,
  LocationSharingMode,
  NotificationPreferenceKey,
  NotificationPreferences,
  NotificationType,
} from "@/types/api";

export function SettingsScreen() {
  const { state, update } = useApp();
  const { logout } = useAuth();
  const r = accessRole(state);
  const ALL = ["user", "caregiver", "volunteer", "admin"];
  const rows = (
    [
      ["user", "Profil Saya", "account", ALL],
      ["accessibility", "Kondisi Anda", "profile", ["user"]],
      ["phone", "Kontak Darurat", "caregiver-link", ["user"]],
      ["bookmark", "Rute Tersimpan", "saved", ["user"]],
      ["history", "Riwayat Perjalanan", "history", ["user"]],

      ["users", "Komunitas", "communities", ["user"], true],
      ["bell", "Notifikasi", "notification-settings", ALL],
      ["languages", "Bahasa & Suara", "voice-settings", ["user", "caregiver"]],
      ["shield-check", "Privasi & Izin", "privacy", ALL],
      ["circle-help", "Bantuan", "help", ALL],
      ["log-out", "Keluar", "landing", ALL],
    ] as [string, string, string, string[], boolean?][]
  ).filter((x) => x[3].includes(r));
  return (
    <div className="content-page narrow">
      <Heading title="Pengaturan" subtitle="Atur akun, bantuan, dan privasi Anda." back="" />
      <section className="card setting-list">
        <div className="profile-card">
          <Avatar name={state.name} big />
          <div>
            <h2>{state.name}</h2>
            <p>{ROLE_LABEL[r]}</p>
          </div>
        </div>
        <hr className="divider" />
        {rows.map(([i, t, rt, , mobileOnly]) => (
          <Link
            key={rt}
            className={mobileOnly ? "list-item map:hidden" : "list-item"}
            href={href(rt)}
            onClick={rt === "landing" ? () => void logout() : undefined}
          >
            <Icon name={i} />
            <div>
              <strong>{t}</strong>
            </div>
            <Icon name="chevron-right" />
          </Link>
        ))}
        <div className="list-item">
          <Icon name="type" />
          <div>
            <strong>Teks lebih besar</strong>
            <small>Sesuaikan dengan kebutuhan membaca</small>
          </div>
          <input
            className="switch"
            type="checkbox"
            data-setting="large"
            aria-label="Teks lebih besar"
            checked={state.large}
            onChange={(e) => update({ large: e.target.checked })}
          />
        </div>
        <div className="list-item">
          <Icon name="contrast" />
          <div>
            <strong>Kontras tinggi</strong>
          </div>
          <input
            className="switch"
            type="checkbox"
            data-setting="contrast"
            aria-label="Kontras tinggi"
            checked={state.contrast}
            onChange={(e) => update({ contrast: e.target.checked })}
          />
        </div>
      </section>
    </div>
  );
}

export function AccountScreen() {
  const { state, go, toast } = useApp();
  const { user, setUser } = useAuth();
  return (
    <div className="content-page narrow">
      <Heading title="Profil Saya" back="settings" />
      <form
        className="card stack"
        data-form="account"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") || "").trim();
          try {
            setUser(await patchMe({ name }));
          } catch (err) {
            toast(errorMessage(err));
            return;
          }
          go("settings");
          toast("Profil tersimpan.");
        }}
      >
        <TextField
          label="Nama"
          name="name"
          value={state.name}
          placeholder="Nama Anda"
          required
          inputProps={{ minLength: 2, maxLength: 100 }}
        />
        {/* The number is the login identity; the API does not allow changing it, so it is shown read-only (masked). */}
        <TextField
          label="Nomor telepon"
          name="phone"
          value={user?.phoneNumber || ""}
          placeholder="08xxxxxxxxxx"
          type="tel"
          inputProps={{ readOnly: true, "aria-readonly": true }}
        />
        <section className="condition-summary">
          <h2>Kondisi Anda</h2>
          <p>{state.profiles.map((id) => PROFILES.find((p) => p[0] === id)?.[1]).join(", ")}</p>
          <LinkBtn label="Ubah kondisi" route="profile" />
        </section>
        <button type="submit" className="btn primary">
          Simpan
        </button>
      </form>
    </div>
  );
}

// A pending choice is keyed by link id + the server's mode, so it is dropped once the server
// value changes (after a save or a reload) instead of masking it.
const choiceKey = (l: CaregiverLink) => `${l.id}:${l.locationSharingMode}`;

/** Location sharing per family link, from GET /users/me/caregivers (API_CONTRACT §3). */
function FamilySharing({ links, choice }: { links: QueryState<CaregiverLink[]>; choice: Record<string, LocationSharingMode> }) {
  if (links.loading && !links.data)
    return (
      <>
        <h2>Keluarga tertaut</h2>
        <div className="skeleton line" aria-hidden="true"></div>
        <p role="status">Memuat keluarga tertaut…</p>
      </>
    );
  if (links.error)
    return (
      <>
        <h2>Keluarga tertaut</h2>
        <div className="notice" role="alert">
          {links.error.message}
        </div>
        <Btn label="Coba lagi" action="reload-caregivers" kind="sm" icon="repeat" onClick={links.reload} />
      </>
    );
  if (links.empty || !links.data)
    return (
      <>
        <h2>Belum ada keluarga tertaut</h2>
        <p>Mode berbagi lokasi dapat diatur setelah anggota keluarga ditautkan ke akun Anda.</p>
        <LinkBtn label="Tautkan anggota keluarga" route="caregiver-link" icon="link" />
      </>
    );
  return (
    <>
      {links.data.map((link) => {
        const mode = choice[choiceKey(link)] ?? link.locationSharingMode;
        return (
          <Fragment key={choiceKey(link)}>
            <h2>{link.caregiver.name}</h2>
            <SelectField
              label={`Berbagi lokasi dengan ${link.caregiver.name}`}
              name={`sharing:${choiceKey(link)}`}
              options={SHARING_OPTIONS.map(([v, t]) => [v, t] as [string, string])}
              value={link.locationSharingMode}
            />
            <div className="notice" aria-live="polite">
              {sharingOption(mode)[2]}
            </div>
          </Fragment>
        );
      })}
      <p>{SHARING_NOTE}</p>
    </>
  );
}

export function PrivacyScreen() {
  const { state, update, go, toast, confirmModal } = useApp();
  const senior = isSeniorRole(state);
  const links = useApiQuery(senior ? listCaregivers : null, [senior]);
  const [choice, setChoice] = useState<Record<string, LocationSharingMode>>({});
  const [saving, setSaving] = useState(false);
  const primary = links.data?.find((l) => l.relationshipType === "primary") ?? links.data?.[0];

  // Screens not yet wired to the API (home family status, caregiver demo) read the demo
  // state; mirror the server's mode one way so they do not contradict this screen.
  useEffect(() => {
    if (primary && primary.locationSharingMode !== state.sharing) update({ sharing: primary.locationSharingMode });
  }, [primary, state.sharing, update]);

  const save = async () => {
    const changed = (links.data ?? []).filter((l) => (choice[choiceKey(l)] ?? l.locationSharingMode) !== l.locationSharingMode);
    if (!changed.length) {
      toast("Tidak ada perubahan untuk disimpan.");
      return;
    }
    setSaving(true);
    try {
      for (const l of changed) await patchCaregiver(l.id, choice[choiceKey(l)]);
      toast("Preferensi berbagi lokasi tersimpan.");
      links.reload();
    } catch (e) {
      // The choice stays on screen so it can be saved again.
      toast(e instanceof ApiError ? e.message : "Preferensi belum tersimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content-page narrow">
      <Heading title="Privasi & izin" subtitle="Anda mengendalikan informasi yang dibagikan." back="settings" />
      <form
        className="card stack"
        data-form="privacy"
        aria-busy={saving}
        onChange={(e) => {
          const t = e.target;
          if (t instanceof HTMLSelectElement && t.name.startsWith("sharing:"))
            setChoice((c) => ({ ...c, [t.name.slice(8)]: t.value as LocationSharingMode }));
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) void save();
        }}
      >
        {senior && <FamilySharing links={links} choice={choice} />}
        {senior && !!links.data?.length && <PushPermission context="family" />}
        <h2>Izin suara</h2>
        <p>
          Pengenalan ucapan mengubah suara menjadi teks tujuan atau perintah. Anda selalu dapat mengetik tujuan dan memakai tombol. Baca
          penjelasan pemrosesan audio sebelum mengaktifkan mikrofon.
        </p>
        <p>
          Mikrofon hanya aktif setelah Anda menekan tombol suara dan menyetujui izin. Pengenalan ucapan dapat mengirim audio ke layanan
          browser dan membutuhkan internet. Transkrip tidak disimpan oleh aplikasi. Tekan Berhenti atau tinggalkan tab untuk mematikan
          mikrofon.
        </p>
        <p>
          Nama, kondisi perjalanan, dan mode berbagi lokasi Anda disimpan di server Unstoppable. Laporan dan riwayat di aplikasi ini masih
          data demo yang disimpan pada browser ini. Pengenalan suara mengikuti layanan dan kebijakan browser Anda.
        </p>
        {senior && !!links.data?.length && (
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan preferensi"}
          </button>
        )}
        <Btn
          label="Hapus data demo di browser ini"
          action="reset-demo"
          kind="danger"
          onClick={() =>
            confirmModal(
              "Hapus data demo",
              "Hapus laporan, rute tersimpan, pendampingan, dan perubahan graf dari browser ini? Data lokal tidak dapat dipulihkan. Akun dan kondisi perjalanan di server tidak terhapus.",
              () => {
                clearSaved();
                const local = Object.entries(structuredClone(INITIAL)).filter(([k]) => !(SERVER_KEYS as readonly string[]).includes(k));
                update({ ...(Object.fromEntries(local) as Partial<DemoState>), onboard: 1, activeTrip: false });
                go("landing");
                toast("Data demo dihapus.");
              },
            )
          }
        />
      </form>
    </div>
  );
}

export function VoiceSettingsScreen() {
  const { state, update, speak } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Bahasa & suara" back="settings" />
      <section className="card stack">
        <div className="row between">
          <strong>Narasi suara</strong>
          <input
            className="switch"
            type="checkbox"
            data-setting="voice"
            aria-label="Narasi suara"
            checked={state.voice}
            onChange={(e) => update({ voice: e.target.checked })}
          />
        </div>
        <p>Bahasa narasi: Indonesia. Ketersediaan suara bergantung pada perangkat.</p>
        <label className="field">
          <span>
            Kecepatan bicara: <output id="voice-rate-label">{state.voiceRate || 0.9} kali</output>
          </span>
          <input
            type="range"
            name="voice-rate"
            min="0.5"
            max="1.5"
            step="0.1"
            value={state.voiceRate || 0.9}
            onChange={(e) => update({ voiceRate: Number(e.target.value) })}
          />
        </label>
        <Btn
          label="Coba suara ini"
          action="test-voice"
          kind="primary"
          icon="volume-2"
          onClick={() => speak("Unstoppable. Sampai dengan selamat. Rute sesuai kondisi Anda.")}
        />
        <hr className="divider" />
        <h2>Kendali suara</h2>
        <p>
          Aktifkan mikrofon untuk mencari tujuan dan menjalankan perintah di halaman aplikasi. Mikrofon berhenti saat Anda meninggalkan tab.
        </p>
        <div className="row">
          <VoiceButton mode="control" className="btn primary">
            <Icon name="mic" />
            Mulai kendali suara
          </VoiceButton>
          <VoiceButton mode="help" className="btn">
            Panduan perintah
          </VoiceButton>
        </div>
        <p className="small">
          Audio dapat diproses layanan browser. Tidak semua browser mendukung pengenalan ucapan. Transkrip tidak disimpan.
        </p>
        <ul className="list">
          <li>“Cari Puskesmas Mergangsan”</li>
          <li>“Buka beranda” atau “Buka pengaturan”</li>
          <li>“Mulai perjalanan”, “Ulangi petunjuk”, “Langkah berikutnya”</li>
          <li>“Berhenti mendengarkan”</li>
        </ul>
      </section>
    </div>
  );
}

const NOTIFICATION_ICON: Record<NotificationType, string> = {
  session: "route",
  companion: "handshake",
  sos: "phone",
  community: "users",
  trip: "calendar",
};

const notificationTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

// Only same-app paths are followed; the server sends relative URLs (§18).
const safePath = (url: string | null) => (url && url.startsWith("/") && !url.startsWith("//") ? url : null);

const FALLBACK_POLL_MS = 30_000;

export function NotificationsScreen() {
  const router = useRouter();
  const { toast, announce } = useApp();
  const { fallback } = useSocket();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // page 1 = (re)load newest, merged in front of what is already shown; later pages append.
  const load = useCallback(async (next: number) => {
    try {
      const { data, meta } = await notificationsApi.list(next);
      setItems((cur) => {
        const byId = new Map(data.map((n) => [n.id, n]));
        if (next === 1) {
          const seen = new Set(cur.map((n) => n.id));
          return [...data.filter((n) => !seen.has(n.id)), ...cur.map((n) => byId.get(n.id) ?? n)];
        }
        const seen = new Set(cur.map((n) => n.id));
        return [...cur, ...data.filter((n) => !seen.has(n.id))];
      });
      if (next > 1) setPage(next);
      setTotalPages(meta?.totalPages ?? 1);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the inbox; state is set after the request resolves
    void load(1);
  }, [load]);

  // REST fallback while the socket is down (§15.4).
  useEffect(() => {
    if (!fallback) return;
    const timer = setInterval(() => void load(1), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [fallback, load]);

  // The bell in AppShell counts notification:new itself; here the item is only added to the list.
  useSocketEvent<Pick<AppNotification, "id" | "type" | "title" | "body" | "url">>("notification:new", (n) => {
    setItems((cur) =>
      cur.some((x) => x.id === n.id) ? cur : [{ ...n, url: n.url ?? null, readAt: null, createdAt: new Date().toISOString() }, ...cur],
    );
    announce(`Notifikasi baru: ${n.title}`);
  });

  const unread = items.filter((n) => !n.readAt).length;

  const open = async (n: AppNotification) => {
    if (!n.readAt) {
      try {
        await notificationsApi.read(n.id);
        setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
        unreadStore.add(-1);
      } catch (e) {
        toast(errorMessage(e));
      }
    }
    const path = safePath(n.url);
    if (path) router.push(path);
  };

  const readAll = async () => {
    try {
      await notificationsApi.readAll();
      const now = new Date().toISOString();
      setItems((cur) => cur.map((x) => (x.readAt ? x : { ...x, readAt: now })));
      unreadStore.set(0);
      announce("Semua notifikasi ditandai sudah dibaca.");
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <div className="content-page narrow">
      <Heading title="Notifikasi" subtitle="Pembaruan perjalanan dan komunitas." back="home" />
      <section className="card stack">
        {loading && !items.length ? (
          <>
            <div className="skeleton line" aria-hidden="true"></div>
            <p role="status">Memuat notifikasi…</p>
          </>
        ) : error && !items.length ? (
          <>
            <div className="notice" role="alert">
              {error}
            </div>
            <Btn
              label="Coba lagi"
              action="reload-notifications"
              kind="sm"
              icon="repeat"
              onClick={() => {
                setLoading(true);
                void load(1);
              }}
            />
          </>
        ) : !items.length ? (
          <div className="empty">
            <Circle icon="bell" />
            <h2>Belum ada notifikasi</h2>
            <p>Belum ada notifikasi. Kabar perjalanan dan pendampingan akan muncul di sini.</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="notice" role="alert">
                {error}
              </div>
            )}
            {unread > 0 && (
              <div className="row between">
                <span>{unread} belum dibaca</span>
                <Btn label="Tandai semua dibaca" action="read-all-notifications" kind="sm" icon="check" onClick={() => void readAll()} />
              </div>
            )}
            <ul className="list">
              {items.map((n) => {
                const path = safePath(n.url);
                const action = path ? "Lihat" : "Tandai dibaca";
                return (
                  <li key={n.id} className="list-item">
                    <Circle icon={NOTIFICATION_ICON[n.type] ?? "bell"} />
                    <div>
                      {n.readAt ? <span>{n.title}</span> : <strong>{n.title}</strong>}
                      <small>{n.body}</small>
                      <small>{notificationTime(n.createdAt)}</small>
                    </div>
                    {!n.readAt && <Badge label="Baru" kind="blue" />}
                    {(!n.readAt || path) && (
                      <Btn
                        label={action}
                        action="open-notification"
                        kind="sm"
                        aria-label={`${action}: ${n.title}`}
                        onClick={() => void open(n)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {page < totalPages && (
              <Btn
                label={more ? "Memuat…" : "Muat lebih banyak"}
                action="more-notifications"
                kind="sm"
                disabled={more}
                onClick={() => {
                  setMore(true);
                  void load(page + 1);
                }}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

const PREFERENCE_ROWS: [key: NotificationPreferenceKey, label: string][] = [
  ["companion", "Permintaan pendampingan"],
  ["session", "Pembaruan perjalanan"],
  ["trip", "Pengingat rencana perjalanan"],
  ["community", "Kegiatan komunitas"],
];

export function NotificationSettingsScreen() {
  const { toast } = useApp();
  const prefs = useApiQuery(() => notificationsApi.preferences(), []);
  const [override, setOverride] = useState<Partial<NotificationPreferences>>({});
  const current = prefs.data ? { ...prefs.data, ...override } : undefined;

  // Optimistic: flip now, roll back with a toast when the PUT fails.
  const change = async (key: NotificationPreferenceKey, value: boolean) => {
    if (!current) return;
    const previous = current[key];
    setOverride((o) => ({ ...o, [key]: value }));
    try {
      setOverride(await notificationsApi.savePreferences({ ...current, [key]: value }));
    } catch (e) {
      setOverride((o) => ({ ...o, [key]: previous }));
      toast(errorMessage(e));
    }
  };

  return (
    <div className="content-page narrow">
      <Heading title="Pengaturan Notifikasi" back="settings" />
      <section className="card stack">
        <PushPermission context="settings" />
        {prefs.loading && !prefs.data ? (
          <>
            <div className="skeleton line" aria-hidden="true"></div>
            <p role="status">Memuat pengaturan notifikasi…</p>
          </>
        ) : prefs.error ? (
          <>
            <div className="notice" role="alert">
              {prefs.error.message}
            </div>
            <Btn label="Coba lagi" action="reload-notification-settings" kind="sm" icon="repeat" onClick={prefs.reload} />
          </>
        ) : (
          current && (
            <>
              {PREFERENCE_ROWS.map(([key, label]) => (
                <div key={key} className="row between">
                  <span id={`pref-${key}`}>{label}</span>
                  <input
                    className="switch"
                    type="checkbox"
                    data-notification-setting={key}
                    aria-labelledby={`pref-${key}`}
                    checked={current[key]}
                    onChange={(e) => void change(key, e.target.checked)}
                  />
                </div>
              ))}
              <div className="row between">
                <span id="pref-sos">Peringatan SOS</span>
                <input
                  className="switch"
                  type="checkbox"
                  data-notification-setting="sos"
                  aria-labelledby="pref-sos"
                  aria-describedby="pref-sos-note"
                  checked
                  disabled
                  readOnly
                />
              </div>
              <p id="pref-sos-note" className="small">
                Tidak bisa dimatikan demi keselamatan.
              </p>
            </>
          )
        )}
      </section>
    </div>
  );
}

export function StoredScreen({ kind }: { kind: "saved" | "history" }) {
  const { state, openPlace } = useApp();
  const history = kind === "history";
  const items = history
    ? state.history.map((h) => ({ d: h.destination, sub: h.date + (h.duration ? ", " + h.duration + " menit" : "") }))
    : state.saved.map((d) => ({ d, sub: "Rute yang Anda simpan" }));
  return (
    <div className="content-page narrow">
      <Heading title={history ? "Riwayat perjalanan" : "Rute tersimpan"} back="settings" />
      <section className="card">
        {items.length ? (
          <ul className="list">
            {items.map((it, i) => (
              <li key={i} className="list-item">
                <Circle icon={history ? "history" : "bookmark"} />
                <div>
                  <strong>{it.d}</strong>
                  <small>{it.sub}</small>
                </div>
                <Btn label="Lihat" action="select-destination" kind="sm primary" data-destination={it.d} onClick={() => openPlace(it.d)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={history ? "Belum ada perjalanan selesai" : "Belum ada rute tersimpan"}
            text={history ? "Selesaikan perjalanan untuk melihat riwayat." : "Simpan rute dari halaman pratinjau."}
            label="Cari rute"
            route="home"
          />
        )}
      </section>
    </div>
  );
}

export function ExportsScreen() {
  const { state, toast } = useApp();
  const exportCsv = () => {
    const cell = (s: unknown) => {
      let t = String(s ?? "");
      if (/^[=+@-]/.test(t)) t = "'" + t;
      return '"' + t.replace(/"/g, '""') + '"';
    };
    const csv =
      "﻿Kategori,Lokasi,Keparahan,Deskripsi,Status\r\n" +
      state.reports.map((r) => [r.category, r.location, r.severity, r.description, r.status].map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "unstoppable-laporan.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("CSV laporan lokal diunduh.");
  };
  return (
    <div className="content-page narrow">
      <Heading title="Ekspor laporan" subtitle="Unduh kontribusi lokal Anda dalam format CSV." back="dashboard" />
      <section className="card stack">
        <h2>{state.reports.length} laporan</h2>
        <p>
          Bagikan laporan ini kepada penyelenggara layanan lansia atau pengelola fasilitas. Ekspor berisi kategori, lokasi, tingkat
          keparahan, dan status. Seluruh data berasal dari browser ini.
        </p>
        <Btn label="Unduh CSV" action="export-csv" kind="primary" icon="download" onClick={exportCsv} />
      </section>
    </div>
  );
}

export function HelpScreen() {
  return (
    <div className="content-page narrow">
      <Heading title="Bantuan" subtitle="Panduan singkat penggunaan prototipe." back="settings" />
      <section className="card stack">
        <details open>
          <summary>Cara mencari rute</summary>
          <p>
            Pilih tujuan, sesuaikan profil, lalu buka pratinjau. Pilih Mulai Perjalanan dan gunakan tombol Ulangi untuk mendengar instruksi.
          </p>
        </details>
        <details>
          <summary>Cara menggunakan SOS</summary>
          <p>
            Tahan tombol SOS 1,5 detik dengan sentuhan atau tombol Space/Enter. Melepas lebih awal membatalkan. Demo tidak menghubungi
            orang.
          </p>
        </details>
        <details>
          <summary>Bagaimana keluarga melihat perjalanan?</summary>
          <p>
            Tautkan anggota keluarga, lalu pilih berbagi selama perjalanan, hanya saat darurat, atau tidak berbagi. Mode yang Anda pilih
            terlihat pada halaman Keluarga.
          </p>
        </details>
        <details>
          <summary>Mengapa rute saya berbeda?</summary>
          <p>
            Kondisi setiap lansia berbeda. Kursi roda memerlukan jalur tanpa tangga. Penglihatan menurun memerlukan jalur terang dengan
            petunjuk yang jelas.
          </p>
        </details>
        <details>
          <summary>Cara mencoba editor</summary>
          <p>
            Pilih mode dengan tombol 1–5. Tambah node, hubungkan dua node pada mode Edge, isi atribut, lalu simpan draft. Buka antrean untuk
            meninjau.
          </p>
        </details>
      </section>
    </div>
  );
}
