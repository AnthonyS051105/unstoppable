"use client";

import Link from "next/link";
import { CatalogueState, RouteOriginPicker } from "@/components/map/I2State";
import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import {
  FamilyStatus,
  MiniProfiles,
  RoutePreferences,
} from "@/components/shared";
import { PlannedTripsBlock } from "@/components/trips/PlannedTrips";
import { Btn, Circle, Icon, LinkBtn } from "@/components/ui";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { useApp } from "@/hooks/useApp";
import { placeByName } from "@/lib/places";
import { DESTINATIONS } from "@/lib/data";

export function HomeScreen() {
  const { state, openPlace, confirmModal } = useApp();
  const { session, endSession } = useActiveSession();
  const recent = state.recent.filter((name) => !!placeByName(name));
  const rec = recent.length ? recent.slice(0, 3) : DESTINATIONS.slice(0, 3);

  return (
    <MapStage
      id="home-sheet"
      ariaLabel="Panel beranda"
      skipLabel="Lewati ke panel beranda"
      name="beranda"
      map={
        <AppMap
          label="Peta rute"
          summary="Titik biru pada peta menunjukkan gedung dan titik fasilitas terdata. Pilih titik asal dan tujuan untuk melihat garis rute perjalanan."
        />
      }
    >
      <div className="mf-greeting peek-keep">
        <h1 tabIndex={-1}>Hai, {state.name || "Teman"}!</h1>
        <p>Pilih tujuan untuk melihat rute terdata.</p>
      </div>

      {session ? (
        <section className="notice peek-keep" aria-labelledby="active-trip">
          <h2 id="active-trip">Perjalanan ke {session.destinationName} masih berjalan</h2>
          <div className="row">
            <LinkBtn label="Lanjutkan" route="trip" kind="primary" icon="route" />
            <Btn
              label="Akhiri"
              action="end-trip"
              onClick={() =>
                confirmModal(
                  "Akhiri perjalanan",
                  `Akhiri perjalanan ke ${session.destinationName}? Navigasi dan berbagi lokasi selama perjalanan akan dihentikan.`,
                  () => void endSession().then((ended) => ended && document.querySelector<HTMLElement>(".mf-greeting h1")?.focus()),
                )
              }
            />
          </div>
        </section>
      ) : null}

      <section className="home-block peek-keep" aria-labelledby="hb-primary-action">
        <h2 id="hb-primary-action">Mau ke mana hari ini?</h2>
        <div className="stack-sm">
          <LinkBtn label="Cari tujuan perjalanan" route="search" kind="primary full" icon="search" />
          <LinkBtn label="Bantu rencanakan" route="ai-planner" kind="full" icon="mic" />
        </div>
      </section>

      <CatalogueState />
      <PlannedTripsBlock />

      <section className="home-block" aria-labelledby="hb-recent">
        <div className="row between">
          <h2 id="hb-recent">{state.recent.length ? "Tujuan terakhir" : "Tujuan populer"}</h2>
          <Link className="link" href="/places">
            Semua tempat <Icon name="chevron-right" />
          </Link>
        </div>
        <ul className="list">
          {rec.map((d) => (
            <li key={d}>
              <button type="button" className="row-link" data-dest={d} onClick={() => openPlace(d)}>
                <Circle icon={state.recent.length ? "history" : "map-pin"} />
                <span>
                  <strong>{d}</strong>
                  <small>{placeByName(d)?.meta}</small>
                </span>
                <Icon name="chevron-right" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <FamilyStatus />

      <details className="card stack">
        <summary className="row between">
          <strong>Kondisi, titik asal & opsi rute</strong>
          <Icon name="chevron-down" />
        </summary>
        <div className="row between">
          <strong>Kondisi Anda</strong>
          <Link className="link" href="/profile">
            Ubah kondisi <Icon name="chevron-right" />
          </Link>
        </div>
        <MiniProfiles />
        <RouteOriginPicker />
        <RoutePreferences />
        <div className="row">
          <LinkBtn label="Bandingkan rute" route="compare" icon="git-compare" />
          <LinkBtn label="Katalog gedung" route="place" icon="building-2" />
        </div>
      </details>
    </MapStage>
  );
}
