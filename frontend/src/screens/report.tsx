"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { reportsApi, createReportData, validateReportPhotos } from "@/lib/api/reports";
import { ApiError, errorMessage } from "@/lib/api-client";
import { live, useLive } from "@/lib/live";
import { TILE_URL, toLeaflet } from "@/lib/geo";
import { REPORT_CATEGORIES, REPORT_SEVERITIES, REPORT_STATUS_LABEL, REPORT_EFFECT_LABEL, categoryLabel, severityLabel, type RoadReport, type CreatedReport, type OwnReport } from "@/types/reports";
import { Heading, CommunityCta } from "@/components/shared";
import { AreaField, Badge, Btn, Circle, EmptyState, FileInput, Icon, LinkBtn } from "@/components/ui";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import { coordText, type LocationValue } from "@/lib/geocode";
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

// Konfirmasi terakhir hanya berada dalam memori tab dan terikat pemiliknya.
// Riwayat tetap diambil dari server; kunjungan langsung bukan bukti keberhasilan.
let confirmedReport: { ownerId: string; report: CreatedReport } | null = null;

export function ReportConfirmScreen() {
  const { user } = useAuth();
  return user ? <ReportForm key={user.id} ownerId={user.id} /> : null;
}

function ReportForm({ ownerId }: { ownerId: string }) {
  const { state, go } = useApp();
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [ambiguous, setAmbiguous] = useState(false);
  const request = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);
  useEffect(() => () => request.current?.abort(), []);

  const selectPhotos = (files: File[]) => {
    setFileError("");
    try {
      validateReportPhotos(files);
      setPhotos(files);
      setPreviews(files.map(f => URL.createObjectURL(f)));
    } catch (e) {
      setPhotos([]); setPreviews([]); setFileError(errorMessage(e));
    }
  };
  const closePicker = () => {
    setPicking(false);
    setTimeout(() => document.getElementById("loc-report")?.focus(), 0);
  };
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (request.current || busy || fileError) return;
    const fd = new FormData(e.currentTarget);
    let sending = false;
    const controller = new AbortController();
    try {
      const input = createReportData({ point: location?.coord ?? null, category: state.reportCategory,
        severity: String(fd.get("severity") || ""), description: String(fd.get("description") || "") });
      request.current = controller;
      setError(""); setAmbiguous(false); setBusy(true);
      confirmedReport = null;
      sending = true;
      const report = await reportsApi.create(input, photos, controller.signal);
      if (controller.signal.aborted) return;
      confirmedReport = { ownerId, report };
      go("report-sent");
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(errorMessage(e));
      setAmbiguous(sending && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500));
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <>
    {picking ? <LocationPicker title="Lokasi hambatan"
      subtitle="Di mana hambatan ini berada? Cari alamat, gunakan lokasi Anda, atau ketuk peta."
      initial={location} onPick={v => { setLocation(v); closePicker(); }} onCancel={closePicker} /> : null}
    <div className="content-page narrow" hidden={picking}>
      <Heading title="Konfirmasi laporan" subtitle={state.reportCategory} back="report" />
      <form className="card stack" data-form="report" onSubmit={onSubmit} aria-busy={busy}>
        <fieldset className="stack" disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <Badge label={state.reportCategory} kind="yellow" icon="octagon-alert" />
          <LocationField id="loc-report" label="Lokasi hambatan" value={location}
            placeholder="Pilih lokasi hambatan" onOpen={() => setPicking(true)} />
          <fieldset className="severity-group">
            <legend>Tingkat keparahan</legend>
            {REPORT_SEVERITIES.map(({ label: t }) => <label key={t} className="choice">
              <input type="radio" name="severity" value={t} required defaultChecked={state.severity === t} />{t}
            </label>)}
          </fieldset>
          <FileInput label="Foto (opsional, maksimal 3)" name="photos"
            accept="image/jpeg,image/png,image/webp,image/gif" multiple max={3} buttonLabel="Pilih foto" icon="camera"
            emptyText="Belum ada foto dipilih" hint="JPEG, PNG, WebP, atau GIF. Maksimal 5 MB per foto; foto dikirim bersama laporan."
            onTooMany={() => setFileError("Maksimal 3 foto. Pilih ulang foto Anda.")} onFiles={selectPhotos} />
          {fileError ? <p role="alert" className="inline-error">{fileError}</p> : null}
          <div className="file-previews" id="file-previews">
            {previews.map((u, i) => <img key={u} src={u} alt={`Pratinjau foto laporan ${i + 1}`} />)}
          </div>
          <AreaField label="Deskripsi (opsional)" name="description" placeholder="Ceritakan kondisi yang Anda temui..." />
          <button type="submit" className="btn primary full" disabled={busy || !!fileError}>
            {busy ? "Mengirim laporan…" : ambiguous ? "Kirim ulang setelah memeriksa riwayat" : "Kirim Laporan"}
          </button>
        </fieldset>
        {busy ? <p role="status">Mengirim laporan dan foto. Tunggu konfirmasi server.</p> : null}
        {error ? <p role="alert" className="inline-error" tabIndex={-1} ref={errorRef}>{error}</p> : null}
        {ambiguous ? <div role="status">
          <p>Hasil pengiriman belum dapat dipastikan. Laporan mungkin sudah tersimpan. Periksa laporan saya sebelum mengirim ulang agar tidak duplikat.</p>
          <LinkBtn label="Periksa laporan saya" route="my-reports" />
        </div> : null}
      </form>
    </div>
  </>;
}

export function ReportSentScreen() {
  const { user } = useAuth();
  const report = confirmedReport?.ownerId === user?.id ? confirmedReport?.report : null;
  return <div className="content-page narrow">
    <section className="card empty">
      <Circle icon={report ? "circle-check" : "info"} kind={report ? "green" : "yellow"} />
      <h2>{report ? "Terima kasih." : "Periksa status laporan"}</h2>
      {report ? <>
        <p>Server telah mengonfirmasi laporan Anda tersimpan.</p>
        <Badge label={REPORT_STATUS_LABEL[report.status]} kind="green" />
        <p>{report.photoUrls.length} foto tersimpan. {report.linkedEdgeId
          ? "Laporan terkait segmen jalur. Hitung ulang rute untuk memeriksa dampaknya."
          : "Laporan belum terkait segmen jalur; dampak pada rute belum tersedia."}</p>
      </> : <p>Belum ada konfirmasi pengiriman pada halaman ini. Lihat riwayat untuk memeriksa laporan yang tersimpan.</p>}
      <LinkBtn label="Kembali ke Beranda" route="home" kind="primary" />
      <LinkBtn label="Lihat laporan" route="my-reports" />
      {report ? <CommunityCta variant="report" /> : null}
    </section>
  </div>;
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
  const { user } = useAuth();
  return <div className="content-page narrow">
    <Heading title="Laporan saya" subtitle="Informasi jalur untuk perjalanan lansia sehari-hari." back="home"
      actions={<LinkBtn label="Lapor baru" route="report" kind="primary" icon="plus" />} />
    {user ? <PersonalReports key={user.id} /> : null}
  </div>;
}

function PersonalReports() {
  const [page, setPage] = useState(1);
  const q = useApiQuery(() => reportsApi.mine(page), [page], d => d.data.length === 0);
  const meta = q.data?.meta;
  return <section className="card stack" aria-busy={q.loading}>
    <div aria-live="polite">
      {q.loading ? <p role="status">Memuat laporan saya…</p> : q.error ? <>
        <p role="alert" className="inline-error">{q.error.message}</p>
        <Btn label="Coba lagi laporan saya" onClick={q.reload} />
      </> : q.empty ? <EmptyState title="Belum ada laporan pada halaman ini"
        text="Laporan yang tersimpan atas akun Anda akan tampil di sini, termasuk yang sudah selesai."
        label="Lapor baru" route="report" /> : <ul className="list">{q.data?.data.map(report => <OwnReportRow key={report.id} report={report} />)}</ul>}
    </div>
    {!q.loading && !q.error && meta ? <p role="status">{meta.total} laporan.{meta.totalPages > 0 ? ` Halaman ${meta.page} dari ${meta.totalPages}.` : ""}</p> : null}
    <div className="row">
      <Btn label="Halaman sebelumnya" disabled={page <= 1 || q.loading} onClick={() => setPage(p => p - 1)} />
      <Btn label="Halaman berikutnya" disabled={q.loading || !!q.error || !meta || page >= meta.totalPages} onClick={() => setPage(p => p + 1)} />
    </div>
    <Btn label="Perbarui laporan saya" disabled={q.loading} onClick={q.reload} />
  </section>;
}

function OwnReportRow({ report }: { report: OwnReport }) {
  return <li className="list-item">
    <Circle icon="octagon-alert" />
    <div>
      <strong>{categoryLabel(report.category)}</strong>
      <small>{severityLabel(report.severity)} · {coordText(report.location.coordinates)}</small>
      {report.description ? <p>{report.description}</p> : null}
      <small>{new Date(report.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</small>
      <p>{report.corroborationCount} penguat</p>
      <div className="file-previews">{report.photoUrls.map((url, i) => <a key={`${url}:${i}`} href={url} target="_blank" rel="noreferrer noopener">
        <img src={url} alt={`Foto laporan ${i + 1}: ${categoryLabel(report.category)}`} />
      </a>)}</div>
    </div>
    <Badge label={REPORT_STATUS_LABEL[report.status] ?? report.status} kind="yellow" />
  </li>;
}
