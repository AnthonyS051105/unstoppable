"use client";

import { IMAGES } from "@/assets/images";
import Link from "next/link";
import { CatalogueState, RouteOriginPicker } from "@/components/map/I2State";
import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import {
  BlockedNotice,
  FamilyStatus,
  Heading,
  NearestEntranceBtn,
  MiniProfiles,
  ProfileChoices,
  RouteSummary,
  RoutePreferences,
} from "@/components/shared";
import { SearchCombobox } from "@/components/shell/SearchCombobox";
import { PlannedTripsBlock, TripPushPrompt, openScheduleDialog } from "@/components/trips/PlannedTrips";
import { Badge, Btn, Circle, Icon, LinkBtn, SelectField } from "@/components/ui";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { useApp } from "@/hooks/useApp";
import { ApiError, errorMessage } from "@/lib/api-client";
import { sessionsApi } from "@/lib/api/sessions";
import { setPendingTrip, tripsApi } from "@/lib/api/trips";
import { compareKey, live, planCompare, planFor, nodeToPlace } from "@/lib/live";
import { useSearchParams } from "next/navigation";
import { useSaveConditions } from "@/hooks/useSaveConditions";
import { sheetControl } from "@/lib/controls";
import { allPlaces, placeById, retainFacility, placeByName, placeCoord, placeHref } from "@/lib/places";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDepartureDetector } from "@/hooks/useDepartureDetector";
import { DESTINATIONS, NEARBY, PROFILES, STEPS, profileName, type ProfileId } from "@/lib/data";
import { sharingText } from "@/lib/demo-state";
import type { FeedbackRating } from "@/types/api";

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
                  // The banner (and the focused Akhiri button) disappears; keep focus on the page heading.
                  () => void endSession().then((ended) => ended && document.querySelector<HTMLElement>(".mf-greeting h1")?.focus()),
                )
              }
            />
          </div>
        </section>
      ) : null}
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
      <section className="home-block" aria-labelledby="hb-facilities"><h2 id="hb-facilities">Fasilitas pada tampilan peta</h2>
        {live.facilities.length ? <ul className="list">{live.facilities.map((n) => <li key={n.id}><Link className="row-link" href={placeHref(nodeToPlace(n))}><Circle icon="map-pin" /><span><strong>{n.name || `Fasilitas ${n.id}`}</strong><small>{n.isOperational === false ? "Tidak beroperasi" : "Disetujui"}{n.floorLevel != null ? `, lantai ${n.floorLevel + 1}` : ""}. {n.surveyedAt ? `Disurvei ${new Date(n.surveyedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}` : "Belum disurvei."}</small></span></Link></li>)}</ul> : <p role={live.facilityState.status === "error" ? "alert" : "status"}>{live.facilityState.status === "loading" ? "Memuat fasilitas pada tampilan peta…" : live.facilityState.status === "error" ? live.facilityState.error : "Belum ada fasilitas terdata pada tampilan peta ini."}</p>}
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

export function SearchScreen() {
  const { openPlace } = useApp();
  useLayoutEffect(() => {
    document.body.classList.add("on-search");
    return () => document.body.classList.remove("on-search");
  }, []);
  return (
    <div className="content-page narrow">
      <Heading title="Pilih tujuan" subtitle="Fasilitas kesehatan dan tujuan harian di sekitar Anda." back="home" />
      <section className="card stack">
        <SearchCombobox cls="search-page" />
        <h2>Gedung terdata</h2>
        <CatalogueState />
        <ul className="list">
          {DESTINATIONS.map((d, i) => (
            <li key={d}>
              <button className="row-link" data-dest={d} onClick={() => openPlace(d)}>
                <Circle icon={i < 3 ? "building-2" : "map-pin"} />
                <span>
                  <strong>{d}</strong>
                  <small>
                    {placeByName(d)?.meta}
                  </small>
                </span>
                <Icon name="chevron-right" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LoadingScreen() {
  const { go, cancelLoading, calculateRoute } = useApp();
  if (!live.planning) return <div className="card loading-screen"><h1 tabIndex={-1}>{live.planError ? "Rute belum dapat dimuat" : "Belum ada permintaan rute"}</h1><p role={live.planError ? "alert" : "status"}>{live.planError || "Pilih tujuan dan titik asal untuk merencanakan rute."}</p>{live.planError ? <Btn label="Coba hitung rute lagi" onClick={() => calculateRoute()} /> : null}<LinkBtn label="Pilih tujuan" route="home" /></div>;
  return (
    <div className="card loading-screen">
      <div className="skeleton block" aria-hidden="true"></div>
      <h2 tabIndex={-1} role="status">Mencari rute yang sesuai untuk Anda</h2>
      <div className="skeleton line" aria-hidden="true"></div>
      <ul className="check-list">
        <li>
          <Circle icon="check" />
          Memeriksa aksesibilitas jalur
        </li>
        <li>
          <Circle icon="check" />
          Menghindari hambatan
        </li>
        <li>
          <Circle icon="check" />
          Menyesuaikan dengan kondisi Anda
        </li>
      </ul>
      <Btn
        label="Batalkan"
        action="cancel-loading"
        kind="full"
        onClick={() => {
          cancelLoading();
          go("home");
        }}
      />
    </div>
  );
}

export function PreviewScreen() {
  const { state, update, toast, speak, announce, startTrip, modal, closeModal, calculateRoute } = useApp();
  const { session } = useActiveSession();
  const currentPlan = planFor(placeByName(state.destination)?.id, state.profiles[0]);
  const s = { distance: Math.round(currentPlan?.route.totalDistanceM ?? 0), time: currentPlan?.route.estimatedDurationMin != null ? `${currentPlan.route.estimatedDurationMin} menit` : "Durasi belum tersedia", obstacles: currentPlan?.route.barriers.length ?? 0 };
  const [scheduled, setScheduled] = useState(false);
  const tripId = useSearchParams().get("trip");
  // /preview?trip=<id> (reminder push "Buka rute", Beranda): load the plan, set its destination, route it.
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    tripsApi
      .list()
      .then((trips) => {
        if (!alive) return;
        const t = trips.find((x) => x.id === tripId);
        if (!t || t.status !== "planned") {
          toast(t ? "Rencana perjalanan ini sudah tidak aktif." : "Rencana perjalanan tidak ditemukan.");
          return;
        }
        setPendingTrip(t.id);
        update({ destination: t.destinationName });
        calculateRoute(t.destinationName);
      })
      .catch((e) => alive && toast(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  const schedule = () => {
    const place = placeByName(state.destination);
    if (!place) {
      toast("Tujuan ini belum memiliki titik lokasi, jadi belum bisa dijadwalkan.");
      return;
    }
    openScheduleDialog(
      modal,
      closeModal,
      `Jadwalkan perjalanan ke ${state.destination}`,
      {
        destinationName: state.destination,
        destination: { type: "Point", coordinates: placeCoord(place) },
        profileId: state.profiles[0],
      },
      () => {
        const text = `Rencana perjalanan ke ${state.destination} tersimpan. Lihat di Beranda.`;
        toast(text);
        speak(text);
        announce(text);
        setScheduled(true);
      },
    );
  };
  const saved = state.saved.includes(state.destination);
  const onDeparted = useCallback(() => {
    const text = "Sepertinya Anda sudah berangkat. Mulai panduan?";
    speak(text);
    modal({
      title: text,
      body: <p>Panduan langkah demi langkah ke {state.destination} akan dibacakan.</p>,
      confirmLabel: "Mulai panduan",
      cancelLabel: "Nanti",
      focusConfirm: true,
      onConfirm: startTrip,
    });
  }, [speak, modal, startTrip, state.destination]);
  // Departure detection uses the origin explicitly chosen for this plan.
  useDepartureDetector(currentPlan?.origin.point.coordinates ?? null, !!currentPlan && !session && !state.activeTrip, onDeparted);
  if (!currentPlan) return <div className="content-page narrow"><Heading title="Belum ada rute" back="home" /><section className="card stack"><p>Rencanakan rute dari tujuan dan kondisi Anda. Pratinjau hanya menampilkan hasil server yang sesuai.</p><LinkBtn label="Pilih tujuan" route="home" /></section></div>;
  return (
    <MapStage
      id="route-sheet"
      ariaLabel="Rincian rute"
      skipLabel="Lewati ke rincian rute"
      name="rute"
      handleAction
      panelId="route"
      map={
        <AppMap
          label="Peta rute"
          planned
          summary={`Peta rute. Rute ke ${state.destination}: ${s.distance} meter, ${s.time}, ${s.obstacles} hambatan. Rincian langkah ada di panel rute.`}
        />
      }
      after={
        <p className="survey-freshness">
          {currentPlan.route.dataFreshness?.surveyedAt
            ? `Tanggal survei dari server: ${new Date(currentPlan.route.dataFreshness.surveyedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })}. Tanggal ini belum memastikan seluruh segmen sudah disurvei. Kondisi lapangan dapat berubah.`
            : "Data jalur ini belum disurvei di lapangan. Kondisi lapangan dapat berubah."}
        </p>
      }
    >
      <div className="peek-keep">
        <Heading
          title={`Rute ke ${state.destination}`}
          subtitle="Disesuaikan dengan kondisi Anda"
          back="home"
          actions={<LinkBtn label="Ubah kondisi" route="profile" icon="settings-2" />}
        />
      </div>
      <h2>{state.destination}</h2>
      <p>Asal rute: {currentPlan.origin.label}.</p>
      <div className="peek-keep peek-summary">
        <RouteSummary />
      </div>
      {state.destination.startsWith("[DEV]") || currentPlan.origin.label.startsWith("[DEV]") ? <p className="notice">Data pengembangan untuk pengujian, bukan bukti survei lapangan.</p> : null}
      {currentPlan.route.barriers.length ? currentPlan.route.barriers.map((b) => <div key={b.edgeId + b.message} className="warning"><Icon name="triangle-alert" />{b.message}</div>) : <Badge label="Tidak ada hambatan terdata pada rute ini" kind="green" icon="circle-check" />}
      <div className="row preview-actions peek-keep">
        <Btn
          label="Dengarkan"
          action="listen-route"
          icon="volume-2"
          onClick={() =>
            speak(
              `Rute ke ${state.destination}. ${s.distance} meter, ${s.time}, ${s.obstacles} hambatan. ` +
                STEPS.map((x, i) => `Langkah ${i + 1}, ${x[0]}.`).join(" "),
            )
          }
        />
        <Btn
          label="Mulai"
          action="start-trip"
          kind="primary peek-action peek-keep"
          icon="navigation"
          aria-label="Mulai perjalanan"
          disabled={!currentPlan.route.steps.length}
          onClick={startTrip}
        />
        <Btn label="Jadwalkan" action="schedule-trip" icon="calendar" aria-label="Jadwalkan perjalanan" onClick={schedule} />
      </div>
      {scheduled ? <TripPushPrompt /> : null}
      {currentPlan.route.dataFreshness?.reportsCheckedAt ? <p>Laporan diperiksa: {new Date(currentPlan.route.dataFreshness.reportsCheckedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.</p> : null}
      <h3>Langkah demi langkah</h3>
      <ol className="step-list">
        {STEPS.map(([t, d, i], n) => (
          <li key={n}>
            <span className="num">{n + 1}</span>
            <Icon name={i} />
            <span>{t}{currentPlan.route.steps[n]?.warnings?.map((w, i) => <small className="warning" key={i}>{w.message}</small>)}</span>
            <span className="distance">{d}</span>
          </li>
        ))}
      </ol>
      <div className="row">
        <Btn
          label={saved ? "Rute tersimpan" : "Simpan rute"}
          action="save-route"
          kind="sm"
          icon="bookmark"
          onClick={() => {
            update((st) => ({ saved: saved ? st.saved.filter((d) => d !== st.destination) : [...st.saved, st.destination] }));
            toast(saved ? "Rute dihapus dari tersimpan." : "Rute tersimpan di browser ini.");
          }}
        />
        <LinkBtn label="Laporkan Hambatan" route="report" kind="sm" icon="octagon-alert" />
      </div>
    </MapStage>
  );
}

export function UnreachableScreen() {
  const { state } = useApp();
  if (!live.blocked || live.blocked.placeId !== placeByName(state.destination)?.id || live.blocked.profileId !== state.profiles[0]) return <div className="content-page narrow"><Heading title="Belum ada hasil rute" back="home" /><p>Pilih tujuan dan hitung rute terlebih dahulu.</p></div>;
  return (
    <div className="content-page narrow">
      <Heading title="Tidak terjangkau" subtitle="Alternatif perjalanan tetap tersedia." back="home" />
      <section className="card empty">
        <BlockedNotice place={placeByName(state.destination)} />
        <div className="row justify-center mt-[20px]">
          <NearestEntranceBtn />
          <LinkBtn label="Minta Pendamping" route="assistance-form" kind="primary" icon="handshake" />
        </div>
      </section>
    </div>
  );
}

export function TripScreen() {
  const { state, update, go, toast, announce, speak, confirmModal, addFamilyEvent, finishTrip } = useApp();
  const [t, d, ico] = STEPS[state.step];
  const last = state.step === STEPS.length - 1;
  const pct = ((state.step + 1) / STEPS.length) * 100;
  return (
    <MapStage
      id="trip-sheet"
      ariaLabel="Perjalanan aktif"
      skipLabel="Lewati ke panduan langkah"
      name="perjalanan"
      before={
        <aside className="trip-top-status" aria-label="Status perjalanan">
          <div className="trip-status">
            <Badge label="GPS demo" kind="green" icon="map-pin" />
            <Badge label="Koneksi demo" kind="green" icon="wifi" />
          </div>
          <Link href="/caregiver-link" className="trip-family">
            <strong>Pemantauan keluarga</strong>
            <span>{sharingText(state)}</span>
            <Icon name="chevron-right" />
          </Link>
        </aside>
      }
      map={
        <AppMap
          filters={false}
          label="Peta perjalanan"
          summary={`Langkah ${state.step + 1} dari ${STEPS.length}: ${STEPS[state.step][0]}. Peta dan posisi demonstrasi.`}
        />
      }
    >
      <div className="peek-hide">
        <Heading title="Perjalanan aktif" subtitle={state.destination} back="preview" />
      </div>
      <section className="trip-details card stack">
        <div className="turn-panel peek-keep">
          <span className="turn-icon">
            <Icon name={ico} />
          </span>
          <div>
            <span className="small">{d === "0 m" ? "Di lokasi Anda" : d + " lagi"}</span>
            <h2 aria-live="polite" aria-atomic="true">
              {t}
            </h2>
          </div>
        </div>
        <div className="row trip-controls peek-keep">
          <Btn label="Ulangi" action="repeat" kind="repeat-action" icon="volume-2" onClick={() => speak(t)} />
          <Btn
            label={last ? "Selesai" : "Berikutnya"}
            action="next-step"
            kind="primary"
            icon="arrow-right"
            onClick={() => {
              if (state.paused) {
                toast("Lanjutkan navigasi terlebih dahulu.");
                return;
              }
              if (!last) {
                const step = state.step + 1;
                update({ step });
                announce(`Langkah ${step + 1} dari ${STEPS.length}. ${STEPS[step][0]}`);
                if (state.voice) speak(STEPS[step][0]);
              } else finishTrip();
            }}
          />
        </div>
        <p>
          Langkah {state.step + 1} dari {STEPS.length}
        </p>
        <div className="progress" aria-label={`Kemajuan perjalanan ${pct}%`}>
          <span style={{ width: `${pct}%` }}></span>
        </div>
        {state.step === 2 ? (
          <div className="warning">
            <Icon name="triangle-alert" />
            Guiding block rusak pada segmen ini. Periksa jalur sebelum melanjutkan.
          </div>
        ) : null}
        <div className="card border">
          <small>Selanjutnya</small>
          <h3>{STEPS[Math.min(state.step + 1, STEPS.length - 1)][0]}</h3>
        </div>
        <div className="row">
          <Btn
            label={state.paused ? "Lanjutkan" : "Jeda"}
            action="pause"
            kind="sm"
            icon={state.paused ? "play" : "pause"}
            onClick={() => {
              const paused = !state.paused;
              update({ paused });
              if (paused) addFamilyEvent("Perjalanan terhenti / dijeda");
              toast(paused ? "Perjalanan dijeda." : "Navigasi dilanjutkan.");
            }}
          />
          <LinkBtn label="Laporkan Hambatan" route="report" kind="sm" icon="octagon-alert" />
          <Btn
            label="Akhiri perjalanan"
            action="end-trip"
            kind="sm"
            onClick={() =>
              confirmModal(
                "Akhiri perjalanan",
                `Akhiri perjalanan ke ${state.destination}? Navigasi dan berbagi lokasi selama perjalanan akan dihentikan.`,
                () => {
                  update({ activeTrip: false });
                  go("home");
                  toast("Perjalanan dihentikan.");
                },
              )
            }
          />
        </div>
      </section>
    </MapStage>
  );
}

export function ArrivedScreen() {
  const { state } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Perjalanan selesai" back="home" />
      <section className="card empty">
        <img className="soft-art" src={IMAGES.cityWalk} alt="Ilustrasi perjalanan yang selesai" />
        <h2>Anda telah tiba!</h2>
        <p>Perjalanan ke {state.destination} selesai.</p>
        <RouteSummary />
        <div className="row mt-[24px] justify-center">
          <LinkBtn label="Beri Masukan" route="feedback" />
          <LinkBtn label="Rute Baru" route="home" kind="primary" icon="route" />
        </div>
      </section>
    </div>
  );
}

export function FeedbackScreen() {
  const { go, toast } = useApp();
  const { lastEndedSessionId, setLastEndedSessionId } = useActiveSession();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  return (
    <div className="content-page narrow">
      <Heading title="Bagaimana perjalanan Anda?" subtitle="Pilih satu jawaban. Tidak perlu mengetik." back="arrived" />
      <form
        className="card stack"
        data-form="feedback"
        aria-busy={sending}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!lastEndedSessionId || inFlight.current) return;
          const rating = Number(new FormData(e.currentTarget).get("route-feedback")) as FeedbackRating;
          if (!rating) {
            toast("Pilih rating terlebih dahulu.");
            return;
          }
          inFlight.current = true;
          setSending(true);
          setError("");
          try {
            await sessionsApi.feedback(lastEndedSessionId, rating);
          } catch (err) {
            // 409: this trip already has feedback (an earlier tap got through), so it is saved.
            if (!(err instanceof ApiError && err.code === "CONFLICT")) {
              setError(errorMessage(err));
              setSending(false);
              inFlight.current = false;
              return;
            }
          }
          setLastEndedSessionId(null);
          go("home");
          toast("Terima kasih, masukan Anda tersimpan.");
        }}
      >
        {!lastEndedSessionId ? (
          <div className="notice">
            Belum ada perjalanan selesai yang bisa dinilai. Masukan dapat dikirim setelah perjalanan dengan panduan aplikasi selesai.
          </div>
        ) : null}
        <div className="feedback-options">
          {(
            [
              ["5", "Sesuai dan nyaman", "smile"],
              ["3", "Ada hambatan kecil", "minus-circle"],
              ["1", "Perlu diperbaiki", "triangle-alert"],
            ] as const
          ).map(([v, t, i]) => (
            <label key={v} className="choice">
              <Icon name={i} />
              <input type="radio" name="route-feedback" value={v} required />
              {t}
            </label>
          ))}
        </div>
        {error ? (
          <div className="inline-error" role="alert">
            {error}
          </div>
        ) : null}
        <button type="submit" className="btn primary full" disabled={!lastEndedSessionId || sending}>
          {sending ? "Mengirim…" : "Kirim masukan"}
        </button>
      </form>
    </div>
  );
}

export function ProfileScreen() {
  const { state, toast, calculateRoute } = useApp();
  const save = useSaveConditions();
  return (
    <div className="content-page narrow">
      <Heading title="Kondisi Anda" subtitle="Pilih kondisi yang sesuai. Mengubah kondisi akan menghitung ulang rute." back="settings" />
      <form
        className="card stack"
        data-form="profile"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!state.profiles.length) {
            toast("Pilih minimal satu kondisi perjalanan.");
            return;
          }
          const fd = new FormData(e.currentTarget);
          if (!(await save(state.profiles, String(fd.get("stairs") || ""), String(fd.get("slope") || "")))) return;
          calculateRoute();
          toast("Kondisi disimpan. Rute dihitung ulang.");
        }}
      >
        <ProfileChoices />
        <SelectField label="Toleransi anak tangga" name="stairs" options={["0", "1–3", "4–8", "Lebih dari 8"]} value={state.stairs} />
        <SelectField label="Kelandaian nyaman" name="slope" options={["Landai", "Sedang", "Curam"]} value={state.slope} />
        <button type="submit" className="btn primary full">
          Terapkan kondisi & hitung ulang rute
        </button>
      </form>
    </div>
  );
}

export function CompareScreen() {
  const { state, update, toast } = useApp();
  const destinations = allPlaces().map((p): [string, string] => [p.id, p.name]);
  const a = state.compareA || "wheelchair", b = state.compareB || "blind";
  const destPlace = placeById(state.compareDestination) || placeByName(state.compareDestination || "") || allPlaces()[0];
  const dest = destPlace?.name;
  const cmpKey = destPlace ? compareKey(destPlace.id, [a, b]) : "";
  const cmp = live.compare?.key === cmpKey ? live.compare.data : null;
  const [cmpState, setCmpState] = useState<"loading" | "error" | "ok">("loading");
  const [attempt, setAttempt] = useState(0);
  const [cmpError, setCmpError] = useState("");
  useEffect(() => {
    if (!destPlace || !live.origin || a === b) return;
    let alive = true;
    queueMicrotask(() => { if (alive) { setCmpState("loading"); setCmpError(""); } });
    planCompare(destPlace, [a, b])
      .then(() => alive && setCmpState("ok"))
      .catch((e) => {
        if (!alive) return;
        setCmpState("error");
        setCmpError(errorMessage(e));
        toast(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [cmpKey, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = (id: ProfileId) => cmp?.results.find((r) => r.profileId === id);
  const blocked = (id: ProfileId) => result(id)?.reachable === false;
  const options = PROFILES.map(([id, t]) => [id, t] as [string, string]);
  const cell = (id: ProfileId, i: number) => {
    const r = result(id);
    if (!live.origin) return "Pilih titik asal";
    if (a === b) return "Pilih kondisi berbeda";
    if (!r) return cmpState === "error" ? "Gagal dimuat" : cmp ? "Tidak tersedia" : "Memuat…";
    if (!r.reachable) return i === 0 ? "Tidak dapat dijangkau" : "Tidak tersedia";
    return [r.totalDistanceM != null ? `${Math.round(r.totalDistanceM)} m` : "Tidak tersedia", r.estimatedDurationMin != null ? `${r.estimatedDurationMin} menit` : "Tidak tersedia", r.barriers ? `${r.barriers.length} hambatan` : "Tidak tersedia", r.steps ? `${r.steps.length} langkah` : "Tidak tersedia"][i];
  };

  return (
    <MapStage
      id="compare-sheet"
      ariaLabel="Perbandingan rute"
      skipLabel="Lewati ke perbandingan rute"
      name="perbandingan"
      pageClass="compare-page"
      map={
        <AppMap
          compare
          filters={false}
          hideA={blocked(a)}
          hideB={blocked(b)}
          label="Peta perbandingan rute"
          summary={
            "Garis putus-putus: " + profileName(a) + ". Garis utuh: " + profileName(b) + ". Rute yang tidak terjangkau tidak digambar."
          }
        />
      }
    >
      <div className="peek-keep peek-sub">
        <Heading title="Bandingkan rute" subtitle="Asal dan tujuan sama. Kondisi berbeda menghasilkan rute berbeda." back="home" />
      </div>
      <CatalogueState />
      <RouteOriginPicker />
      {dest?.startsWith("[DEV]") || live.origin?.label.startsWith("[DEV]") ? <p className="notice">Data pengembangan untuk pengujian, bukan bukti survei lapangan.</p> : null}
      <form
        className="card stack"
        data-form="compare"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = (k: string) => String(fd.get(k) || "");
          const chosen = placeById(v("to"));
          if (chosen?.id.startsWith("node:")) retainFacility(chosen);
          update({ compareDestination: v("to"), compareA: v("a") as ProfileId, compareB: v("b") as ProfileId });
          if (v("a") === v("b")) {
            toast("Pilih dua profil yang berbeda.");
            return;
          }
          setAttempt((n) => n + 1);
        }}
      >
        <div className="grid-2">
          <p>Dari: {live.origin?.label || "Pilih titik asal di atas"}</p>
          <SelectField label="Ke" name="to" options={destinations} value={destPlace?.id || ""} />
        </div>
        <div className="grid-2">
          <SelectField label="Kondisi pertama, garis putus-putus" name="a" options={options} value={a} />
          <SelectField label="Kondisi kedua, garis utuh" name="b" options={options} value={b} />
        </div>
        <button className="btn primary" type="submit">
          Bandingkan rute
        </button>
      </form>
      <section className="card" aria-live="polite">
        {cmpState === "error" ? <><p role="alert">{cmpError}</p><Btn label="Coba bandingkan lagi" onClick={() => setAttempt((n) => n + 1)} /></> : null}
        {cmp && !cmp.results.length ? <p>Server belum mengembalikan hasil perbandingan.</p> : null}
        <table className="compare-table">
          <caption>Perbandingan dua kondisi</caption>
          <thead>
            <tr>
              <th scope="col">Informasi</th>
              <th scope="col">
                {profileName(a)}
                <br />┄ Garis putus-putus
              </th>
              <th scope="col">
                {profileName(b)}
                <br />━ Garis utuh
              </th>
            </tr>
          </thead>
          <tbody>
            {["Jarak", "Durasi", "Hambatan", "Langkah"].map((t, i) => (
              <tr key={t}>
                <th scope="row">{t}</th>
                <td>{cell(a, i)}</td>
                <td>{cell(b, i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {[a, b].filter(blocked).map((id) => (
          <div key={id} className="warning red">
            <Icon name="circle-minus" />
            {profileName(id)}:{" "}
            {result(id)?.reasons?.map((r) => r.message).join(" ") || "Tujuan belum bisa dijangkau secara mandiri dengan kondisi ini."}
          </div>
        ))}
      </section>
      <section className="card compare-explanation">
        <h2>Mengapa rutenya berbeda</h2>
        {cmp?.differences.length ? cmp.differences.map((d, n) => <p key={n}>{d.reason}</p>) :
          <p>{cmp ? "Server tidak mencatat perbedaan tambahan untuk pasangan kondisi ini." : !live.origin ? "Pilih titik asal untuk membandingkan." : a === b ? "Pilih dua kondisi yang berbeda." : cmpState === "error" ? "Perbandingan belum tersedia." : "Memuat perbandingan dari server…"}</p>}
        {cmp?.results.map((r) => (
          <div key={r.profileId}>
            <h3>{profileName(r.profileId)}</h3>
            {r.barriers?.map((b, i) => <p className="warning" key={i}>{b.message}</p>)}
            {r.steps?.length ? (
              <details>
                <summary>Langkah {profileName(r.profileId)}</summary>
                <ol>
                  {r.steps.map((s) => (
                    <li key={s.order}>
                      {s.instruction}
                      {s.warnings?.map((w, i) => <p key={i}>{w.message}</p>)}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            <p>
              {r.dataFreshness
                ? r.dataFreshness.surveyedAt
                  ? `Tanggal survei dari server: ${new Date(r.dataFreshness.surveyedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}`
                  : "Data jalur belum disurvei di lapangan."
                : "Kesegaran data tidak disertakan oleh server pembanding."}
            </p>
          </div>
        ))}
      </section>
    </MapStage>
  );
}
