"use client";

import { IMAGES } from "@/assets/images";
import { usePathname } from "next/navigation";
import { useApp } from "@/hooks/useApp";
import { isSeniorRole, roleHome } from "@/lib/access";
import { COMMUNITIES, PROFILES, PROFILE_SHORT, profileName, type ProfileId } from "@/lib/data";
import { routeStats, sharingText } from "@/lib/demo-state";
import type { Place } from "@/lib/places";
import { Icon } from "./ui/Icon";
import { Badge, Btn, Circle, LinkBtn } from "./ui/primitives";

export function useRoute() {
  const p = usePathname();
  return p === "/" ? "landing" : p.replace(/^\//, "");
}

export function Heading({
  title,
  subtitle,
  back = "home",
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string;
  actions?: React.ReactNode;
}) {
  const { state } = useApp();
  const route = useRoute();
  let b = back;
  if (b === "dashboard" || (b === "home" && !isSeniorRole(state))) b = roleHome(state);
  if (b === route) b = "";
  return (
    <div className="page-heading">
      {b ? <LinkBtn route={b} kind="btn-round" icon="chevron-left" /> : null}
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

function useToggleProfile() {
  const { update, announce, stateRef } = useApp();
  return (id: ProfileId) => {
    const on = !stateRef.current.profiles.includes(id);
    update((s) => ({ profiles: on ? [...s.profiles, id] : s.profiles.filter((p) => p !== id) }));
    announce((on ? "Dipilih: " : "Tidak dipilih: ") + profileName(id));
  };
}

export function ProfileChoices() {
  const { state } = useApp();
  const toggle = useToggleProfile();
  return (
    <div className="grid-2">
      {PROFILES.map(([id, title, ico, desc]) => {
        const on = state.profiles.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`choice ${on ? "selected" : ""}`}
            data-profile={id}
            aria-pressed={on}
            onClick={() => toggle(id)}
          >
            <Circle icon={ico} />
            <div>
              <strong>{title}</strong>
              <small>{desc}</small>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function MiniProfiles() {
  const { state } = useApp();
  const toggle = useToggleProfile();
  return (
    <div className="profile-mini">
      {PROFILES.map(([id, t, ico]) => {
        const on = state.profiles.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`choice ${on ? "selected" : ""}`}
            data-profile={id}
            aria-pressed={on}
            aria-label={t}
            title={t}
            onClick={() => toggle(id)}
          >
            <Icon name={ico} />
            <span>{PROFILE_SHORT[id]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RouteSummary() {
  const { state } = useApp();
  const s = routeStats(state);
  return (
    <div className="row">
      <Badge label={`${s.distance} m`} kind="yellow" icon="route" />
      <Badge label={`${s.time} menit`} kind="yellow" icon="clock" />
      <Badge label={`${s.obstacles} hambatan`} kind={s.obstacles ? "yellow" : "green"} icon="triangle-alert" />
    </div>
  );
}

export function FamilyStatus() {
  const { state } = useApp();
  return (
    <aside className="family-status peek-keep" aria-label="Pemantauan keluarga">
      <Icon name="users" />
      <div>
        <strong>Pemantauan keluarga</strong>
        <p>{sharingText(state)}</p>
      </div>
      <LinkBtn label="Atur" route="caregiver-link" kind="ghost" />
    </aside>
  );
}

export function FamilyTimeline() {
  const { state } = useApp();
  return (
    <section className="family-timeline">
      <h3>Pembaruan perjalanan</h3>
      <ul className="list">
        {state.familyEvents.length ? (
          state.familyEvents.slice(0, 8).map((e, i) => (
            <li key={i}>
              <strong>{e.label}</strong>
              <small>{e.time}</small>
            </li>
          ))
        ) : (
          <li>Belum ada pemberitahuan perjalanan. Peristiwa berangkat, sampai, dan perjalanan terhenti akan dicatat pada demo.</li>
        )}
      </ul>
    </section>
  );
}

const PREFERENCES = ["Utamakan trotoar lebar", "Hindari tangga", "Hindari jalan ramai", "Utamakan penyeberangan bersuara"];

export function RoutePreferences() {
  const { state, update } = useApp();
  return (
    <section className="home-block">
      <h2>Preferensi rute</h2>
      <div className="stack-sm">
        {PREFERENCES.map((t) => (
          <label key={t} className="check">
            <input
              type="checkbox"
              data-preference={t}
              checked={state.preferences.includes(t)}
              onChange={(e) =>
                update((s) => ({ preferences: e.target.checked ? [...s.preferences, t] : s.preferences.filter((x) => x !== t) }))
              }
            />
            {t}
          </label>
        ))}
      </div>
    </section>
  );
}

export function RatingButtons() {
  const { state, update } = useApp();
  return (
    <div className="rating" role="group" aria-label="Rating satu sampai lima">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          data-rating={i}
          aria-label={`${i} bintang`}
          aria-pressed={state.rating >= i}
          className={state.rating >= i ? "chosen" : ""}
          onClick={() => update({ rating: i })}
        >
          <Icon name="star" />
        </button>
      ))}
    </div>
  );
}

export function CommunityCta({ variant }: { variant: "assistance" | "report" }) {
  const { update, go } = useApp();
  const [id, name] = COMMUNITIES[0];
  const open = () => {
    update({ communityId: id, communityTab: "Laporan" });
    go(variant === "report" ? "community" : "communities");
  };
  if (variant === "report")
    return (
      <div className="notice mt-[18px]">
        Laporan Anda juga tampil di komunitas {name}. <Btn label="Lihat komunitas" action="open-community" kind="sm" onClick={open} />
      </div>
    );
  return (
    <section className="card stack mt-[16px]" aria-labelledby="community-cta">
      <div className="row">
        <Circle icon="users" />
        <h2 id="community-cta">Komunitas di sekitar Anda</h2>
      </div>
      <p>Kabar kondisi jalur, agenda survei, dan diskusi bersama lansia, keluarga, dan relawan di lingkungan Anda.</p>
      <Btn label="Lihat komunitas" action="open-community" icon="users" onClick={open} />
    </section>
  );
}

export function BlockedNotice({ place }: { place?: Place }) {
  return (
    <>
      <img className="soft-art" src={IMAGES.unreachable} alt="Ilustrasi gedung bertangga tanpa jalur aksesibel" />
      <div className="warning red text-left">
        <Icon name="circle-minus" />
        Belum dapat dijangkau secara mandiri dengan kursi roda: tidak ada lift atau ramp menuju{" "}
        {place?.floor ? `lantai ${place.floor}` : "tujuan ini"}.
      </div>
    </>
  );
}

export function NearestEntranceBtn() {
  const { update, go, toast } = useApp();
  return (
    <Btn
      label="Lihat titik terdekat"
      action="nearest"
      onClick={() => {
        update({ destination: "Pintu Masuk Gedung" });
        go("preview");
        toast("Rute alternatif menuju pintu masuk gedung.");
      }}
    />
  );
}
