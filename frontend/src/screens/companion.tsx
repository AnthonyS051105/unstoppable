"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import { CommunityCta, Heading, RatingButtons } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, SelectField, TextField } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { useCompanionRequests } from "@/hooks/useCompanionRequests";
import { ApiError, errorMessage } from "@/lib/api-client";
import { companionsApi, formatClock, formatSchedule } from "@/lib/api/companions";
import { wibIso } from "@/lib/api/trips";
import type { LocationValue } from "@/lib/geocode";
import { PLACES, placeByName, placeCoord } from "@/lib/places";
import type { AssistanceType, AvailableVolunteer, CompanionRequest, CompanionStatus, LngLat } from "@/types/api";

const RequestPointsMap = dynamic(() => import("@/components/map/RequestPointsMap"), { ssr: false });

const firstName = (name: string) => name.split(" ")[0];
const distanceText = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

const PENDING: CompanionStatus[] = ["invited", "invite_declined", "invite_expired", "open"];
const TABS: Record<string, CompanionStatus[]> = { Menunggu: PENDING, Diterima: ["confirmed"], Selesai: ["completed"] };
const ACTIVE: CompanionStatus[] = [...PENDING, "confirmed"];

const STATUS_BADGE: Record<CompanionStatus, [string, string]> = {
  invited: ["Menunggu jawaban", "yellow"],
  invite_declined: ["Tidak dapat diterima", "yellow"],
  invite_expired: ["Belum dijawab", "yellow"],
  open: ["Menunggu", "yellow"],
  confirmed: ["Diterima", "green"],
  completed: ["Selesai", "green"],
  cancelled: ["Dibatalkan", ""],
  expired: ["Kedaluwarsa", ""],
};

const HELP: [string, AssistanceType][] = [
  ["Memandu jalan", "memandu_jalan"],
  ["Bantu kursi roda", "bantu_kursi_roda"],
  ["Bacakan informasi", "bacakan_informasi"],
  ["Dampingi acara", "dampingi_acara"],
];
const DURATIONS: Record<string, number> = { "30 menit": 30, "1 jam": 60, "2 jam": 120, "3 jam": 180 };

function requestStatusText(r: CompanionRequest) {
  const who = r.invitedVolunteer?.name;
  switch (r.status) {
    case "invited":
      return `Menunggu jawaban ${who}${r.inviteExpiresAt ? ` · batas ${formatClock(r.inviteExpiresAt)}` : ""}`;
    case "invite_declined":
      return `${who} tidak dapat menerima`;
    case "invite_expired":
      return `${who} belum menjawab sampai batas waktu`;
    case "open":
      return r.offerCount ? `Menunggu pilihan Anda · ${r.offerCount} tawaran` : "Menunggu tawaran relawan";
    case "confirmed":
      return `Didampingi ${r.selectedVolunteer?.name ?? "relawan"}`;
    default:
      return STATUS_BADGE[r.status][0];
  }
}

/** Device position for "relawan di sekitar Anda"; null until known, `denied` when unavailable. */
function useDevicePosition() {
  const [pos, setPos] = useState<LngLat | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!navigator.geolocation) {
      queueMicrotask(() => setDenied(true));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos([p.coords.longitude, p.coords.latitude]),
      () => setDenied(true),
      { timeout: 8000, maximumAge: 60_000 },
    );
  }, []);
  return { pos, denied };
}

function QueryNotice({ loading, error, text, onRetry, id }: { loading: boolean; error: ApiError | null; text: string; onRetry: () => void; id: string }) {
  if (error)
    return (
      <>
        <div className="notice" role="alert">
          {error.message}
        </div>
        <Btn label="Coba lagi" action={`reload-${id}`} kind="sm" icon="repeat" onClick={onRetry} />
      </>
    );
  if (loading)
    return (
      <>
        <div className="skeleton line" aria-hidden="true"></div>
        <p role="status">{text}</p>
      </>
    );
  return null;
}

function VolunteerRow({ v, action }: { v: AvailableVolunteer; action: React.ReactNode }) {
  return (
    <li className="list-item">
      <Avatar name={v.name} />
      <div>
        <strong>{v.name}</strong>
        <small>{`Rating ${v.ratingAvg.toFixed(1)}, ${v.totalHelps} pendampingan, ${distanceText(v.distanceM)}`}</small>
      </div>
      <Badge label="Tersedia" kind="green" icon="check" />
      {action}
    </li>
  );
}

const inviteHref = (v: AvailableVolunteer) => `assistance-form?${new URLSearchParams({ volunteer: v.id, name: v.name })}`;

export function AssistanceHubScreen() {
  const requests = useCompanionRequests();
  const { pos, denied } = useDevicePosition();
  const volunteers = useApiQuery<AvailableVolunteer[]>(pos ? () => companionsApi.available(pos) : null, [pos?.[0], pos?.[1]]);
  const active = (requests.data ?? []).filter((r) => ACTIVE.includes(r.status));
  return (
    <div className="content-page narrow">
      <Heading
        title="Minta Pendamping"
        subtitle="Relawan terverifikasi menemani perjalanan Anda. Anda yang memilih pendampingnya."
        back="home"
      />
      <div className="stack">
        {requests.error && !requests.data ? (
          <QueryNotice id="requests" loading={false} error={requests.error} text="" onRetry={requests.reload} />
        ) : null}
        {active.length ? (
          <section className="card stack" aria-labelledby="hub-active">
            <h2 id="hub-active">Permintaan aktif</h2>
            <ul className="list">
              {active.map((r) => (
                <li key={r.id} className="list-item">
                  <Circle icon="calendar" />
                  <div>
                    <strong>{`Ke ${r.destinationName}`}</strong>
                    <small>{`${formatSchedule(r.scheduledStart)}. ${requestStatusText(r)}`}</small>
                  </div>
                  <LinkBtn label="Lihat" route="assistance-status" kind="sm" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="card stack">
          <LinkBtn label="Minta Pendamping" route="assistance-form" kind="primary full" icon="handshake" />
          <p className="small">
            Permintaan dikirim ke semua relawan yang sedang tersedia. Relawan yang bersedia menawarkan diri, lalu Anda memilih salah satu.
          </p>
        </section>
        <section className="card stack" aria-labelledby="hub-volunteers">
          <div className="row between">
            <h2 id="hub-volunteers">Relawan tersedia di sekitar Anda</h2>
            <LinkBtn label="Lihat semua" route="volunteers" kind="sm" />
          </div>
          {denied ? (
            <p>Izinkan akses lokasi untuk melihat relawan di sekitar Anda, atau pilih tujuan pada formulir untuk melihat relawan yang tersedia di sana.</p>
          ) : !pos || volunteers.loading || volunteers.error ? (
            <QueryNotice id="volunteers" loading={!volunteers.error} error={volunteers.error} text="Memuat relawan tersedia…" onRetry={volunteers.reload} />
          ) : volunteers.data?.length ? (
            <ul className="list">
              {volunteers.data.slice(0, 3).map((v) => (
                <VolunteerRow
                  key={v.id}
                  v={v}
                  action={<LinkBtn label={`Minta ke ${firstName(v.name)}`} route={inviteHref(v)} kind="sm primary" />}
                />
              ))}
            </ul>
          ) : (
            <p>Belum ada relawan yang tersedia saat ini. Anda tetap dapat mengajukan permintaan terjadwal.</p>
          )}
        </section>
      </div>
      <CommunityCta variant="assistance" />
    </div>
  );
}

function defaultHelp(profiles: string[]) {
  const on = new Set<string>();
  if (profiles.includes("wheelchair")) on.add("Bantu kursi roda");
  if (profiles.includes("blind")) on.add("Bacakan informasi").add("Memandu jalan");
  if (profiles.includes("low_vision") || profiles.includes("crutches") || !on.size) on.add("Memandu jalan");
  return on;
}

type Picking = "destination" | "meeting" | null;

const placeLocation = (name: string): LocationValue | null => {
  const p = placeByName(name);
  return p ? { name: p.name, address: `${p.kind}, Yogyakarta`, coord: placeCoord(p), source: "place" } : null;
};

export function AssistanceFormScreen() {
  const { state, update, go, toast, modal } = useApp();
  const params = useSearchParams();
  const [invite, setInvite] = useState(() => {
    const id = params.get("volunteer");
    return id ? { id, name: params.get("name") || "relawan" } : undefined;
  });
  const [destination, setDestination] = useState<LocationValue | null>(() => state.pendingDestination || placeLocation(state.destination));
  const [meeting, setMeeting] = useState<LocationValue | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const [errors, setErrors] = useState<{ destination?: string; meeting?: string }>({});
  const [busy, setBusy] = useState(false);
  const help = defaultHelp(state.profiles);
  const nextHour = `${String((new Date().getHours() + 1) % 24).padStart(2, "0")}:00`;

  useEffect(() => {
    if (state.pendingDestination) update({ pendingDestination: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closePicker = (field: Exclude<Picking, null>) => {
    setPicking(null);
    setTimeout(() => document.getElementById(`loc-${field}`)?.focus(), 0);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) || "");
    const labels = fd.getAll("help").map(String);
    const assistanceTypes = HELP.filter(([label]) => labels.includes(label)).map(([, t]) => t);
    const errs = {
      destination: destination ? undefined : "Pilih tujuan terlebih dahulu.",
      meeting: meeting ? undefined : "Pilih titik temu terlebih dahulu.",
    };
    setErrors(errs);
    if (errs.destination || errs.meeting) {
      document.getElementById(errs.destination ? "loc-destination" : "loc-meeting")?.focus();
      toast(errs.destination || errs.meeting!);
      return;
    }
    if (!assistanceTypes.length) {
      toast("Pilih minimal satu jenis bantuan.");
      return;
    }
    if (!v("date") || !v("time")) {
      toast("Isi tanggal dan jam mulai.");
      return;
    }
    const scheduledStart = wibIso(v("date"), v("time"));
    if (new Date(scheduledStart).getTime() <= Date.now()) {
      toast("Jadwal harus di masa depan.");
      return;
    }
    const durationMin = DURATIONS[v("duration")] ?? 60;
    const send = async (invitedVolunteerId?: string) => {
      setBusy(true);
      try {
        await companionsApi.create({
          destinationName: destination!.name,
          destinationLocation: { type: "Point", coordinates: destination!.coord },
          meetingPointLocation: { type: "Point", coordinates: meeting!.coord },
          ...(meeting!.note ? { meetingPointNote: meeting!.note } : {}),
          scheduledStart,
          estimatedDurationMin: durationMin,
          assistanceTypes,
          ...(v("notes").trim() ? { notes: v("notes").trim() } : {}),
          ...(invitedVolunteerId ? { invitedVolunteerId } : {}),
        });
        update({ destination: destination!.name, requestTab: "Menunggu" });
        go("assistance-status");
        toast(invitedVolunteerId ? `Permintaan dikirim ke ${invite?.name}. Menunggu jawabannya.` : "Permintaan dikirim ke relawan yang tersedia.");
      } catch (err) {
        if (invitedVolunteerId && err instanceof ApiError && err.code === "VOLUNTEER_UNAVAILABLE") {
          modal({
            title: "Relawan tidak tersedia",
            body: <p>{err.message}</p>,
            confirmLabel: "Siarkan ke semua relawan",
            cancelLabel: "Pilih relawan lain",
            onConfirm: () => {
              setInvite(undefined);
              void send();
            },
            onCancel: () => {
              const q = new URLSearchParams({
                lng: String(destination!.coord[0]),
                lat: String(destination!.coord[1]),
                start: scheduledStart,
                dur: String(durationMin),
              });
              go(`volunteers?${q}`);
            },
          });
        } else {
          toast(errorMessage(err));
        }
      } finally {
        setBusy(false);
      }
    };
    await send(invite?.id);
  };

  const knownPlaces = PLACES.slice(0, 5).map((p) => ({ label: p.name, detail: p.kind, icon: p.icon, value: placeLocation(p.name)! }));

  return (
    <>
      {picking === "destination" ? (
        <LocationPicker
          title="Pilih tujuan"
          subtitle="Ke mana Anda akan pergi? Cari alamat atau nama tempat."
          initial={destination}
          shortcuts={knownPlaces}
          onPick={(v) => {
            setDestination(v);
            setErrors((e) => ({ ...e, destination: undefined }));
            closePicker("destination");
          }}
          onCancel={() => closePicker("destination")}
        />
      ) : null}
      {picking === "meeting" ? (
        <LocationPicker
          title="Pilih titik temu"
          subtitle="Di mana relawan menjemput Anda? Bisa rumah Anda sendiri."
          initial={meeting}
          allowSave
          shortcuts={
            destination
              ? [
                  {
                    label: `Di tujuan: ${destination.name}`,
                    detail: "Bertemu langsung di lokasi tujuan",
                    icon: "flag",
                    value: { ...destination, note: undefined },
                  },
                ]
              : []
          }
          onPick={(v) => {
            setMeeting(v);
            setErrors((e) => ({ ...e, meeting: undefined }));
            closePicker("meeting");
          }}
          onCancel={() => closePicker("meeting")}
        />
      ) : null}

      <div className="content-page narrow" hidden={!!picking}>
        <Heading title="Formulir pendampingan" subtitle="Tentukan tujuan dan titik temu, periksa isian, lalu ajukan." back="assistance" />
        {invite ? (
          <div className="notice mb-[12px]">
            {`Permintaan langsung ke ${invite.name}. Jika ${firstName(invite.name)} tidak dapat menerima, Anda bisa meneruskannya ke relawan lain tanpa mengisi ulang.`}{" "}
            <Btn label="Ajukan ke semua relawan tersedia" action="invite-clear" kind="sm" onClick={() => setInvite(undefined)} />
          </div>
        ) : null}
        <form className="card stack" data-form="assistance" onSubmit={onSubmit} noValidate>
          <LocationField
            id="loc-destination"
            label="Tujuan"
            value={destination}
            placeholder="Pilih tujuan"
            error={errors.destination}
            onOpen={() => setPicking("destination")}
          />
          <LocationField
            id="loc-meeting"
            label="Titik temu"
            value={meeting}
            placeholder="Pilih titik temu"
            error={errors.meeting}
            onOpen={() => setPicking("meeting")}
          />
          {destination && meeting ? (
            <section className="stack-sm" aria-labelledby="meet-summary">
              <h3 id="meet-summary">Ringkasan lokasi</h3>
              <RequestPointsMap
                destination={destination.coord}
                meeting={meeting.coord}
                label={`Peta ringkasan: tujuan ${destination.name}, titik temu ${meeting.name}.`}
              />
              <p className="small">{`Tujuan: ${destination.name}. Titik temu: ${meeting.name}${meeting.note ? `, ${meeting.note}` : ""}.`}</p>
            </section>
          ) : null}
          <div className="grid-2">
            <TextField label="Tanggal mulai" name="date" value={new Date().toLocaleDateString("en-CA")} type="date" required />
            <TextField label="Jam mulai" name="time" value={nextHour} type="time" required />
          </div>
          <SelectField label="Perkiraan durasi" name="duration" options={["30 menit", "1 jam", "2 jam", "3 jam"]} />
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-[12px] text-[16px]">Jenis bantuan (pilih satu atau lebih)</legend>
            <div className="grid-2">
              {["Memandu jalan", "Bantu kursi roda", "Bacakan informasi", "Dampingi acara"].map((t) => (
                <label key={t} className="check">
                  <input type="checkbox" name="help" value={t} defaultChecked={help.has(t)} />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <AreaField label="Catatan (opsional)" name="notes" placeholder="Ceritakan kebutuhan Anda..." />
          <button type="submit" className="btn primary full" disabled={busy}>
            {invite ? `Kirim ke ${firstName(invite.name)}` : "Ajukan Permintaan"}
          </button>
        </form>
      </div>
    </>
  );
}

export function AssistanceStatusScreen() {
  const { state, update, toast, confirmModal, go } = useApp();
  const requests = useCompanionRequests();
  const list = (requests.data ?? []).filter((r) => TABS[state.requestTab]?.includes(r.status));

  const act = (run: () => Promise<unknown>, done: string) =>
    run()
      .then(() => toast(done))
      .catch((e) => toast(errorMessage(e)))
      .finally(requests.reload);

  const cancel = (r: CompanionRequest) =>
    confirmModal(
      "Batalkan pendampingan",
      `Batalkan pendampingan ke ${r.destinationName} pada ${formatSchedule(r.scheduledStart)}? Relawan diberi tahu dan pembatalan tercatat pada riwayat.`,
      () => act(() => companionsApi.cancel(r.id, "Dibatalkan oleh pengguna."), "Pendampingan dibatalkan."),
    );

  return (
    <div className="content-page narrow">
      <Heading
        title="Permintaan pendampingan"
        subtitle="Relawan mengajukan diri atau menjawab permintaan Anda. Anda yang memilih siapa yang mendampingi."
        back="assistance"
        actions={<LinkBtn label="Ajukan baru" route="assistance-form" kind="primary" icon="plus" />}
      />
      <div className="card stack">
        <div className="tabs">
          {Object.keys(TABS).map((t) => (
            <button
              key={t}
              className={`tab ${state.requestTab === t ? "active" : ""}`}
              data-request-tab={t}
              onClick={() => update({ requestTab: t })}
            >
              {t}
            </button>
          ))}
        </div>
        {requests.error && !requests.data ? (
          <QueryNotice id="requests" loading={false} error={requests.error} text="" onRetry={requests.reload} />
        ) : requests.loading && !requests.data ? (
          <QueryNotice id="requests" loading error={null} text="Memuat permintaan pendampingan…" onRetry={requests.reload} />
        ) : list.length ? (
          list.map((r) => {
            const [badge, kind] = STATUS_BADGE[r.status];
            const reinvite = r.status === "invite_declined" || r.status === "invite_expired";
            return (
              <div key={r.id} className="card border stack">
                <div className="row between">
                  <h3>Pendampingan ke {r.destinationName}</h3>
                  <Badge label={badge} kind={kind} />
                </div>
                <p>{formatSchedule(r.scheduledStart)}</p>
                {r.status === "invited" ? (
                  <div className="notice">
                    {`${requestStatusText(r)}. Jika tidak dijawab sampai batas waktu, Anda akan diberi tahu dan dapat meneruskannya ke relawan lain.`}
                  </div>
                ) : reinvite ? (
                  <div className="warning">
                    <Icon name="triangle-alert" />
                    {requestStatusText(r)}
                    {requests.reasons[r.id] ? `. Alasan: ${requests.reasons[r.id]}` : ""}
                  </div>
                ) : (
                  <small>{requestStatusText(r)}</small>
                )}
                <div className="row">
                  {reinvite ? (
                    <Btn
                      label="Siarkan ke relawan lain"
                      action="invite-fallback"
                      kind="primary"
                      onClick={() => act(() => companionsApi.broadcast(r.id), "Permintaan diteruskan ke relawan yang tersedia.")}
                    />
                  ) : r.status === "open" ? (
                    <LinkBtn label="Lihat penawaran relawan" route={`volunteer-offers?id=${r.id}`} kind="primary" />
                  ) : r.status === "confirmed" ? (
                    <LinkBtn label="Lihat Detail" route={`assistance-detail?id=${r.id}`} kind="primary" />
                  ) : r.status === "completed" ? (
                    <Btn label="Beri rating" action="rate-assistance" kind="primary" onClick={() => go(`assistance-rating?id=${r.id}`)} />
                  ) : null}
                  {ACTIVE.includes(r.status) ? (
                    <Btn label="Batalkan" action="cancel-assistance" kind="sm" data-request-id={r.id} onClick={() => cancel(r)} />
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            title={
              state.requestTab === "Menunggu" ? "Belum ada permintaan menunggu" : "Tidak ada pendampingan " + state.requestTab.toLowerCase()
            }
            text="Minta Pendamping untuk perjalanan berikutnya."
            label="Ajukan permintaan"
            route="assistance-form"
          />
        )}
      </div>
    </div>
  );
}

function VolunteersList({ offers }: { offers: boolean }) {
  const params = useSearchParams();
  const { go, toast } = useApp();
  const device = useDevicePosition();
  const lng = Number(params.get("lng"));
  const lat = Number(params.get("lat"));
  const at: LngLat | null = params.get("lng") && Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : device.pos;
  const start = params.get("start") || undefined;
  const dur = Number(params.get("dur")) || undefined;
  const requestId = params.get("id");

  const available = useApiQuery<AvailableVolunteer[]>(!offers && at ? () => companionsApi.available(at, start, dur) : null, [
    offers,
    at?.[0],
    at?.[1],
    start,
    dur,
  ]);
  const offerList = useApiQuery(offers && requestId ? () => companionsApi.offers(requestId) : null, [offers, requestId]);
  const q = offers ? offerList : available;

  const choose = (offerId: string, name: string) =>
    companionsApi
      .select(requestId!, offerId)
      .then(() => {
        go(`assistance-detail?id=${requestId}`);
        toast(`Pendampingan dikonfirmasi bersama ${name}.`);
      })
      .catch((e) => {
        toast(errorMessage(e));
        offerList.reload();
      });

  const waiting = offers ? !requestId : !at && !device.denied;
  return (
    <div className="content-page">
      <Heading
        title={offers ? "Pilih relawan" : "Relawan terdekat"}
        subtitle={
          offers ? "Anda memilih siapa yang akan mendampingi." : "Relawan terverifikasi yang sedang tersedia di lingkungan sekitar."
        }
        back={offers ? "assistance-status" : "assistance"}
      />
      {offers ? null : (
        <div className="notice mb-[16px]">
          Relawan tidak pernah ditugaskan otomatis. Anda dapat meminta langsung ke relawan tertentu, atau mengajukan ke semua relawan tersedia
          lalu memilih dari yang menawarkan diri.
        </div>
      )}
      {!offers && !at && device.denied ? (
        <div className="notice">Izinkan akses lokasi, atau pilih tujuan pada formulir pendampingan untuk melihat relawan yang tersedia di sana.</div>
      ) : waiting || q.loading || q.error ? (
        <QueryNotice id="volunteers" loading={!q.error} error={q.error} text="Memuat relawan…" onRetry={q.reload} />
      ) : offers ? (
        offerList.data?.length ? (
          <div className="grid-3">
            {offerList.data.map((o) => (
              <section key={o.offerId} className="card stack">
                <div className="profile-card">
                  <Avatar name={o.volunteer.name} big />
                  <div>
                    <h3>{o.volunteer.name}</h3>
                    {o.volunteer.verificationStatus === "verified" ? <Badge label="Terverifikasi" kind="green" icon="badge-check" /> : null}
                  </div>
                </div>
                <div className="row">
                  <Badge label={o.volunteer.ratingAvg.toFixed(1)} kind="yellow" icon="star" />
                  <Badge label={`${o.volunteer.totalHelps} pendampingan`} />
                </div>
                {o.message ? <p>{o.message}</p> : null}
                <Btn
                  label="Pilih relawan ini"
                  action="choose-volunteer"
                  kind="primary full"
                  data-volunteer={o.volunteer.name}
                  onClick={() => choose(o.offerId, o.volunteer.name)}
                />
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Belum ada tawaran"
            text="Relawan yang bersedia akan muncul di sini. Anda diberi tahu saat ada tawaran baru."
            label="Kembali ke permintaan"
            route="assistance-status"
          />
        )
      ) : available.data?.length ? (
        <div className="grid-3">
          {available.data.map((v) => (
            <section key={v.id} className="card stack">
              <div className="profile-card">
                <Avatar name={v.name} big />
                <div>
                  <h3>{v.name}</h3>
                  <Badge label="Terverifikasi" kind="green" icon="badge-check" />
                </div>
              </div>
              <div className="row">
                <Badge label={v.ratingAvg.toFixed(1)} kind="yellow" icon="star" />
                <Badge label={`${v.totalHelps} pendampingan`} />
                <Badge label={distanceText(v.distanceM)} kind="blue" icon="map-pin" />
                <Badge label="Tersedia" kind="green" icon="check" />
              </div>
              <LinkBtn label={`Minta ke ${firstName(v.name)}`} route={inviteHref(v)} kind="primary full" />
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Belum ada relawan tersedia"
          text="Tidak ada relawan yang tersedia untuk lokasi dan jadwal ini. Anda tetap dapat mengajukan permintaan ke semua relawan."
          label="Ajukan permintaan"
          route="assistance-form"
        />
      )}
    </div>
  );
}

export function VolunteersScreen({ offers = false }: { offers?: boolean }) {
  return (
    <Suspense fallback={null}>
      <VolunteersList offers={offers} />
    </Suspense>
  );
}

function DetailBody() {
  const params = useSearchParams();
  const { toast, modal, go, confirmModal } = useApp();
  const requests = useCompanionRequests();
  const [met, setMet] = useState(false);
  const id = params.get("id");
  const r = requests.data?.find((x) => (id ? x.id === id : x.status === "confirmed"));

  if (requests.error && !requests.data)
    return (
      <section className="card stack">
        <QueryNotice id="requests" loading={false} error={requests.error} text="" onRetry={requests.reload} />
      </section>
    );
  if (requests.loading && !requests.data)
    return (
      <section className="card stack">
        <QueryNotice id="requests" loading error={null} text="Memuat pendampingan…" onRetry={requests.reload} />
      </section>
    );
  if (!r)
    return (
      <section className="card">
        <EmptyState
          title="Belum ada pendampingan"
          text="Pilih relawan dari permintaan Anda terlebih dahulu."
          label="Minta Pendamping"
          route="assistance"
        />
      </section>
    );

  const name = r.selectedVolunteer?.name;
  const checkin = (type: "meet" | "complete") =>
    companionsApi
      .checkin(r.id, type)
      .then((res) => {
        if (type === "meet") {
          setMet(true);
          toast("Check-in tercatat. Relawan juga perlu mengonfirmasi pertemuan.");
        } else if (res.status === "completed") {
          go(`assistance-rating?id=${r.id}`);
        } else {
          toast("Penyelesaian Anda tercatat. Menunggu konfirmasi relawan.");
        }
      })
      .catch((e) => toast(errorMessage(e)))
      .finally(requests.reload);

  return (
    <div className="content-page narrow">
      <Heading title="Detail pendampingan" subtitle={STATUS_BADGE[r.status][0]} back="assistance-status" />
      <section className="card stack">
        <div className="profile-card">
          <Avatar name={name || "Relawan"} big />
          <div>
            <h2>{name || "Menunggu relawan"}</h2>
            {name ? <Badge label="Terverifikasi" kind="green" icon="badge-check" /> : null}
          </div>
        </div>
        <hr className="divider" />
        <h3>{r.destinationName}</h3>
        <p>{formatSchedule(r.scheduledStart)}</p>
        {r.status === "confirmed" ? (
          <div className="row">
            <Btn label="Saya sudah bertemu" action="checkin" kind="primary" icon="check" onClick={() => void checkin("meet")} />
            <Btn
              label="Pendampingan selesai"
              action="finish-assistance"
              icon="flag"
              onClick={() =>
                modal({
                  title: "Selesaikan pendampingan",
                  body: <p>Pendampingan selesai setelah Anda dan relawan sama-sama menyatakan selesai.</p>,
                  confirmLabel: "Ya, sudah selesai",
                  onConfirm: () => void checkin("complete"),
                })
              }
            />
            <Btn
              label="Batalkan"
              action="cancel-assistance"
              kind="sm"
              data-request-id={r.id}
              onClick={() =>
                confirmModal("Batalkan pendampingan", `Batalkan pendampingan dengan ${name} pada ${formatSchedule(r.scheduledStart)}? Relawan diberi tahu.`, () =>
                  companionsApi
                    .cancel(r.id, "Dibatalkan oleh pengguna.")
                    .then(() => {
                      go("assistance-status");
                      toast("Pendampingan dibatalkan.");
                    })
                    .catch((e) => toast(errorMessage(e))),
                )
              }
            />
          </div>
        ) : null}
        <p>Check-in dilakukan oleh Anda dan relawan. Keduanya harus mengonfirmasi pertemuan.</p>
        <div id="checkin-status" className="small" role="status">
          {r.checkins.requester
            ? r.checkins.volunteer
              ? "Anda dan relawan sudah menyatakan selesai."
              : "Penyelesaian Anda tercatat. Menunggu konfirmasi relawan."
            : met
              ? "Check-in pertemuan Anda tercatat."
              : ""}
        </div>
      </section>
    </div>
  );
}

export function AssistanceDetailScreen() {
  return (
    <Suspense fallback={null}>
      <DetailBody />
    </Suspense>
  );
}

function RatingBody() {
  const params = useSearchParams();
  const { update, go, toast, stateRef } = useApp();
  const requests = useCompanionRequests();
  const [busy, setBusy] = useState(false);
  const id = params.get("id");
  const r = requests.data?.find((x) => (id ? x.id === id : x.status === "completed"));
  const name = r?.selectedVolunteer?.name || "relawan";
  return (
    <div className="content-page narrow">
      <Heading title="Beri rating pendampingan" subtitle="Terima kasih sudah saling mendukung." back="assistance-status" />
      <form
        className="card stack"
        data-form="assistance-rating"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stateRef.current.rating) {
            toast("Pilih rating terlebih dahulu.");
            return;
          }
          if (!r?.selectedVolunteer || busy) return;
          setBusy(true);
          companionsApi
            .rate(r.selectedVolunteer.id, r.id, stateRef.current.rating)
            .then(() => {
              update({ rating: 0 });
              go("assistance-status");
              toast("Terima kasih. Rating Anda terkirim.");
            })
            .catch((err) => toast(errorMessage(err)))
            .finally(() => setBusy(false));
        }}
      >
        <div className="profile-card">
          <Avatar name={name} big />
          <h2>{name}</h2>
        </div>
        <RatingButtons />
        <AreaField label="Ulasan (opsional)" name="review" placeholder="Ceritakan pengalaman pendampingan..." />
        <button type="submit" className="btn primary" disabled={!r || busy}>
          Kirim Rating
        </button>
      </form>
    </div>
  );
}

export function AssistanceRatingScreen() {
  return (
    <Suspense fallback={null}>
      <RatingBody />
    </Suspense>
  );
}
