"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { reportsApi } from "@/lib/api/reports";
import { ApiError, errorMessage } from "@/lib/api-client";
import { live, useLive } from "@/lib/live";
import { TILE_URL, toLeaflet } from "@/lib/geo";
import { REPORT_CATEGORIES, REPORT_STATUS_LABEL, REPORT_EFFECT_LABEL, categoryLabel, severityLabel, type RoadReport } from "@/types/reports";
import { Heading, CommunityCta } from "@/components/shared";
import { AreaField, Badge, Btn, Circle, EmptyState, FileInput, Icon, LinkBtn } from "@/components/ui";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import type { LocationValue } from "@/lib/geocode";
import { useApp } from "@/hooks/useApp";


export function ReportScreen() {
  const { state, update, go } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Laporkan Hambatan" subtitle="Bantu komunitas dengan melaporkan kondisi jalur." />
      <section className="card stack">
        <h3>Pilih kategori hambatan</h3>
        <div className="category-grid">
          {REPORT_CATEGORIES.map(({ label: t, icon: i }) => (
            <button
              key={t}
              type="button"
              className={`choice ${state.reportCategory === t ? "selected" : ""}`}
              data-category={t}
              aria-pressed={state.reportCategory === t}
              onClick={() => update({ reportCategory: t })}
            >
              <Icon name={i} />
              <span>{t}</span>
            </button>
          ))}
        </div>
        <Btn label="Lanjutkan" action="report-next" kind="primary full" onClick={() => go("report-confirm")} />
        <p className="small">Kategori, lokasi, dan tingkat keparahan wajib diisi. Foto dan deskripsi bersifat opsional.</p>
      </section>
      <NearbyReports />
      <RouteReports />
    </div>
  );
}

export function ReportConfirmScreen() {
  const { state, update, go, toast } = useApp();
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => () => photos.forEach(URL.revokeObjectURL), [photos]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    update((s) => ({
      reports: [
        {
          id: Date.now(),
          category: s.reportCategory,
          location: location
            ? [location.name, location.address, location.note && `Patokan: ${location.note}`].filter(Boolean).join(", ")
            : "Lokasi tidak diisi",
          point: location?.coord,
          severity: String(fd.get("severity") || ""),
          description: String(fd.get("description") || ""),
          status: "Menunggu verifikasi",
          date: new Date().toISOString(),
        },
        ...s.reports,
      ],
    }));
    go("report-sent");
  };

  return (
    <>
      {picking ? (
        <LocationPicker
          title="Lokasi hambatan"
          subtitle="Di mana hambatan ini berada? Cari alamat, gunakan lokasi Anda, atau ketuk peta."
          initial={location}
          onPick={(v) => {
            setLocation(v);
            setPicking(false);
            setTimeout(() => document.getElementById("loc-report")?.focus(), 0);
          }}
          onCancel={() => {
            setPicking(false);
            setTimeout(() => document.getElementById("loc-report")?.focus(), 0);
          }}
        />
      ) : null}

      <div className="content-page narrow" hidden={picking}>
        <Heading title="Konfirmasi laporan" subtitle={state.reportCategory} back="report" />
        <form className="card stack" data-form="report" onSubmit={onSubmit}>
          <Badge label={state.reportCategory} kind="yellow" icon="octagon-alert" />
          <LocationField
            id="loc-report"
            label="Lokasi hambatan"
            value={location}
            placeholder="Pilih lokasi hambatan"
            onOpen={() => setPicking(true)}
          />
          <fieldset className="severity-group">
            <legend>Tingkat keparahan</legend>
            {["Ringan", "Sedang", "Tinggi"].map((t) => (
              <label key={t} className="choice">
                <input type="radio" name="severity" value={t} defaultChecked={state.severity === t} />
                {t}
              </label>
            ))}
          </fieldset>
          <FileInput
            label="Foto (opsional, maksimal 3)"
            name="photos"
            accept="image/*"
            multiple
            max={3}
            buttonLabel="Pilih foto"
            icon="camera"
            emptyText="Belum ada foto dipilih"
            hint="Foto disimpan sementara selama sesi ini."
            onTooMany={() => toast("Maksimal 3 foto. Pilih ulang foto Anda.")}
            onFiles={(files) => setPhotos(files.map((f) => URL.createObjectURL(f)))}
          />
          <div className="file-previews" id="file-previews">
            {photos.map((u) => (
              <img key={u} src={u} alt="Pratinjau foto laporan" />
            ))}
          </div>
          <AreaField label="Deskripsi (opsional)" name="description" placeholder="Ceritakan kondisi yang Anda temui..." />
          <button type="submit" className="btn primary full">
            Kirim Laporan
          </button>
        </form>
      </div>
    </>
  );
}

export function ReportSentScreen() {
  return (
    <div className="content-page narrow">
      <section className="card empty">
        <Circle icon="circle-check" kind="green" />
        <h2>Terima kasih.</h2>
        <p>Laporan Anda membantu lansia lain. Laporan tersimpan dan menunggu verifikasi.</p>
        <LinkBtn label="Kembali ke Beranda" route="home" kind="primary" />
        <LinkBtn label="Lihat laporan" route="my-reports" />
        <CommunityCta variant="report" />
      </section>
    </div>
  );
}

// Loaded on the client because Leaflet requires the browser DOM.
const ReportsMap = dynamic(async () => {
  const { MapContainer, CircleMarker, Popup, TileLayer } = await import("react-leaflet");
  return function ReportMap({ reports, location }: { reports: RoadReport[]; location: LocationValue }) {
    return (
      <div className="report-location-map">
        <MapContainer center={toLeaflet(location.coord)} zoom={16} keyboard aria-label="Peta laporan sekitar; rincian tersedia pada daftar di bawah" style={{ height: "100%" }}>
          <TileLayer url={TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          {reports.map(r => <CircleMarker key={r.id} center={toLeaflet(r.location.coordinates)} radius={10}>
            <Popup>{categoryLabel(r.category)} — {severityLabel(r.severity)}. {r.description}</Popup>
          </CircleMarker>)}
        </MapContainer>
      </div>
    );
  };
}, { ssr: false });

function ReportRow({ report }: { report: RoadReport }) {
  const { user } = useAuth();
  const [count, setCount] = useState(report.corroborationCount);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const corroborate = async () => {
    if (busy || confirmed) return;
    setBusy(true);
    setError("");
    try {
      const result = await reportsApi.corroborate(report.id);
      setCount(result.corroborationCount);
      setConfirmed(true);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) setConfirmed(true);
    } finally { setBusy(false); }
  };
  return (
    <li className="list-item" aria-busy={busy}>
      <Circle icon="octagon-alert" />
      <div>
        <strong>{categoryLabel(report.category)}</strong>
        <small>{severityLabel(report.severity)}, {Math.round(report.distanceM)} m dari titik pilihan</small>
        {report.description ? <p>{report.description}</p> : null}
        <small>{new Date(report.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</small>
        <p role="status">{count} penguat{confirmed ? ". Sudah dikuatkan." : ""}</p>
        {error ? <p role="alert" className="inline-error">{error}</p> : null}
        <Btn label={busy ? "Menguatkan…" : confirmed ? "Sudah dikuatkan" : "Saya juga menemui hambatan ini"} disabled={!user || busy || confirmed} onClick={corroborate} />
      </div>
      <Badge label={REPORT_STATUS_LABEL[report.status] ?? report.status} kind="yellow" />
    </li>
  );
}

export function ReportList({ reports }: { reports: RoadReport[] }) {
  const { user } = useAuth();
  return <ul className="list">{reports.map(r => <ReportRow key={`${user?.id}:${r.id}:${r.corroborationCount}`} report={r} />)}</ul>;
}

function NearbyResults({ location }: { location: LocationValue }) {
  const q = useApiQuery(() => reportsApi.nearby(location.coord), [location]);
  return <div aria-live="polite" aria-busy={q.loading}>
    {q.loading ? <p role="status">Memuat laporan sekitar…</p> : q.error ? <>
      <p role="alert" className="inline-error">{q.error.message}</p>
      <Btn label="Coba lagi laporan sekitar" onClick={q.reload} />
    </> : q.empty ? <p>Belum ada laporan aktif dalam radius 1 km dari titik pilihan.</p> : q.data ? <>
      <ReportsMap reports={q.data} location={location} />
      <ReportList reports={q.data} />
    </> : null}
    {!q.error ? <Btn label="Perbarui laporan sekitar" disabled={q.loading} onClick={q.reload} /> : null}
  </div>;
}

function NearbyReports() {
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [picking, setPicking] = useState(false);
  const closePicker = () => {
    setPicking(false);
    setTimeout(() => document.getElementById("loc-nearby")?.focus(), 0);
  };
  return <section className="card stack">
    <h2>Laporan sekitar</h2>
    <p>Pilih titik untuk melihat laporan aktif dalam radius 1 km. Kuatkan hanya hambatan yang Anda temui sendiri.</p>
    {picking ? <LocationPicker title="Titik laporan sekitar" subtitle="Pilih area yang ingin diperiksa." initial={location}
      onPick={v => { setLocation(v); closePicker(); }} onCancel={closePicker} /> : null}
    <div hidden={picking}>
      <LocationField id="loc-nearby" label="Titik laporan sekitar" value={location} placeholder="Pilih titik laporan sekitar" onOpen={() => setPicking(true)} />
      {location ? <NearbyResults key={location.coord.join(",")} location={location} /> : <p>Pilih lokasi untuk memuat laporan sekitar.</p>}
    </div>
  </section>;
}

function RouteReports() {
  useLive();
  const edgeIds = live.plan?.route.edgeIds ?? [];
  if (!edgeIds.length) return null;
  return <RouteReportResults key={edgeIds.join(",")} edgeIds={edgeIds} />;
}

function RouteReportResults({ edgeIds }: { edgeIds: string[] }) {
  const q = useApiQuery(() => reportsApi.alongRoute(edgeIds), [edgeIds]);
  return <section className="card stack" aria-live="polite" aria-busy={q.loading}>
    <h2>Hambatan pada rute terakhir</h2>
    <p>Daftar ini mengikuti segmen rencana rute terakhir. Hitung ulang rute setelah kondisi jalur berubah.</p>
    {q.loading ? <p role="status">Memuat hambatan rute…</p> : q.error ? <>
      <p role="alert">{q.error.message}</p><Btn label="Coba lagi hambatan rute" onClick={q.reload} />
    </> : q.empty ? <p>Belum ada laporan aktif yang terkait segmen rute ini.</p> : <ul className="list">{q.data?.map(r => <li className="list-item" key={`${r.id}:${r.edgeId}`}>
      <div><strong>{categoryLabel(r.category)}</strong><small>{severityLabel(r.severity)}, segmen {r.edgeId}</small></div>
      <Badge label={REPORT_EFFECT_LABEL[r.effect] ?? r.effect} kind="yellow" />
    </li>)}</ul>}
    <Btn label="Perbarui hambatan rute" onClick={q.reload} />
  </section>;
}

export function MyReportsScreen() {
  return (
    <div className="content-page narrow">
      <Heading title="Laporan saya" subtitle="Informasi jalur untuk perjalanan lansia sehari-hari." back="home"
        actions={<LinkBtn label="Lapor baru" route="report" kind="primary" icon="plus" />} />
      <section className="card">
        <EmptyState title="Daftar laporan saya belum tersedia" text="Riwayat laporan pribadi belum tersedia dari layanan. Laporan sekitar dapat dilihat terpisah melalui halaman lapor." label="Lihat laporan sekitar" route="report" />
      </section>
    </div>
  );
}
