"use client";

import { useEffect, useState } from "react";
import { Heading, CommunityCta } from "@/components/shared";
import { AreaField, Badge, Btn, Circle, EmptyState, FileInput, Icon, LinkBtn } from "@/components/ui";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import type { LocationValue } from "@/lib/geocode";
import { useApp } from "@/hooks/useApp";
import { CATEGORIES } from "@/lib/data";

export function ReportScreen() {
  const { state, update, go } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Laporkan Hambatan" subtitle="Bantu komunitas dengan melaporkan kondisi jalur." />
      <section className="card stack">
        <h3>Pilih kategori hambatan</h3>
        <div className="category-grid">
          {CATEGORIES.map(([t, i]) => (
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
        <p className="small">Hanya kategori yang wajib diisi. Detail tambahan bersifat opsional.</p>
      </section>
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

export function ReportList() {
  const { state } = useApp();
  return (
    <ul className="list">
      {state.reports.map((r) => (
        <li key={r.id} className="list-item">
          <Circle icon="octagon-alert" />
          <div>
            <strong>{r.category}</strong>
            <small>
              {r.location}, {r.severity}
            </small>
          </div>
          <Badge label={r.status} kind="yellow" />
          <small>{r.corroboration_count || 0} penguat</small>
        </li>
      ))}
    </ul>
  );
}

export function MyReportsScreen() {
  const { state } = useApp();
  return (
    <div className="content-page narrow">
      <Heading
        title="Laporan saya"
        subtitle="Informasi jalur untuk perjalanan lansia sehari-hari."
        back="home"
        actions={<LinkBtn label="Lapor baru" route="report" kind="primary" icon="plus" />}
      />
      <section className="card">
        {state.reports.length ? (
          <ReportList />
        ) : (
          <EmptyState
            title="Belum ada laporan"
            text="Laporan kondisi jalan membantu pengguna lain memilih rute."
            label="Buat laporan"
            route="report"
          />
        )}
      </section>
    </div>
  );
}
