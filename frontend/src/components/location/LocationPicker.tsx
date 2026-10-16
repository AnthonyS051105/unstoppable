"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Btn, Circle, Icon } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { DEMO_DESTINATION, type Coord } from "@/lib/geo";
import { coordText, GeocoderUnavailable, reverseLocation, searchLocations, type LocationValue } from "@/lib/geocode";

const LocationConfirmMap = dynamic(() => import("./LocationConfirmMap"), { ssr: false });

export type Shortcut = { label: string; detail: string; icon: string; value: LocationValue };

type Props = {
  title: string;
  subtitle: string;
  initial: LocationValue | null;
  shortcuts?: Shortcut[];

  allowSave?: boolean;
  onPick: (v: LocationValue) => void;
  onCancel: () => void;
};

export function LocationPicker({ title, subtitle, initial, shortcuts = [], allowSave, onPick, onCancel }: Props) {
  const { state, update, toast } = useApp();
  const [step, setStep] = useState<"search" | "confirm">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationValue[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [draft, setDraft] = useState<LocationValue | null>(initial);
  const [note, setNote] = useState(initial?.note || "");
  const [save, setSave] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Rumah");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reverseAbort = useRef<AbortController | null>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => headingRef.current?.focus(), [step]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchLocations(q, ctrl.signal);
        setResults(r);
        setSearchFailed(false);
        setStatus(r.length ? `${r.length} hasil ditemukan.` : "Alamat belum ditemukan. Coba kata lain, atau pilih langsung di peta.");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setResults([]);
        setSearchFailed(true);
        setStatus(
          e instanceof GeocoderUnavailable
            ? e.message
            : "Pencarian alamat sedang tidak tersedia. Pilih langsung di peta atau gunakan lokasi Anda.",
        );
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const shortQuery = query.trim().length > 0 && query.trim().length < 3;

  const confirm = (v: LocationValue) => {
    setDraft(v);
    setNote(v.note || "");
    setStep("confirm");
  };

  const pickOnMap = () =>
    confirm(draft || { name: "Lokasi pada peta", address: coordText(DEMO_DESTINATION), coord: DEMO_DESTINATION, source: "map" });

  const useGps = () => {
    if (!navigator.geolocation) {
      setStatus("Perangkat ini tidak menyediakan lokasi. Cari alamat atau pilih di peta.");
      return;
    }
    setStatus("Mencari lokasi Anda…");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const coord: Coord = [p.coords.longitude, p.coords.latitude];
        let v: LocationValue = { name: "Lokasi saya saat ini", address: coordText(coord), coord, source: "gps" };
        try {
          const r = await reverseLocation(coord);
          v = { ...r, source: "gps" };
        } catch {}
        setStatus("");
        confirm(v);
      },
      () => setStatus("Lokasi perangkat tidak tersedia atau izin ditolak. Cari alamat atau pilih di peta."),
      { timeout: 8000, enableHighAccuracy: true },
    );
  };

  const onPinMove = (coord: Coord) => {
    if (!draft || (Math.abs(coord[0] - draft.coord[0]) < 1e-7 && Math.abs(coord[1] - draft.coord[1]) < 1e-7)) return;
    setDraft((d) => (d ? { ...d, coord, name: "Lokasi pada peta", address: "Mencari alamat…", source: "map" } : d));
    clearTimeout(reverseTimer.current);
    reverseAbort.current?.abort();
    reverseTimer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      reverseAbort.current = ctrl;
      try {
        const r = await reverseLocation(coord, ctrl.signal);
        setDraft((d) => (d ? { ...d, name: r.name, address: r.address } : d));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setDraft((d) => (d ? { ...d, address: coordText(coord) } : d));
      }
    }, 600);
  };

  const finish = () => {
    if (!draft) return;
    const v = { ...draft, note: note.trim() || undefined };
    if (save && allowSave) {
      const label = saveLabel.trim() || "Alamat tersimpan";
      update((s) => ({ savedLocations: [{ ...v, label }, ...s.savedLocations.filter((x) => x.label !== label)].slice(0, 5) }));
      toast(`Alamat disimpan sebagai ${label}.`);
    }
    onPick(v);
  };

  const row = (key: string, icon: string, name: string, detail: string, onClick: () => void) => (
    <li key={key}>
      <button type="button" className="row-link" onClick={onClick}>
        <Circle icon={icon} />
        <span>
          <strong>{name}</strong>
          <small>{detail}</small>
        </span>
        <Icon name="chevron-right" />
      </button>
    </li>
  );

  return (
    <div className="content-page narrow">
      <div className="page-heading">
        <Btn
          kind="btn-round"
          icon="chevron-left"
          aria-label={step === "confirm" ? "Kembali ke pencarian alamat" : "Kembali ke formulir"}
          onClick={() => (step === "confirm" ? setStep("search") : onCancel())}
        />
        <div>
          <h1 tabIndex={-1} ref={headingRef}>
            {step === "confirm" ? "Pastikan titiknya" : title}
          </h1>
          <p>{step === "confirm" ? "Ketuk peta di titik yang dimaksud, atau seret penandanya." : subtitle}</p>
        </div>
      </div>

      {step === "search" ? (
        <section className="card stack">
          <label className="field">
            <span>Cari alamat atau nama tempat</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setStatus("");
                setSearchFailed(false);
              }}
              placeholder="Contoh: Jl. Tamansiswa 25 atau Puskesmas Mergangsan"
              autoComplete="street-address"
              aria-describedby="loc-status"
            />
          </label>
          <p id="loc-status" className="small" role="status" aria-live="polite">
            {loading ? "Mencari…" : shortQuery ? "Ketik minimal 3 huruf." : status}
          </p>
          {!shortQuery && query.trim() && results.length ? (
            <ul className="list" aria-label="Hasil pencarian alamat">
              {results.map((r, i) => row("r" + i, "map-pin", r.name, r.address, () => confirm(r)))}
            </ul>
          ) : null}
          {!shortQuery && query.trim() && searchFailed ? (
            <ul className="list" aria-label="Pilihan lain">
              {row("map-fallback", "map", "Pilih langsung di peta", "Geser peta ke titik yang Anda inginkan", pickOnMap)}
              {row("gps-fallback", "locate-fixed", "Gunakan lokasi saya saat ini", "Memakai lokasi perangkat, izin lokasi diminta", useGps)}
            </ul>
          ) : null}
          {!query.trim() ? (
            <>
              <ul className="list" aria-label="Pilihan cepat">
                {row("gps", "locate-fixed", "Gunakan lokasi saya saat ini", "Memakai lokasi perangkat, izin lokasi diminta", useGps)}
                {row("map", "map", "Pilih langsung di peta", "Geser peta ke titik yang Anda inginkan", pickOnMap)}
                {shortcuts.map((s) => row("s" + s.label, s.icon, s.label, s.detail, () => confirm(s.value)))}
              </ul>
              {state.savedLocations.length ? (
                <>
                  <h2 className="text-[16px]">Alamat tersimpan</h2>
                  <ul className="list" aria-label="Alamat tersimpan">
                    {state.savedLocations.map((s) =>
                      row(
                        "saved" + s.label,
                        s.label === "Rumah" ? "house" : "bookmark",
                        s.label,
                        [s.name, s.address].filter(Boolean).join(", "),
                        () => confirm({ ...s, source: "saved" }),
                      ),
                    )}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
          <p className="small">
            Pencarian alamat memakai data OpenStreetMap. Teks yang Anda ketik dikirim ke layanan pencarian alamat tersebut.
          </p>
        </section>
      ) : draft ? (
        <section className="card stack">
          <p id="loc-map-help" className="small">
            Ketuk atau klik peta untuk memindahkan penanda ke titik itu, atau seret penanda. Peta tetap bisa digeser. Dengan keyboard:
            fokuskan penanda lalu gunakan tombol panah.
          </p>
          <LocationConfirmMap
            value={draft.coord}
            onChange={onPinMove}
            label={`Peta penentuan titik. Titik saat ini: ${draft.name}`}
            describedBy="loc-map-help"
          />
          <ul className="list">
            <li className="list-item" aria-live="polite">
              <Circle icon="map-pin" />
              <div>
                <strong>{draft.name}</strong>
                <small>{draft.address}</small>
              </div>
            </li>
          </ul>
          <label className="field">
            <span>Patokan atau catatan (opsional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Misalnya pagar hijau, sebelah warung" />
          </label>
          {allowSave ? (
            <>
              <label className="check">
                <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
                Simpan alamat ini untuk lain kali
              </label>
              {save ? (
                <label className="field">
                  <span>Nama alamat</span>
                  <input value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} placeholder="Rumah, Rumah anak, Kantor" />
                </label>
              ) : null}
            </>
          ) : null}
          <div className="row">
            <Btn label="Pilih lokasi ini" action="location-confirm" kind="primary" icon="check" onClick={finish} />
            <Btn label="Cari alamat lain" action="location-search" onClick={() => setStep("search")} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function LocationField({
  id,
  label,
  value,
  placeholder,
  error,
  onOpen,
}: {
  id: string;
  label: string;
  value: LocationValue | null;
  placeholder: string;
  error?: string;
  onOpen: () => void;
}) {
  const detail = value
    ? [value.address, value.note ? `Patokan: ${value.note}` : ""].filter(Boolean).join(". ")
    : "Ketuk untuk mencari alamat atau memilih di peta";
  return (
    <div className="field">
      <span id={`${id}-label`}>{label}</span>
      <ul className="list">
        <li>
          <button
            type="button"
            id={id}
            className="row-link"
            aria-labelledby={`${id}-label ${id}-value`}
            aria-describedby={error ? `${id}-error` : undefined}
            onClick={onOpen}
          >
            <Circle icon={value ? "map-pin" : "search"} />
            <span id={`${id}-value`}>
              <strong>{value ? value.name : placeholder}</strong>
              <small>{detail}</small>
            </span>
            <span className="link">{value ? "Ubah" : "Pilih"}</span>
          </button>
        </li>
      </ul>
      {error ? (
        <div id={`${id}-error`} className="inline-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
