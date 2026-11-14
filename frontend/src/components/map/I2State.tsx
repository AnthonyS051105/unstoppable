"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, EmptyState } from "@/components/ui";
import { live, loadBuildings, setRouteOrigin, useLive } from "@/lib/live";
import { allPlaces } from "@/lib/places";

export function CatalogueState() {
  useLive();
  const { status, error } = live.catalogue;
  if (status === "ready") return null;
  return (
    <section className="card stack" aria-live="polite" aria-busy={status === "idle" || status === "loading"}>
      {status === "error" ? (
        <>
          <p role="alert">{error}</p>
          <Btn label="Coba muat gedung lagi" onClick={() => void loadBuildings()} />
        </>
      ) : status === "empty" ? (
        <EmptyState title="Belum ada gedung" text="Area ini belum memiliki gedung terdata. Rute belum dapat direncanakan." label="Cari lokasi lain" route="search" />
      ) : (
        <>
          <div className="skeleton line" aria-hidden="true" />
          <p>Memuat gedung…</p>
        </>
      )}
    </section>
  );
}

/** GPS is read after a user action; a catalogue point never masquerades as GPS. */
export function RouteOriginPicker() {
  useLive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const places = allPlaces();
  const options = places.map((p) => ({ id: p.id, name: p.name }));
  // A viewport update must not make an already chosen origin disappear from the control.
  if (live.origin?.id && !options.some((p) => p.id === live.origin?.id)) {
    options.unshift({ id: live.origin.id, name: live.origin.label });
  }

  const gps = () => {
    const current = ++request.current;
    setError("");
    if (!navigator.geolocation) {
      setError("GPS tidak tersedia. Pilih titik asal dari daftar.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (current !== request.current) return;
        setRouteOrigin({ label: "Lokasi GPS Anda", point: { type: "Point", coordinates: [p.coords.longitude, p.coords.latitude] } });
        setBusy(false);
      },
      (e) => {
        if (current !== request.current) return;
        setError(e.code === 1
          ? "Izin GPS ditolak. Pilih titik asal dari daftar atau ubah izin lokasi browser."
          : "GPS belum tersedia. Pilih titik asal dari daftar atau coba GPS lagi.");
        setBusy(false);
      },
      { timeout: 8000, maximumAge: 0 },
    );
  };

  return (
    <section className="card stack" aria-label="Titik asal rute">
      <label className="field">
        <span>Dari</span>
        <select
          aria-label="Titik asal rute"
          value={live.origin?.label === "Lokasi GPS Anda" ? "gps" : live.origin?.id ?? ""}
          onChange={(e) => {
            request.current++;
            setBusy(false);
            setError("");
            if (e.target.value === live.origin?.id) return;
            const p = places.find((p) => p.id === e.target.value);
            setRouteOrigin(p?.coord ? { id: p.id, label: p.name, point: { type: "Point", coordinates: p.coord } } : null);
          }}
        >
          <option value="">Pilih titik asal</option>
          {live.origin?.label === "Lokasi GPS Anda" ? <option value="gps">Lokasi GPS Anda</option> : null}
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <Btn label={busy ? "Mengambil lokasi…" : "Gunakan lokasi GPS saya"} icon="locate-fixed" disabled={busy} onClick={gps} />
      <p role="status">
        {live.origin ? `Asal rute: ${live.origin.label}.` : "Pilih titik asal. Lokasi GPS Anda tidak akan diganti secara otomatis dengan titik kampus."}
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
