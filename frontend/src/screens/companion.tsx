"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LocationField, LocationPicker } from "@/components/location/LocationPicker";
import { CommunityCta, Heading, RatingButtons } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, SelectField, TextField } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { AVAILABLE_VOLUNTEERS, VOLUNTEERS, volunteerById, type Volunteer } from "@/lib/data";
import type { AssistanceRequest } from "@/lib/demo-state";
import type { LocationValue } from "@/lib/geocode";
import { PLACES, placeByName, placeCoord } from "@/lib/places";

const RequestPointsMap = dynamic(() => import("@/components/map/RequestPointsMap"), { ssr: false });

function useRequests() {
  const app = useApp();
  const patchRequest = (id: number, patch: Partial<AssistanceRequest>) =>
    app.update((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const cancel = (r: AssistanceRequest) =>
    app.confirmModal(
      "Batalkan pendampingan",
      `Batalkan pendampingan dengan ${r.volunteer || "relawan"} pada ${r.date} pukul ${r.time}? Pada layanan produksi, relawan diberi tahu dan pembatalan tercatat pada riwayat.`,
      () => {
        patchRequest(r.id, { status: "Dibatalkan" });
        app.go("assistance-status");
        app.toast("Pendampingan demo dibatalkan.");
      },
    );
  return { ...app, patchRequest, cancel };
}

const firstName = (name: string) => name.split(" ")[0];
const ACTIVE = ["Menunggu", "Diterima"];

function VolunteerRow({ v, action }: { v: Volunteer; action: React.ReactNode }) {
  return (
    <li className="list-item">
      <Avatar name={v.name} />
      <div>
        <strong>{v.name}</strong>
        <small>{`Rating ${v.rating}, ${v.count} pendampingan, ${v.distance}`}</small>
      </div>
      <Badge label="Tersedia" kind="green" icon="check" />
      {action}
    </li>
  );
}

function requestStatusText(r: AssistanceRequest) {
  if (r.status === "Diterima") return `Dikonfirmasi bersama ${r.volunteer}`;
  if (r.mode === "invite" && r.inviteStatus === "pending") return `Menunggu jawaban ${r.invitedVolunteer}`;
  if (r.mode === "invite" && r.inviteStatus === "declined") return `${r.invitedVolunteer} tidak dapat menerima`;
  return "Menunggu relawan menawarkan diri";
}

export function AssistanceHubScreen() {
  const { state } = useApp();
  const active = state.requests.filter((r) => ACTIVE.includes(r.status));
  const hidden = VOLUNTEERS.length - AVAILABLE_VOLUNTEERS.length;
  return (
    <div className="content-page narrow">
      <Heading
        title="Minta Pendamping"
        subtitle="Relawan terverifikasi menemani perjalanan Anda. Anda yang memilih pendampingnya."
        back="home"
      />
      <div className="stack">
        {active.length ? (
          <section className="card stack" aria-labelledby="hub-active">
            <h2 id="hub-active">Permintaan aktif</h2>
            <ul className="list">
              {active.map((r) => (
                <li key={r.id} className="list-item">
                  <Circle icon="calendar" />
                  <div>
                    <strong>{`Ke ${r.destination}`}</strong>
                    <small>{`${r.date}, ${r.time}. ${requestStatusText(r)}`}</small>
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
          {AVAILABLE_VOLUNTEERS.length ? (
            <ul className="list">
              {AVAILABLE_VOLUNTEERS.slice(0, 3).map((v) => (
                <VolunteerRow
                  key={v.id}
                  v={v}
                  action={<LinkBtn label={`Minta ke ${firstName(v.name)}`} route={`assistance-form?volunteer=${v.id}`} kind="sm primary" />}
                />
              ))}
            </ul>
          ) : (
            <p>Belum ada relawan yang tersedia saat ini. Anda tetap dapat mengajukan permintaan terjadwal.</p>
          )}
          {hidden ? <p className="small">{`${hidden} relawan lain sedang tidak tersedia dan tidak ditampilkan.`}</p> : null}
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
  const { state, update, go, toast } = useApp();
  const params = useSearchParams();
  const [invite, setInvite] = useState<Volunteer | undefined>(() => volunteerById(params.get("volunteer")));
  const [destination, setDestination] = useState<LocationValue | null>(() => state.pendingDestination || placeLocation(state.destination));
  const [meeting, setMeeting] = useState<LocationValue | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const [errors, setErrors] = useState<{ destination?: string; meeting?: string }>({});
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

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) || "");
    const types = fd.getAll("help").map(String);
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
    if (!types.length) {
      toast("Pilih minimal satu jenis bantuan.");
      return;
    }
    update((s) => ({
      destination: destination!.name,
      requests: [
        ...s.requests,
        {
          id: Date.now(),
          destination: destination!.name,
          destinationAddress: destination!.address,
          destinationPoint: destination!.coord,
          date: v("date"),
          time: v("time"),
          duration: v("duration"),
          help: types,
          meeting: meeting!.name,
          meetingAddress: meeting!.address,
          meetingPoint: meeting!.coord,
          meetingNote: meeting!.note,
          notes: v("notes"),
          status: "Menunggu",
          mode: invite ? "invite" : "broadcast",
          invitedVolunteer: invite?.name,
          inviteStatus: invite ? "pending" : undefined,
        },
      ],
      requestTab: "Menunggu",
    }));
    go("assistance-status");
    toast(invite ? `Permintaan dikirim ke ${invite.name}. Menunggu jawabannya.` : "Permintaan dikirim ke relawan yang tersedia.");
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
          <button type="submit" className="btn primary full">
            {invite ? `Kirim ke ${firstName(invite.name)}` : "Ajukan Permintaan"}
          </button>
        </form>
      </div>
    </>
  );
}

export function AssistanceStatusScreen() {
  const { state, update, toast, cancel, patchRequest } = useRequests();
  const list = state.requests.filter((r) => r.status === state.requestTab);
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
          {["Menunggu", "Diterima", "Selesai"].map((t) => (
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
        {list.length ? (
          list.map((r) => {
            const invitePending = r.status === "Menunggu" && r.mode === "invite" && r.inviteStatus === "pending";
            const inviteDeclined = r.status === "Menunggu" && r.mode === "invite" && r.inviteStatus === "declined";
            const who = r.invitedVolunteer ? firstName(r.invitedVolunteer) : "";
            return (
              <div key={r.id} className="card border stack">
                <div className="row between">
                  <h3>Pendampingan ke {r.destination}</h3>
                  <Badge label={invitePending ? "Menunggu jawaban" : r.status} kind={r.status === "Selesai" ? "green" : "yellow"} />
                </div>
                <p>
                  {r.date}, {r.time}, {r.duration}
                </p>
                <small>{`Titik temu: ${r.meeting}${r.meetingAddress ? `, ${r.meetingAddress}` : ""}${r.meetingNote ? `. Patokan: ${r.meetingNote}` : ""}`}</small>
                {invitePending ? (
                  <>
                    <div className="notice">
                      {`Menunggu jawaban ${r.invitedVolunteer}. Relawan diberi waktu 30 menit untuk permintaan hari ini, atau 12 jam untuk jadwal berikutnya. Jika tidak dijawab, Anda akan diberi tahu.`}
                    </div>
                    <div className="row">
                      <Btn
                        label={`Simulasikan: ${who} menerima`}
                        action="simulate-accept"
                        kind="sm"
                        onClick={() => {
                          patchRequest(r.id, { status: "Diterima", volunteer: r.invitedVolunteer, inviteStatus: "accepted" });
                          update({ requestTab: "Diterima" });
                          toast(`${r.invitedVolunteer} menerima permintaan Anda (simulasi).`);
                        }}
                      />
                      <Btn
                        label={`Simulasikan: ${who} menolak`}
                        action="simulate-decline"
                        kind="sm"
                        onClick={() => {
                          patchRequest(r.id, { inviteStatus: "declined" });
                          toast(`${r.invitedVolunteer} tidak dapat menerima permintaan ini (simulasi).`);
                        }}
                      />
                    </div>
                  </>
                ) : null}
                {inviteDeclined ? (
                  <div className="warning">
                    <Icon name="triangle-alert" />
                    {`${r.invitedVolunteer} tidak dapat menerima permintaan ini.`}
                  </div>
                ) : null}
                <div className="row">
                  {inviteDeclined ? (
                    <Btn
                      label="Ajukan ke relawan lain yang tersedia"
                      action="invite-fallback"
                      kind="primary"
                      onClick={() => {
                        patchRequest(r.id, { mode: "broadcast", invitedVolunteer: undefined, inviteStatus: undefined });
                        toast("Permintaan diteruskan ke relawan yang tersedia.");
                      }}
                    />
                  ) : invitePending ? null : r.status === "Menunggu" ? (
                    <LinkBtn label="Lihat penawaran relawan" route="volunteer-offers" kind="primary" />
                  ) : (
                    <LinkBtn label="Lihat Detail" route="assistance-detail" kind="primary" />
                  )}
                  <Btn label="Batalkan" action="cancel-assistance" kind="sm" data-request-id={r.id} onClick={() => cancel(r)} />
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

export function VolunteersScreen({ offers = false }: { offers?: boolean }) {
  const { update, go, toast, stateRef } = useApp();
  const choose = (name: string) => {
    const s = stateRef.current;
    let requests = [...s.requests];
    let r = requests.at(-1);
    if (!r) {
      r = {
        // eslint-disable-next-line react-hooks/purity -- runs in a click handler, not during render
        id: Date.now(),
        destination: s.destination,
        date: new Date().toLocaleDateString("en-CA"),
        time: "09:00",
        duration: "1 jam",
        meeting: "Pintu masuk puskesmas",
        status: "Menunggu",
      };
      requests.push(r);
    }
    const id = r.id;
    requests = requests.map((x) => (x.id === id ? { ...x, volunteer: name, status: "Diterima" } : x));
    update({ requests, requestTab: "Diterima" });
    go("assistance-detail");
    toast("Pendampingan demo dikonfirmasi.");
  };
  const hidden = VOLUNTEERS.length - AVAILABLE_VOLUNTEERS.length;
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
          {`Relawan tidak pernah ditugaskan otomatis. Anda dapat meminta langsung ke relawan tertentu, atau mengajukan ke semua relawan tersedia lalu memilih dari yang menawarkan diri.${
            hidden ? ` ${hidden} relawan sedang tidak tersedia dan tidak ditampilkan.` : ""
          }`}
        </div>
      )}
      <div className="grid-3">
        {AVAILABLE_VOLUNTEERS.map((v) => (
          <section key={v.id} className="card stack">
            <div className="profile-card">
              <Avatar name={v.name} big />
              <div>
                <h3>{v.name}</h3>
                <Badge label="Terverifikasi" kind="green" icon="badge-check" />
              </div>
            </div>
            <div className="row">
              <Badge label={v.rating} kind="yellow" icon="star" />
              <Badge label={`${v.count} pendampingan`} />
              <Badge label={v.distance} kind="blue" icon="map-pin" />
              <Badge label="Tersedia" kind="green" icon="check" />
            </div>
            <p>{v.message}</p>
            {offers ? (
              <Btn
                label="Pilih relawan ini"
                action="choose-volunteer"
                kind="primary full"
                data-volunteer={v.name}
                onClick={() => choose(v.name)}
              />
            ) : (
              <LinkBtn label={`Minta ke ${firstName(v.name)}`} route={`assistance-form?volunteer=${v.id}`} kind="primary full" />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export function AssistanceDetailScreen() {
  const { state, patchRequest, cancel, toast, modal, go } = useRequests();
  const r = state.requests.find((x) => x.status === "Diterima") || state.requests.at(-1);
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
  const accepted = state.requests.find((x) => x.status === "Diterima");
  return (
    <div className="content-page narrow">
      <Heading title="Detail pendampingan" subtitle={r.status} back="assistance-status" />
      <section className="card stack">
        <div className="profile-card">
          <Avatar name={r.volunteer || "Rina Safitri"} big />
          <div>
            <h2>{r.volunteer || "Menunggu relawan"}</h2>
            <Badge label="Terverifikasi" kind="green" icon="badge-check" />
          </div>
        </div>
        <hr className="divider" />
        <h3>{r.destination}</h3>
        <p>
          {r.date}, {r.time}, {r.duration}
        </p>
        <p>Titik temu: {r.meeting}</p>
        <p>{r.notes || "Tidak ada catatan tambahan."}</p>
        <div className="row">
          <Btn
            label="Saya sudah bertemu"
            action="checkin"
            kind="primary"
            icon="check"
            onClick={() => {
              if (!accepted) return toast("Pilih relawan terlebih dahulu.");
              patchRequest(accepted.id, { checkin: true });
              toast("Check-in tercatat. Menunggu konfirmasi pihak relawan (simulasi).");
            }}
          />
          <Btn
            label="Pendampingan selesai"
            action="finish-assistance"
            icon="flag"
            onClick={() => {
              if (!accepted?.checkin) return toast("Lakukan check-in terlebih dahulu.");
              modal({
                title: "Selesaikan pendampingan",
                body: <p>Kedua pihak perlu mengonfirmasi penyelesaian. Pada demo ini, konfirmasi pihak relawan disimulasikan.</p>,
                confirmLabel: "Simulasikan konfirmasi kedua pihak",
                onConfirm: () => {
                  patchRequest(accepted.id, { status: "Selesai" });
                  go("assistance-rating");
                },
              });
            }}
          />
          <Btn label="Batalkan" action="cancel-assistance" kind="sm" data-request-id={r.id} onClick={() => cancel(r)} />
        </div>
        <p>Check-in dilakukan oleh Anda dan relawan. Keduanya harus mengonfirmasi pertemuan.</p>
        <div id="checkin-status" className="small">
          {r.checkin ? "Check-in Anda tercatat. Menunggu konfirmasi relawan (simulasi)." : ""}
        </div>
      </section>
    </div>
  );
}

export function AssistanceRatingScreen() {
  const { state, update, go, toast, stateRef } = useApp();
  const name = state.requests.at(-1)?.volunteer || "Rina Safitri";
  return (
    <div className="content-page narrow">
      <Heading title="Beri rating pendampingan" subtitle="Terima kasih sudah saling mendukung." back="assistance-status" />
      <form
        className="card stack"
        data-form="assistance-rating"
        onSubmit={(e) => {
          e.preventDefault();
          const s = stateRef.current;
          if (!s.rating) {
            toast("Pilih rating terlebih dahulu.");
            return;
          }
          const review = String(new FormData(e.currentTarget).get("review") || "");
          update({ ratings: [...s.ratings, { type: "assistance-rating", rating: s.rating, review }], rating: 0 });
          go("assistance-status");
          toast("Terima kasih. Masukan Anda tersimpan dalam demo.");
        }}
      >
        <div className="profile-card">
          <Avatar name={name} big />
          <h2>{name}</h2>
        </div>
        <RatingButtons />
        <AreaField label="Ulasan (opsional)" name="review" placeholder="Ceritakan pengalaman pendampingan..." />
        <button type="submit" className="btn primary">
          Kirim Rating
        </button>
      </form>
    </div>
  );
}
