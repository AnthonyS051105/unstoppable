"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { PushPermission } from "@/components/PushPermission";
import { Heading } from "@/components/shared";
import { Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, SelectField, TextField } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useVoice, VoiceButton } from "@/contexts/VoiceContext";
import { WAKE_PHRASE } from "@/lib/voice-command";
import { useApp } from "@/hooks/useApp";
import { accessRole, href, isSeniorRole } from "@/lib/access";
import { routesApi } from "@/lib/api/routes";
import { sessionsApi } from "@/lib/api/sessions";
import { canUseLocalRoutes, prepareStoredRoute } from "@/lib/stored-routes";
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
  GeoPoint,
  PageMeta,
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
  const secondaryFeatures: [string, string, string, string][] =
    r === "user"
      ? [
          ["users", "Keluarga & Kontak Darurat", "caregiver-link", "Atur tautan keluarga dan nomor darurat"],
          ["message-square", "Komunitas Lansia", "communities", "Diskusi warga, relawan, dan kabar jalur"],
          ["bookmark", "Rute Tersimpan", "saved", "Daftar rute favorit Anda"],
          ["history", "Riwayat Perjalanan", "history", "Catatan perjalanan sebelumnya"],
          ["building-2", "Katalog & Skor Gedung", "place", "Rincian fasilitas gedung yang sudah disurvei"],
          ["git-compare", "Bandingkan Rute Profil", "compare", "Lihat perbedaan jalur antar kondisi jalan"],
        ]
      : [];
  const rows = (
    [
      ["user", "Profil Saya", "account", ALL],
      ["accessibility", "Kondisi Anda", "profile", ["user"]],
      ["languages", "Bahasa & Suara", "voice-settings", ["user", "caregiver"]],
      ["bell", "Notifikasi", "notification-settings", ALL],
      ["shield-check", "Privasi & Izin", "privacy", ALL],
      ["circle-help", "Bantuan & Panduan", "help", ALL],
      ["log-out", "Keluar", "landing", ALL],
    ] as [string, string, string, string[]][]
  ).filter((x) => x[3].includes(r));
  return (
    <div className="content-page narrow">
      <Heading title="Menu & Pengaturan" subtitle="Fitur tambahan, pengaturan akun, suara, dan privasi Anda." back="" />
      {secondaryFeatures.length ? (
        <section className="card setting-list mb-[16px]" aria-labelledby="secondary-menu-heading">
          <h2 id="secondary-menu-heading" className="px-[4px] pt-[4px]">
            Menu & Fitur Lainnya
          </h2>
          <hr className="divider" />
          {secondaryFeatures.map(([i, t, rt, sub]) => (
            <Link key={rt} className="list-item" href={href(rt)}>
              <Icon name={i} />
              <div>
                <strong>{t}</strong>
                <small>{sub}</small>
              </div>
              <Icon name="chevron-right" />
            </Link>
          ))}
        </section>
      ) : null}
      <section className="card setting-list" aria-labelledby="account-settings-heading">
        <div className="profile-card">
          <Avatar name={state.name} big />
          <div>
            <h2 id="account-settings-heading">{state.name}</h2>
            <p>{ROLE_LABEL[r]}</p>
          </div>
        </div>
        <hr className="divider" />
        {rows.map(([i, t, rt]) => (
          <Link
            key={rt}
            className="list-item"
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
          Nama, kondisi perjalanan, dan mode berbagi lokasi Anda disimpan di server Unstoppable. Rute tersimpan dan riwayat perjalanan akun disimpan di server. Data tamu dan rute yang disimpan saat offline tetap berada di perangkat ini. Pengenalan suara mengikuti layanan dan kebijakan browser Anda.
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
  const voice = useVoice();
  const statusLabel = voice.wanted
    ? voice.listening
      ? voice.mode === "wake"
        ? `Aktif (${WAKE_PHRASE})`
        : "Mendengarkan"
      : "Dijeda sementara"
    : "Mikrofon nonaktif";
  const statusKind = voice.wanted ? (voice.listening ? "green" : "yellow") : "";
  const statusIcon = voice.wanted ? (voice.listening ? "mic" : "pause") : "mic-off";

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
        <div className="row between">
          <h2>Kendali suara</h2>
          <span role="status" aria-live="polite">
            <Badge label={statusLabel} kind={statusKind} icon={statusIcon} />
          </span>
        </div>
        <p>
          Aktifkan mikrofon secara sadar setelah menekan tombol dan memberi izin browser. Anda dapat memilih kendali langsung atau mode frasa
          panggil opsional <strong>“{WAKE_PHRASE}”</strong>.
        </p>
        <div className="row">
          <VoiceButton mode="control" className={voice.wanted && voice.mode === "control" ? "btn" : "btn primary"}>
            <Icon name="mic" />
            {voice.wanted && voice.mode === "control" ? "Hentikan kendali suara" : "Mulai kendali suara"}
          </VoiceButton>
          <VoiceButton mode="wake" className={voice.wanted && voice.mode === "wake" ? "btn primary" : "btn"}>
            <Icon name="radio" />
            {voice.wanted && voice.mode === "wake" ? `Hentikan ${WAKE_PHRASE}` : `Mode "${WAKE_PHRASE}"`}
          </VoiceButton>
          <Btn
            label="Berhenti"
            action="stop-voice"
            icon="mic-off"
            disabled={!voice.wanted && !voice.listening}
            onClick={() => voice.stop()}
          />
          <VoiceButton mode="help" className="btn">
            Panduan perintah
          </VoiceButton>
        </div>
        <div className="notice">
          <strong>Batasan browser &amp; privasi:</strong> Mikrofon hanya aktif saat tab ini terbuka di layar depan dan otomatis berhenti saat tab
          disembunyikan, aplikasi berpindah ke latar belakang, atau layar terkunci. Audio diproses layanan pengenalan suara browser (sering
          memerlukan internet dan dukungan browser bervariasi); transkrip dan audio tidak disimpan oleh aplikasi. Ucapan tanpa tombol konfirmasi
          tidak akan mengirim SOS, memesan pendamping, atau mengirim formulir.
        </div>
        <ul className="list">
          <li>“{WAKE_PHRASE}, buka beranda” atau ucapkan “{WAKE_PHRASE}” lalu satu perintah dalam 8 detik</li>
          <li>“Cari Puskesmas Mergangsan” atau “Buka AI Planner”</li>
          <li>“Mulai perjalanan”, “Ulangi petunjuk”, “Langkah berikutnya”</li>
          <li>“Berhenti mendengarkan” atau “Matikan mikrofon”</li>
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
    const timer = setInterval(() => void load(1), fallback ? FALLBACK_POLL_MS : 60_000);
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

type StoredItem = {
  id: string;
  name: string;
  sub: string;
  local: boolean;
  origin?: GeoPoint;
  destination?: GeoPoint;
};
type StoredPage = { items: StoredItem[]; meta?: PageMeta };

export function StoredScreen({ kind }: { kind: "saved" | "history" }) {
  const { user, status, error, restore } = useAuth();
  // Changing accounts or screens drops every previous response and pending UI state.
  return <StoredContent key={`${user?.id ?? status}:${kind}`} kind={kind}
    authenticated={status === "authenticated"} waiting={status === "loading" && !error}
    authError={error} restore={restore} />;
}

function StoredContent({ kind, authenticated, waiting, authError, restore }: {
  kind: "saved" | "history"; authenticated: boolean; waiting: boolean;
  authError: ApiError | null; restore: () => Promise<void>;
}) {
  const { state, update, openPlace, openLocation, calculateRoute, toast, confirmModal } = useApp();
  const history = kind === "history";
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const query = useApiQuery<StoredPage>(authenticated ? async () => {
    if (history) {
      const result = await sessionsApi.history(page);
      return { items: result.data.map((s) => ({
        id: s.id, name: s.destinationName || "Tujuan perjalanan", local: false,
        origin: s.origin, destination: s.destination,
        sub: `${notificationTime(s.startedAt)} WIB, ${s.durationMin} menit · ${s.status === "completed" ? "Selesai" : s.status === "cancelled" ? "Dibatalkan" : "SOS"}`,
      })), meta: result.meta };
    }
    return { items: (await routesApi.saved()).map((r) => ({ ...r, local: false, sub: "Tersimpan di akun Anda" })) };
  } : null, [authenticated, history, page]);
  const local = canUseLocalRoutes(authenticated, query.error);
  const localItems: StoredItem[] = history
    ? state.history.map((h, i) => ({ id: `history:${i}`, name: h.destination, sub: `${h.date}${h.duration ? `, ${h.duration} menit` : ""} · Perangkat ini`, local: true }))
    : [
      ...state.offlineSavedRoutes.map((r) => ({ ...r, sub: "Tersimpan di perangkat ini", local: true })),
      ...state.saved.filter((name) => !state.offlineSavedRoutes.some((r) => r.name === name))
        .map((name) => ({ id: `legacy:${name}`, name, sub: "Tersimpan di perangkat ini", local: true })),
    ];
  // Keep explicit device saves visible after reconnecting; never silently upload them.
  const cloudItems = query.data?.items;
  const items = (cloudItems
    ? [...cloudItems, ...(!history ? localItems.filter((item) => item.id.startsWith("local:")) : [])]
    : local ? localItems : []).filter((r) => !removed.includes(r.id));
  const loading = waiting || query.loading;
  const error = query.error ?? authError;
  const showItems = !waiting && (query.data !== undefined || local);

  const open = (item: StoredItem) => {
    if (item.origin && item.destination) {
      if (query.error?.code === "NETWORK" || authError?.code === "NETWORK" || (typeof navigator !== "undefined" && !navigator.onLine)) {
        openLocation({ name: item.name, address: "Tujuan rute tersimpan", coord: item.destination.coordinates, source: "saved" });
        return;
      }
      prepareStoredRoute({ id: item.id, name: item.name, origin: item.origin, destination: item.destination });
      update({ destination: item.name });
      calculateRoute(item.name);
    } else openPlace(item.name);
  };
  const remove = (item: StoredItem) => {
    confirmModal("Hapus rute tersimpan", `Hapus rute ${item.name}${item.local ? " dari perangkat ini" : " dari akun Anda"}?`, async () => {
      if (item.local) {
        update((s) => ({ saved: s.saved.filter((name) => name !== item.name), offlineSavedRoutes: s.offlineSavedRoutes.filter((r) => r.id !== item.id) }));
        toast("Rute lokal dihapus.");
        return;
      }
      setDeleting(item.id);
      try {
        await routesApi.deleteSaved(item.id);
        setRemoved((ids) => [...ids, item.id]);
        toast("Rute dihapus dari akun.");
      } catch (e) {
        toast(errorMessage(e));
      } finally {
        setDeleting(null);
      }
    });
  };
  return (
    <div className="content-page narrow">
      <Heading title={history ? "Riwayat perjalanan" : "Rute tersimpan"} back="settings" />
      <section className="card stack" aria-busy={loading}>
        {loading && <p role="status">Memuat {history ? "riwayat perjalanan" : "rute tersimpan"}…</p>}
        {error && <div className="notice" role="alert">
          <p>{error.message}</p>
          {query.data ? <p>Menampilkan data terakhir yang berhasil dimuat.</p> : local ? <p>Menampilkan data lokal perangkat ini. Data akun belum dapat dimuat.</p> : null}
          <Btn label="Coba lagi" kind="sm" disabled={loading} onClick={authenticated ? query.reload : () => void restore()} />
        </div>}
        {!authenticated && !waiting && !error && <p className="notice">Mode tamu: hanya data perangkat ini. Masuk untuk melihat rute dan riwayat akun Anda.</p>}
        {showItems && !!items.length && <ul className="list">
          {items.map((item) => <li key={item.id} className="list-item">
            <Circle icon={history ? "history" : "bookmark"} />
            <div><strong>{item.name}</strong><small>{item.sub}</small></div>
            <Btn label="Lihat" action="select-destination" kind="sm primary" aria-label={`Lihat rute ${item.name}`} onClick={() => open(item)} />
            {!history && <Btn label={deleting === item.id ? "Menghapus…" : "Hapus"} kind="sm danger"
              aria-label={`Hapus rute ${item.name}`} disabled={deleting !== null} onClick={() => remove(item)} />}
          </li>)}
        </ul>}
        {showItems && !loading && !items.length && <EmptyState
          title={history ? "Belum ada riwayat perjalanan" : "Belum ada rute tersimpan"}
          text={history ? "Perjalanan yang telah berakhir akan muncul di sini." : "Simpan rute dari halaman pratinjau."}
          label="Cari rute" route="home" />}
        {history && query.data?.meta && query.data.meta.totalPages > 1 && <div className="row">
          <Btn label="Sebelumnya" kind="sm" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)} />
          <span role="status">Halaman {query.data.meta.page} dari {query.data.meta.totalPages}</span>
          <Btn label="Berikutnya" kind="sm" disabled={loading || page >= query.data.meta.totalPages} onClick={() => setPage((p) => p + 1)} />
        </div>}
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
