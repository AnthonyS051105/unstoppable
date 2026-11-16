"use client";

import { IMAGES } from "@/assets/images";
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
import { Badge, Btn, Circle, Icon, LinkBtn } from "@/components/ui";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { useApp } from "@/hooks/useApp";
import { live, nodeToPlace } from "@/lib/live";
import { sheetControl } from "@/lib/controls";
import { placeByName, placeHref } from "@/lib/places";
import { DESTINATIONS, NEARBY } from "@/lib/data";

export function HomeScreen() {
  const { state, openPlace, confirmModal } = useApp();
  const { session, endSession } = useActiveSession();
  const recent = state.recent.filter((name) => !!placeByName(name));
  const rec = recent.length ? recent.slice(0, 3) : DESTINATIONS.slice(0, 3);

  const showMap = (e: React.MouseEvent) => {
    e.preventDefault();
    if (matchMedia("(max-width:960px)").matches) sheetControl.current?.set("peek");
    document.getElementById("map-region")?.focus({ preventScroll: true });
  };

  return (
    <MapStage
      id="home-sheet"
      ariaLabel="Panel beranda"
      skipLabel="Lewati ke panel beranda"
      name="beranda"
      map={
        <AppMap
          label="Peta rute"
          summary="Gedung dan fasilitas terdata dari server. Cari tujuan untuk merencanakan rute. Area yang belum disurvei ditandai pada rincian."
        />
      }
    >
      <div className="mf-greeting peek-keep">
        <h1 tabIndex={-1}>Selamat datang, {state.name}!</h1>
        <p>Sampai ke tujuan dengan aman, tanpa harus ditemani.</p>
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

      {/* AI Travel Planner Shortcut Button for Elderly Users */}
      <section
        className="card stack peek-keep ai-planner-shortcut"
        aria-labelledby="ai-planner-shortcut-title"
        style={{
          background: "linear-gradient(135deg, #fff9e6 0%, #ffffff 100%)",
          border: "2px solid #ffd540",
          borderRadius: "16px",
          padding: "18px",
          boxShadow: "0 2px 8px rgba(255, 196, 16, 0.15)",
        }}
      >
        <div className="row between items-center">
          <div style={{ flex: 1 }}>
            <Badge label="AI Travel Planner" kind="warning" icon="mic" />
            <h2
              id="ai-planner-shortcut-title"
              style={{
                fontSize: "1.25rem",
                margin: "8px 0 4px",
                color: "#11132d",
              }}
            >
              Rencanakan dengan Suara & AI
            </h2>
            <p style={{ margin: 0, fontSize: "0.95rem", color: "#495057", lineHeight: 1.4 }}>
              Cukup sebutkan tujuan Anda atau ketik dengan santai. AI akan mencocokkan lokasi dan menyiapkan rute aktif ramah lansia.
            </p>
          </div>
        </div>
        <div style={{ marginTop: "12px" }}>
          <LinkBtn
            label="Buka AI Travel Planner"
            route="ai-planner"
            kind="primary"
            icon="mic"
            style={{
              width: "100%",
              minHeight: "52px",
              fontSize: "1.1rem",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          />
        </div>
      </section>

      <FamilyStatus />
      <img
        className="home-illustration peek-tease"
        src={IMAGES.cityWalk}
        alt="Lansia berjalan mandiri dengan tongkat biasa menuju layanan publik"
      />
      <section className="home-block" aria-labelledby="hb-profile">
        <div className="row between">
          <h2 id="hb-profile">Kondisi Anda</h2>
          <Link className="link" href="/profile">
            Ubah kondisi <Icon name="sliders-horizontal" />
          </Link>
        </div>
        <MiniProfiles />
      </section>
      <CatalogueState />
      <LinkBtn label="Katalog dan skor aksesibilitas gedung" route="place" icon="building-2" />
      <RouteOriginPicker />
      <RoutePreferences />
      <PlannedTripsBlock />
      <section className="home-block" aria-labelledby="hb-recent">
        <h2 id="hb-recent">{state.recent.length ? "Tujuan terakhir" : "Rekomendasi tujuan"}</h2>
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
      <section className="home-block" aria-labelledby="hb-facilities">
        <h2 id="hb-facilities">Fasilitas pada tampilan peta</h2>
        {live.facilities.length ? (
          <ul className="list">
            {live.facilities.map((n) => (
              <li key={n.id}>
                <Link className="row-link" href={placeHref(nodeToPlace(n))}>
                  <Circle icon="map-pin" />
                  <span>
                    <strong>{n.name || `Fasilitas ${n.id}`}</strong>
                    <small>
                      {n.isOperational === false ? "Tidak beroperasi" : "Disetujui"}
                      {n.floorLevel != null ? `, lantai ${n.floorLevel + 1}` : ""}.{" "}
                      {n.surveyedAt
                        ? `Disurvei ${new Date(n.surveyedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}`
                        : "Belum disurvei."}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p role={live.facilityState.status === "error" ? "alert" : "status"}>
            {live.facilityState.status === "loading"
              ? "Memuat fasilitas pada tampilan peta…"
              : live.facilityState.status === "error"
                ? live.facilityState.error
                : "Belum ada fasilitas terdata pada tampilan peta ini."}
          </p>
        )}
      </section>
      <section className="home-block" aria-labelledby="hb-near">
        <div className="row between">
          <h2 id="hb-near">Layanan di sekitar</h2>
          <a className="link" href="#map-region" onClick={showMap}>
            Lihat di peta <Icon name="map" />
          </a>
        </div>
        <ul className="list">
          {NEARBY.map(([t, m, i]) => (
            <li key={t}>
              <Link className="row-link" href={placeHref(placeByName(t)!)}>
                <Circle icon={i} />
                <span>
                  <strong>{t}</strong>
                  <small>{placeByName(t)?.surveyedAt ? `${m}, disurvei ${placeByName(t)?.surveyedAt}` : m}</small>
                </span>
                <Icon name="chevron-right" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </MapStage>
  );
}
