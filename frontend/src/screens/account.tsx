"use client";

import Link from "next/link";
import { Heading } from "@/components/shared";
import { Avatar, Btn, Circle, EmptyState, Icon, LinkBtn, SelectField, TextField } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { VoiceButton } from "@/contexts/VoiceContext";
import { useApp } from "@/hooks/useApp";
import { accessRole, href } from "@/lib/access";
import { patchMe } from "@/lib/api/users";
import { errorMessage } from "@/lib/api-client";
import { PROFILES, ROLE_LABEL } from "@/lib/data";
import { clearSaved, INITIAL, SERVER_KEYS, sharingText, type DemoState, type Sharing } from "@/lib/demo-state";

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
        <TextField label="Nama" name="name" value={state.name} placeholder="Nama Anda" required inputProps={{ minLength: 2, maxLength: 100 }} />
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

export function PrivacyScreen() {
  const { state, update, go, toast, confirmModal } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Privasi & izin" subtitle="Anda mengendalikan informasi yang dibagikan." back="settings" />
      <form
        className="card stack"
        data-form="privacy"
        onSubmit={(e) => {
          e.preventDefault();
          update({ sharing: String(new FormData(e.currentTarget).get("sharing") || "") as Sharing });
          toast("Preferensi berbagi lokasi tersimpan.");
        }}
      >
        <h2>{state.contactName || "Belum ada keluarga tertaut"}</h2>
        <SelectField
          label="Berbagi lokasi dengan anggota keluarga"
          name="sharing"
          options={[
            ["sos_only", "Hanya saat darurat"],
            ["trip_only", "Hanya selama perjalanan"],
            ["always", "Selalu dengan persetujuan"],
          ]}
          value={state.sharing}
        />
        <div className="notice">{sharingText(state)}</div>
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
          Nama dan kondisi perjalanan Anda disimpan di server Unstoppable. Laporan, tautan keluarga, dan riwayat di aplikasi ini masih
          data demo yang disimpan pada browser ini. Pengenalan suara mengikuti layanan dan kebijakan browser Anda.
        </p>
        <button type="submit" className="btn primary">
          Simpan preferensi
        </button>
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

export function NotificationsScreen() {
  return (
    <div className="content-page narrow">
      <Heading title="Notifikasi" subtitle="Pembaruan perjalanan dan komunitas." back="home" />
      <section className="card">
        <ul className="list">
          <li className="list-item">
            <Circle icon="handshake" />
            <div>
              <strong>Penawaran pendampingan</strong>
              <small>Rina bersedia membantu perjalanan Anda.</small>
            </div>
            <LinkBtn label="Lihat" route="volunteer-offers" kind="sm" />
          </li>
          <li className="list-item">
            <Circle icon="shield-check" />
            <div>
              <strong>Data jalur diperbarui</strong>
              <small>Survei terbaru jalur Puskesmas Mergangsan, 5 September 2026.</small>
            </div>
            <LinkBtn label="Lihat" route="preview" kind="sm" />
          </li>
        </ul>
      </section>
    </div>
  );
}

export function NotificationSettingsScreen() {
  const { state, update, toast } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Pengaturan Notifikasi" back="settings" />
      <section className="card stack">
        {["Permintaan pendampingan", "Pembaruan rute", "Kegiatan komunitas", "Peringatan SOS"].map((t) => (
          <div key={t} className="row between">
            <span>{t}</span>
            <input
              className="switch"
              type="checkbox"
              data-notification-setting=""
              aria-label={t}
              checked={state.notificationPreferences?.[t] !== false}
              onChange={(e) => {
                update((s) => ({ notificationPreferences: { ...s.notificationPreferences, [t]: e.target.checked } }));
                toast("Preferensi notifikasi demo diperbarui.");
              }}
            />
          </div>
        ))}
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
            Tautkan anggota keluarga, lalu pilih berbagi selama perjalanan, hanya saat darurat, atau selalu. Mode yang Anda pilih terlihat
            pada halaman Keluarga.
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
