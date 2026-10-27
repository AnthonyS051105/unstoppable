"use client";

import { IMAGES } from "@/assets/images";
import { usePathname } from "next/navigation";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { useUserPosition } from "@/hooks/useUserPosition";
import { communitiesApi } from "@/lib/api/communities";
import { useSaveConditions } from "@/hooks/useSaveConditions";
import { isSeniorRole, roleHome } from "@/lib/access";
import { PROFILES, PROFILE_SHORT, profileName, type ProfileId } from "@/lib/data";
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

/** `persist`: save to the server right away (Beranda quick toggle); forms save on submit instead. */
function useToggleProfile(persist = false) {
  const { update, announce, toast, stateRef } = useApp();
  const save = useSaveConditions();
  return async (id: ProfileId) => {
    const { profiles, stairs, slope } = stateRef.current;
    const on = !profiles.includes(id);
    const next = on ? [...profiles, id] : profiles.filter((p) => p !== id);
    if (persist && !next.length) {
      toast("Pilih minimal satu kondisi perjalanan.");
      return;
    }
    update({ profiles: next });
    announce((on ? "Dipilih: " : "Tidak dipilih: ") + profileName(id));
    if (persist && !(await save(next, stairs, slope))) update({ profiles });
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
  const toggle = useToggleProfile(true);
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

/** Without props it shows the demo log; the family dashboard passes events received from the server. */
export function FamilyTimeline({ events, emptyText }: { events?: { label: string; time: string }[]; emptyText?: string } = {}) {
  const { state } = useApp();
  const items = events ?? state.familyEvents;
  return (
    <section className="family-timeline">
      <h3>Pembaruan perjalanan</h3>
      <ul className="list">
        {items.length ? (
          items.slice(0, 8).map((e, i) => (
            <li key={i}>
              <strong>{e.label}</strong>
              <small>{e.time}</small>
            </li>
          ))
        ) : (
          <li>{emptyText ?? "Belum ada pemberitahuan perjalanan. Peristiwa berangkat, sampai, dan perjalanan terhenti akan dicatat pada demo."}</li>
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
  const { go } = useApp();
  const { coord } = useUserPosition();
  const query = useApiQuery(coord ? () => communitiesApi.list(coord) : null, [coord?.[0], coord?.[1]]);
  // Nearest community comes from the API (sorted by distance). None known: no card, never a sample community.
  const nearest = query.data?.[0];
  if (!nearest) return null;
  const open = () => go(variant === "report" ? `community?id=${nearest.id}` : "communities");
  if (variant === "report")
    return (
      <div className="notice mt-[18px]">
        Komunitas terdekat dari Anda: {nearest.name}. <Btn label="Lihat komunitas" action="open-community" kind="sm" onClick={open} />
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
