"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { BlockedNotice, Heading, NearestEntranceBtn } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { COMMUNITIES } from "@/lib/data";
import type { Coord } from "@/lib/geo";
import { PLACES, placeBlocked, placeById } from "@/lib/places";

const PointMap = dynamic(() => import("@/components/map/RequestPointsMap"), { ssr: false });
import { ReportList } from "./report";

function ExternalPlace({ name, address, coord }: { name: string; address: string; coord: Coord }) {
  const { update, go } = useApp();
  const askCompanion = () => {
    update({ destination: name, pendingDestination: { name, address, coord, source: "search" } });
    go("assistance-form");
  };
  return (
    <div className="content-page narrow">
      <Heading title={name} subtitle={address} back="home" />
      <section className="card stack">
        <div className="notice">
          Lokasi ini berada di luar jalur yang sudah disurvei. Rute aksesibel dan kondisi gedungnya belum diketahui, jadi aplikasi belum
          dapat menyarankan rute yang aman. Anda tetap dapat meminta pendamping untuk menemani perjalanan ke sini.
        </div>
        <div className="row">
          <Btn label="Minta Pendamping ke sini" action="place-assistance" kind="primary" icon="handshake" onClick={askCompanion} />
          <LinkBtn label="Laporkan kondisi jalur" route="report" icon="octagon-alert" />
        </div>
        <PointMap destination={coord} label={`Peta lokasi ${name}, ${address}.`} />
        <p>Belum disurvei.</p>
      </section>
    </div>
  );
}

export function PlaceScreen() {
  const params = useSearchParams();
  const lng = Number(params.get("lng")),
    lat = Number(params.get("lat"));
  if (params.get("name") && Number.isFinite(lng) && Number.isFinite(lat) && params.get("lng"))
    return <ExternalPlace name={params.get("name")!} address={params.get("address") || ""} coord={[lng, lat]} />;
  return <CataloguePlace />;
}

function CataloguePlace() {
  const { state, update, go, pickDestination } = useApp();
  const params = useSearchParams();
  const place = placeById(params.get("id")) || (params.get("id") ? undefined : PLACES[0]);
  if (!place)
    return (
      <section className="card">
        <EmptyState
          title="Tempat tidak ditemukan"
          text="Cari tujuan lain melalui kolom pencarian di Beranda."
          label="Ke Beranda"
          route="home"
        />
      </section>
    );
  const blocked = placeBlocked(place, state.profiles);

  const askCompanion = () => {
    update({ destination: place.name, pendingDestination: undefined });
    go("assistance-form");
  };
  return (
    <div className="content-page narrow">
      <Heading title={place.name} subtitle={place.kind} back="home" />
      <section className="card stack">
        {blocked ? (
          <BlockedNotice place={place} />
        ) : place.floor && place.stepFree === false ? (
          <div className="warning">
            <Icon name="triangle-alert" />
            Berada di lantai {place.floor} tanpa lift. Perlu menaiki tangga.
          </div>
        ) : null}
        <div className="row place-actions">
          {blocked ? (
            <>
              <Btn label="Minta Pendamping ke sini" action="place-assistance" kind="primary" icon="handshake" onClick={askCompanion} />
              <NearestEntranceBtn />
            </>
          ) : (
            <>
              <Btn label="Cari rute ke sini" action="place-route" kind="primary" icon="route" onClick={() => pickDestination(place.name)} />
              <Btn label="Minta Pendamping ke sini" action="place-assistance" icon="handshake" onClick={askCompanion} />
            </>
          )}
        </div>
        <h2>Kondisi jalur dan gedung</h2>
        {place.aspects ? (
          <dl className="aspect-list">
            {place.aspects.map(([t, d]) => (
              <Fragment key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </Fragment>
            ))}
          </dl>
        ) : null}
        {!place.surveyedAt ? (
          <div className="notice">
            Kondisi jalur dan gedung ini belum disurvei. Rute tetap dapat dihitung, tetapi hambatan di lokasi belum diketahui. Pertimbangkan
            meminta pendamping untuk kunjungan pertama.
          </div>
        ) : null}
        {place.warnings?.map((w) => (
          <div key={w} className="warning">
            <Icon name="triangle-alert" />
            {w}
          </div>
        ))}
        <p>{place.surveyedAt ? `Survei terakhir: ${place.surveyedAt}.` : "Belum disurvei."}</p>
      </section>
    </div>
  );
}

export function CommunitiesScreen() {
  const { state, update, go } = useApp();
  return (
    <div className="content-page">
      <div className="community-head">
        <Heading title="Komunitas" subtitle="Tempat berbagi kondisi jalur, agenda survei, dan kabar sekitar." back="" />
      </div>
      <div className="community-grid">
        {COMMUNITIES.map(([id, t, d, i]) => (
          <section key={id} className="card community-card">
            <div className="row">
              <Circle icon={i} />
              <h2>{t}</h2>
            </div>
            <p>{d}</p>
            <div className="row between">
              {state.joinedCommunities.includes(id) ? <Badge label="Anda tergabung" kind="green" icon="check" /> : <span></span>}
              <Btn
                label="Buka"
                action="open-community"
                kind="primary sm"
                icon="users"
                data-community={id}
                aria-label={`Buka komunitas ${t}`}
                onClick={() => {
                  update({ communityId: id });
                  go("community");
                }}
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function CommunityScreen() {
  const { state, update, toast } = useApp();
  const [posts, setPosts] = useState<string[]>([]);
  const c = COMMUNITIES.find((x) => x[0] === state.communityId) || COMMUNITIES[0];
  const on = state.joinedCommunities.includes(c[0]);
  const tab = ["Laporan", "Agenda", "Diskusi"].includes(state.communityTab || "") ? state.communityTab! : "Laporan";

  const join = () => {
    update((s) => ({ joinedCommunities: on ? s.joinedCommunities.filter((x) => x !== c[0]) : [...s.joinedCommunities, c[0]] }));
    toast(on ? "Anda berhenti mengikuti komunitas." : "Anda mengikuti komunitas ini.");
  };

  const body =
    tab === "Agenda" ? (
      <article className="card border">
        <h3>Survei jalur sekitar puskesmas</h3>
        <p>Sabtu, 09:00, Pintu masuk puskesmas</p>
      </article>
    ) : tab === "Diskusi" ? (
      <>
        <article className="discussion">
          <div className="conversation">
            <Avatar name="Rina" />
            <div className="body">
              <h3>Perbaikan trotoar di depan Perpustakaan</h3>
              <p>Jalur utama sudah bisa dilalui. Tetap perhatikan kondisi guiding block di sisi timur.</p>
              <small>Rina</small>
            </div>
          </div>
        </article>
        <article className="discussion">
          <div className="conversation">
            <Avatar name="Budi" />
            <div className="body">
              <h3>Survei jalur layanan publik</h3>
              <p>Mari bergabung dalam pendataan jalur dan fasilitas aksesibel.</p>
              <small>Budi</small>
            </div>
          </div>
        </article>
        {posts.map((p, i) => (
          <div key={i} className="discussion">
            <h3>{state.name}</h3>
            <p>{p}</p>
          </div>
        ))}
        <AreaField label="Tulis diskusi" name="discussion" placeholder="Bagikan informasi aksesibilitas..." />
        <Btn
          label="Kirim diskusi demo"
          action="post-discussion"
          kind="primary"
          onClick={() => {
            const field = document.querySelector<HTMLTextAreaElement>('[name="discussion"]');
            if (!field?.value.trim()) {
              toast("Tulis diskusi terlebih dahulu.");
              return;
            }
            setPosts((p) => [...p, field.value]);
            field.value = "";
            toast("Diskusi ditampilkan selama sesi demo.");
          }}
        />
      </>
    ) : (
      <>
        <p className="explain">
          Daftar laporan hambatan yang sudah masuk. Untuk melaporkan hambatan baru, gunakan{" "}
          <Link className="link" href="/report">
            Laporkan Hambatan
          </Link>
          .
        </p>
        {state.reports.length ? (
          <ReportList />
        ) : (
          <div className="empty compact">
            <h3>Belum ada laporan di area ini</h3>
            <p>Area ini belum punya laporan. Laporan pertama Anda membantu pengguna lain memilih rute.</p>
            <LinkBtn label="Laporkan Hambatan" route="report" kind="primary" icon="octagon-alert" />
          </div>
        )}
      </>
    );

  return (
    <div className="content-page narrow">
      <Heading
        title={c[1]}
        subtitle={c[2]}
        back="communities"
        actions={<Btn label={on ? "Tergabung" : "Ikuti"} action="join-community" kind="primary" aria-pressed={on} onClick={join} />}
      />
      <section className="card stack">
        <div className="toggle-group" role="group" aria-label="Isi komunitas">
          {["Laporan", "Agenda", "Diskusi"].map((t) => (
            <Btn
              key={t}
              label={t}
              action="community-tab"
              kind={"tab " + (tab === t ? "active" : "")}
              data-community-tab={t}
              aria-pressed={tab === t}
              onClick={() => update({ communityTab: t })}
            />
          ))}
        </div>
        {body}
      </section>
    </div>
  );
}
