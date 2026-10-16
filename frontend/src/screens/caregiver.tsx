"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import { FamilyTimeline, Heading } from "@/components/shared";
import { Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, TextField } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { firstName, useDependents, wibTime, type TripStatus } from "@/hooks/useDependents";
import { isSeniorRole } from "@/lib/access";
import { api, errorMessage } from "@/lib/api-client";
import { SHARING_NOTE, SHARING_OPTIONS } from "@/lib/data";
import { type Sharing } from "@/lib/demo-state";
import type { Dependent, SosTriggerResult } from "@/types/api";

// How the senior's chosen mode reads on the family side (UI_UX_FLOW §7: say it honestly).
const SHARING_BADGE: Record<Sharing, string> = {
  during_trip: "Berbagi selama perjalanan",
  sos_only: "Berbagi saat SOS",
  off: "Tidak berbagi lokasi",
};

const TIMELINE_EMPTY =
  "Belum ada kabar perjalanan sejak halaman ini dibuka. Berangkat, tiba, terlambat, dan terhenti akan dicatat di sini.";

// Status is never conveyed by colour alone: every state has its own icon and sentence.
const STATUS_ICON: Record<TripStatus, string> = {
  idle: "house",
  active: "navigation",
  paused: "pause",
  overdue: "clock",
  stalled: "triangle-alert",
};

function statusText(d: Dependent, status: TripStatus) {
  const s = d.activeSession;
  const to = s?.destinationName ?? "tujuan";
  switch (status) {
    case "active":
      return `Dalam perjalanan ke ${to}` + (s?.estimatedArrival ? ` · perkiraan tiba ${wibTime(s.estimatedArrival)}` : "");
    case "paused":
      return `Aplikasi tidak aktif sejak ${wibTime(s?.pausedAt)}`;
    case "overdue":
      return s?.estimatedArrival ? `Belum tiba, lewat dari perkiraan ${wibTime(s.estimatedArrival)}` : "Belum tiba, lebih lama dari perkiraan";
    case "stalled":
      return `${firstName(d.name)} belum menjawab cek keadaan`;
    default:
      return d.locationSharingMode === "off" ? "Tidak membagikan kabar perjalanan" : "Tidak sedang dalam perjalanan";
  }
}

const canSeeMap = (d: Dependent) => d.locationSharingMode === "during_trip" && !!d.activeSession;

/** Shown when a help request reached no one: never only a toast (CLAUDE.md §5.4). */
function SosFallback({ reason, d }: { reason: string; d: Dependent }) {
  return (
    <div className="stack">
      <p>{reason}</p>
      <a className="btn danger full" href="tel:112">
        <Icon name="phone" />
        Hubungi 112
      </a>
      <a className="btn full" href={`tel:${d.phoneNumber}`}>
        <Icon name="phone" />
        Telepon {firstName(d.name)}
      </a>
    </div>
  );
}

function useHelpRequest() {
  const { modal, announce, toast, confirmModal } = useApp();
  const [sending, setSending] = useState<string | null>(null);

  const fallback = (d: Dependent, reason: string) =>
    modal({
      title: "Permintaan bantuan belum sampai ke relawan",
      body: <SosFallback reason={reason} d={d} />,
      hideCancel: true,
      confirmLabel: "Tutup",
    });

  const trigger = async (d: Dependent) => {
    setSending(d.userId);
    try {
      const r = await api<SosTriggerResult>("/sos/trigger", {
        method: "POST",
        body: JSON.stringify({ triggerType: "caregiver", onBehalfOfUserId: d.userId }),
      });
      if (r.notifiedVolunteers === 0)
        fallback(d, `Belum ada relawan yang bisa dihubungi di sekitar lokasi terakhir ${firstName(d.name)}. Hubungi 112 atau telepon langsung.`);
      else {
        toast(`Permintaan bantuan terkirim ke ${r.notifiedVolunteers} relawan terdekat.`);
        announce(`Permintaan bantuan terkirim. Relawan terdekat sedang diberi tahu lokasi terakhir ${firstName(d.name)}.`);
      }
    } catch (e) {
      fallback(d, errorMessage(e));
    } finally {
      setSending(null);
    }
  };

  const ask = (d: Dependent) =>
    confirmModal(
      "Minta bantuan relawan?",
      `Relawan terdekat akan diberi tahu lokasi terakhir ${firstName(d.name)}. Gunakan bila Anda tidak bisa menghubunginya.`,
      () => void trigger(d),
      true,
    );

  return { ask, sending };
}

function TripStatusBlock({ d, status }: { d: Dependent; status: TripStatus }) {
  const { ask, sending } = useHelpRequest();
  if (status === "idle") return null;
  const text = statusText(d, status);
  if (status === "stalled")
    return (
      <div className="stack">
        {/* Assertive on purpose: the only family status that needs action (FE-GUIDE-F5-F9 §1.3). */}
        <div className="warning red" role="alert">
          <Icon name={STATUS_ICON.stalled} />
          <span>
            <strong>{text}.</strong> Aplikasinya tidak aktif sejak {wibTime(d.activeSession?.pausedAt) || "beberapa saat lalu"}.
          </span>
        </div>
        <div className="row">
          <a className="btn primary" href={`tel:${d.phoneNumber}`}>
            <Icon name="phone" /> Telepon {firstName(d.name)}
          </a>
          <Btn
            label={sending === d.userId ? "Mengirim permintaan…" : "Minta bantuan relawan"}
            action="caregiver-sos"
            kind="danger"
            icon="siren"
            disabled={sending === d.userId}
            onClick={() => ask(d)}
          />
        </div>
      </div>
    );
  return (
    <div className={status === "overdue" ? "warning" : "notice"}>
      <Icon name={STATUS_ICON[status]} /> {text}
    </div>
  );
}

function DependentCard({ d, status }: { d: Dependent; status: TripStatus }) {
  return (
    <section className="card stack" aria-labelledby={`dependent-${d.userId}`}>
      <div className="profile-card">
        <Avatar name={d.name} big />
        <div>
          <h2 id={`dependent-${d.userId}`}>{d.name}</h2>
          <p>{status === "idle" ? statusText(d, status) : "Sedang dalam perjalanan"}</p>
        </div>
      </div>
      <Badge label={SHARING_BADGE[d.locationSharingMode] ?? SHARING_BADGE.sos_only} kind="blue" icon="shield-check" />
      <TripStatusBlock d={d} status={status} />
      {canSeeMap(d) ? (
        <LinkBtn label="Pantau Perjalanan" route={`monitor?user=${d.userId}`} kind="primary full" icon="map-pin" />
      ) : d.activeSession && d.locationSharingMode === "sos_only" ? (
        <div className="notice">Lokasi hanya dibagikan saat darurat. Posisi tidak dibagikan saat ini.</div>
      ) : null}
    </section>
  );
}

function LoadingCard() {
  return (
    <section className="card" aria-busy="true">
      <p className="sr-only">Memuat data keluarga…</p>
      <div className="skeleton line" aria-hidden="true"></div>
      <div className="skeleton line" aria-hidden="true"></div>
    </section>
  );
}

function LoadError({ message, onRetry, stale }: { message: string; onRetry: () => void; stale?: boolean }) {
  return (
    <div className={stale ? "warning" : "warning red"} role={stale ? "status" : "alert"}>
      <Icon name="wifi-off" />
      <span>
        {stale ? "Data keluarga belum diperbarui. " : ""}
        {message} <Btn label="Coba lagi" action="reload-dependents" kind="sm" onClick={onRetry} />
      </span>
    </div>
  );
}

function NoDependents() {
  return (
    <section className="card empty">
      <Circle icon="users" />
      <h2>Belum ada anggota keluarga yang menautkan Anda</h2>
      <p>Minta anggota keluarga menautkan nomor telepon Anda dari aplikasinya. Setelah tertaut, status perjalanannya tampil di sini.</p>
    </section>
  );
}

export function CaregiverScreen() {
  const { list, error, loading, reload, statusOf, events } = useDependents();
  return (
    <div className="content-page">
      <Heading
        title="Keluarga"
        subtitle="Lokasi hanya ditampilkan sesuai izin pengguna."
        back=""
        actions={<LinkBtn label="Kelola tautan" route="caregiver-link" icon="link" />}
      />
      {error ? <LoadError message={error} onRetry={() => void reload()} stale={!!list} /> : null}
      {loading ? (
        <LoadingCard />
      ) : list?.length === 0 ? (
        <NoDependents />
      ) : list ? (
        <div className="grid-2">
          {list.map((d) => (
            <DependentCard key={d.userId} d={d} status={statusOf(d)} />
          ))}
          <section className="card stack">
            <h3>Kontak dan persetujuan</h3>
            <p>Berbagi lokasi dapat diubah atau dihentikan oleh pengguna kapan saja. {SHARING_NOTE}</p>
            <p>Kabar berangkat, tiba, terlambat, dan terhenti dikirim selama mode berbagi bukan &ldquo;Tidak berbagi&rdquo;.</p>
          </section>
        </div>
      ) : null}
      <FamilyTimeline events={events} emptyText={TIMELINE_EMPTY} />
    </div>
  );
}

export function MonitorScreen() {
  const params = useSearchParams();
  const { list, error, loading, reload, statusOf, events } = useDependents();
  const wanted = params.get("user");
  const d = list?.find((x) => x.userId === wanted) ?? list?.find(canSeeMap) ?? list?.find((x) => x.activeSession) ?? list?.[0];

  if (!d || !canSeeMap(d)) {
    const status = d ? statusOf(d) : "idle";
    return (
      <div className="content-page narrow">
        <Heading title={d ? "Pantau perjalanan " + firstName(d.name) : "Pantau perjalanan"} back="caregiver" />
        {error ? <LoadError message={error} onRetry={() => void reload()} stale={!!list} /> : null}
        {loading ? (
          <LoadingCard />
        ) : list?.length === 0 ? (
          <NoDependents />
        ) : d ? (
          <section className="card stack">
            {d.activeSession && d.locationSharingMode === "sos_only" ? (
              <>
                {/* sos_only: trip status yes, map no (UI_UX_FLOW §7). */}
                <TripStatusBlock d={d} status={status} />
                <div className="notice">Lokasi hanya dibagikan saat darurat. Peta tidak ditampilkan selama perjalanan biasa.</div>
              </>
            ) : (
              <EmptyState
                title={d.locationSharingMode === "off" ? "Tidak berbagi kabar perjalanan" : "Tidak ada perjalanan aktif"}
                text={
                  d.locationSharingMode === "off"
                    ? `${firstName(d.name)} memilih tidak berbagi lokasi maupun kabar perjalanan.`
                    : `${firstName(d.name)} sedang tidak dalam perjalanan. Status berubah otomatis saat berangkat.`
                }
                label="Kembali ke keluarga"
                route="caregiver"
              />
            )}
            <FamilyTimeline events={events} emptyText={TIMELINE_EMPTY} />
          </section>
        ) : null}
      </div>
    );
  }

  const s = d.activeSession!;
  return (
    <MapStage
      id="monitor-sheet"
      ariaLabel="Pantauan perjalanan"
      skipLabel="Lewati ke rincian pantauan"
      name="pantauan"
      map={
        <AppMap
          filters={false}
          label="Peta pemantauan"
          summary="Peta skematis lingkungan sekitar, data demonstrasi. Posisi tetap; tidak ada pelacakan GPS pihak lain."
        />
      }
    >
      <div className="peek-keep peek-sub">
        <Heading
          title={"Pantau perjalanan " + firstName(d.name)}
          subtitle={s.lastPingAt ? `Lokasi terakhir diterima pukul ${wibTime(s.lastPingAt)}` : "Belum ada lokasi yang diterima"}
          back="caregiver"
        />
      </div>
      <section className="card stack">
        {error ? <LoadError message={error} onRetry={() => void reload()} stale /> : null}
        <h2>{s.destinationName ?? "Tujuan belum dinamai"}</h2>
        <p>Berangkat pukul {wibTime(s.startedAt)}</p>
        <Badge label="Lokasi selama perjalanan" kind="blue" icon="shield-check" />
        <TripStatusBlock d={d} status={statusOf(d)} />
        <FamilyTimeline events={events} emptyText={TIMELINE_EMPTY} />
      </section>
    </MapStage>
  );
}

export function CaregiverLinkScreen() {
  const { state, update, go, toast, confirmModal } = useApp();
  const senior = isSeniorRole(state);
  return (
    <div className="content-page narrow">
      <Heading
        title="Tautkan anggota keluarga"
        subtitle="Anda menentukan kapan lokasi boleh dibagikan."
        back={senior ? "home" : "caregiver"}
      />
      <form
        className="card stack"
        data-form="caregiver"
        key={state.contactName + "|" + state.contactPhone}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          update({
            contactName: String(fd.get("contactName") || ""),
            contactPhone: String(fd.get("contactPhone") || ""),
            sharing: String(fd.get("sharing") || "") as Sharing,
          });
          go(senior ? "home" : "caregiver");
          toast("Preferensi keluarga demo tersimpan.");
        }}
      >
        <TextField label="Nama anggota keluarga" name="contactName" value={state.contactName} placeholder="Nama anggota keluarga" />
        <TextField label="Nomor telepon" name="contactPhone" value={state.contactPhone} placeholder="08xxxxxxxxxx" type="tel" />
        <fieldset className="sharing-options">
          <legend>Kapan lokasi boleh dibagikan?</legend>
          {SHARING_OPTIONS.map(([v, t, d]) => (
            <label key={v} className="choice">
              <input type="radio" name="sharing" value={v} defaultChecked={state.sharing === v} />
              <span>
                <strong>{t}</strong>
                <small>{d}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <p>{SHARING_NOTE}</p>
        <button className="btn primary" type="submit">
          Simpan tautan demo
        </button>
        <Btn
          label="Putuskan tautan keluarga"
          action="unlink-caregiver"
          kind="danger"
          onClick={() =>
            confirmModal(
              "Putuskan tautan keluarga",
              `Putuskan tautan ${state.contactName || "anggota keluarga"}? Keluarga tidak lagi mendapat informasi perjalanan dan SOS dari akun Anda.`,
              () => {
                update({ contactName: "", contactPhone: "" });
                toast("Tautan keluarga demo diputuskan.");
              },
            )
          }
        />
      </form>
    </div>
  );
}
