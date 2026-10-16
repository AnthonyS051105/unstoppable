"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PushPermission } from "@/components/PushPermission";
import { Btn, Circle } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { errorMessage } from "@/lib/api-client";
import { defaultDepart, formatDepart, tripsApi, wibIso } from "@/lib/api/trips";
import type { CreatePlannedTrip, PlannedTrip, TripNotStarted, TripReminder } from "@/types/api";

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

type ModalFn = ReturnType<typeof useApp>["modal"];

type Handle = { submit: () => void };

/** Date + time fields of the schedule dialog. Validates (future, WIB) and creates the trip itself. */
function ScheduleFields({
  handleRef,
  create,
  onDone,
}: {
  handleRef: React.RefObject<Handle | null>;
  create: (departAt: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [initial] = useState(defaultDepart);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const date = useRef<HTMLInputElement>(null);
  const time = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handleRef.current = {
      submit: () => {
        if (busy) return;
        const d = date.current!.value;
        const t = time.current!.value;
        if (!d || !t) {
          setError("Isi tanggal dan jam berangkat.");
          (d ? time : date).current!.focus();
          return;
        }
        const departAt = wibIso(d, t);
        if (new Date(departAt).getTime() <= Date.now()) {
          setError("Waktu berangkat harus di masa depan.");
          time.current!.focus();
          return;
        }
        setError("");
        setBusy(true);
        create(departAt)
          .then(onDone)
          .catch((e) => setError(errorMessage(e)))
          .finally(() => setBusy(false));
      },
    };
  });

  const invalid = error ? { "aria-invalid": true, "aria-describedby": "schedule-error" } : {};
  return (
    <div className="stack">
      <label className="field">
        <span>Tanggal berangkat</span>
        <input ref={date} type="date" name="departDate" defaultValue={initial.date} min={todayWib()} required {...invalid} />
      </label>
      <label className="field">
        <span>Jam berangkat (WIB)</span>
        <input ref={time} type="time" name="departTime" defaultValue={initial.time} step={300} required {...invalid} />
      </label>
      <p>Kami akan mengingatkan 15 menit sebelum waktu berangkat.</p>
      {error ? (
        <div id="schedule-error" className="inline-error" role="alert">
          {error}
        </div>
      ) : busy ? (
        <p role="status">Menyimpan rencana…</p>
      ) : null}
    </div>
  );
}

/** Opens the "Jadwalkan" dialog. `body` (without departAt) is sent with the chosen time. */
export function openScheduleDialog(
  modal: ModalFn,
  closeModal: () => void,
  title: string,
  body: Omit<CreatePlannedTrip, "departAt">,
  onCreated: (trip: PlannedTrip) => void,
) {
  const handleRef: React.RefObject<Handle | null> = { current: null };
  modal({
    title,
    body: (
      <ScheduleFields
        handleRef={handleRef}
        create={(departAt) => tripsApi.create({ ...body, departAt }).then(onCreated)}
        onDone={closeModal}
      />
    ),
    confirmLabel: "Simpan rencana",
    onConfirm: () => {
      handleRef.current?.submit();
      return false;
    },
  });
}

/** "Rencana perjalanan" on Beranda. Hidden while loading or empty so Beranda does not grow for nothing. */
export const PlannedTripsBlock = () => (
  <Suspense fallback={null}>
    <PlannedTripsList />
  </Suspense>
);

function PlannedTripsList() {
  const { status } = useAuth();
  const { confirmModal, toast, announce } = useApp();
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const trips = useApiQuery(status === "authenticated" ? tripsApi.list : null, [status, tick]);
  const planned = (trips.data ?? [])
    .filter((t) => t.status === "planned")
    .sort((a, b) => a.departAt.localeCompare(b.departAt));

  const cancelTrip = (t: PlannedTrip) =>
    confirmModal("Batalkan rencana", `Batalkan rencana perjalanan ke ${t.destinationName} pada ${formatDepart(t.departAt)}?`, () =>
      tripsApi
        .cancel(t.id)
        .then(() => {
          announce("Rencana perjalanan dibatalkan.");
          toast("Rencana perjalanan dibatalkan.");
          trips.reload();
        })
        .catch((e) => toast(errorMessage(e))),
    );

  // Push action "Batalkan" opens /home?cancelTrip=<id>: ask once, never cancel without confirmation.
  const cancelParam = useSearchParams().get("cancelTrip");
  useEffect(() => {
    if (!cancelParam || !trips.data) return;
    window.history.replaceState(null, "", "/home");
    const t = trips.data.find((x) => x.id === cancelParam && x.status === "planned");
    if (t) cancelTrip(t);
    else toast("Rencana perjalanan ini sudah tidak aktif.");
  }, [cancelParam, trips.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const reload = () => setTick((n) => n + 1);
    window.addEventListener("planned-trips:changed", reload);
    return () => window.removeEventListener("planned-trips:changed", reload);
  }, []);

  if (trips.error)
    return (
      <section className="home-block" aria-labelledby="hb-trips">
        <h2 id="hb-trips">Rencana perjalanan</h2>
        <div className="inline-error" role="alert">
          {trips.error.message}
        </div>
        <Btn label="Coba lagi" action="reload-trips" kind="sm" icon="repeat" onClick={trips.reload} />
      </section>
    );
  if (!planned.length) return null;

  return (
    <section className="home-block" aria-labelledby="hb-trips">
      <h2 id="hb-trips">Rencana perjalanan</h2>
      <ul className="list">
        {planned.map((t) => (
          <li key={t.id}>
            <button type="button" className="row-link" onClick={() => router.push(`/preview?trip=${encodeURIComponent(t.id)}`)}>
              <Circle icon="calendar" />
              <span>
                <strong>{t.destinationName}</strong>
                <small>{formatDepart(t.departAt)}</small>
              </span>
              <span className="link">Buka rute</span>
            </button>
            <Btn
              label="Batalkan"
              action="cancel-trip"
              kind="sm"
              icon="x"
              aria-label={`Batalkan rencana ke ${t.destinationName}, ${formatDepart(t.departAt)}`}
              onClick={() => cancelTrip(t)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shown after a trip is saved: the moment F2 §3.4 asks for push permission. */
export const TripPushPrompt = () => <PushPermission context="trip" />;

/** trip:reminder / trip:not-started while the app is open: toast + voice (push covers the closed app). */
export function TripReminders() {
  const { subscribe } = useSocket();
  const { toast, speak } = useApp();
  useEffect(
    () =>
      subscribe<TripReminder>("trip:reminder", (e) => {
        const text = `Pengingat: 15 menit lagi waktunya berangkat ke ${e.destinationName}. Buka rute dari Beranda.`;
        toast(text);
        speak(text);
        window.dispatchEvent(new Event("planned-trips:changed"));
      }),
    [subscribe, toast, speak],
  );
  useEffect(
    () =>
      subscribe<TripNotStarted>("trip:not-started", (e) => {
        toast(`${e.user.name} belum memulai perjalanan ke ${e.destinationName} yang dijadwalkan ${formatDepart(e.departAt)}.`);
      }),
    [subscribe, toast],
  );
  return null;
}
