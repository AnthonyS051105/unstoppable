"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { BlockedNotice, Heading, NearestEntranceBtn } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, TextField } from "@/components/ui";
import { ICONS } from "@/components/ui/icons.data";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { useUserPosition } from "@/hooks/useUserPosition";
import { ApiError, errorMessage } from "@/lib/api-client";
import { SEVERITY_LABEL, communitiesApi, formatEventTime, reportCategoryLabel } from "@/lib/api/communities";
import type { Community, CommunityEvent, CommunityEventNotice, CommunityPost, LngLat, NearbyReport } from "@/types/api";
import { useApp } from "@/hooks/useApp";
import type { Coord } from "@/lib/geo";
import { PLACES, placeBlocked, placeById } from "@/lib/places";

const PointMap = dynamic(() => import("@/components/map/RequestPointsMap"), { ssr: false });

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

const TABS = ["Laporan", "Agenda", "Diskusi"] as const;
type Tab = (typeof TABS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pilot-area point (Fakultas Teknik UGM). Used only when the device position is unavailable, and said so on screen. */
const PILOT_AREA_CENTER: LngLat = [110.3759, -7.7653];

const distanceText = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const iconOf = (name: string) => (ICONS[name] ? name : "users");
const formatPostTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " WIB";

function LoadNotice({ error, text, onRetry, id }: { error: ApiError | null; text: string; onRetry: () => void; id: string }) {
  if (error)
    return (
      <>
        <div className="notice" role="alert">
          {error.message}
        </div>
        <Btn label="Coba lagi" action={`reload-${id}`} kind="sm" icon="repeat" onClick={onRetry} />
      </>
    );
  return (
    <>
      <div className="skeleton line" aria-hidden="true"></div>
      <p role="status">{text}</p>
    </>
  );
}

/** Writes an error under a dialog field (the dialog body is static, so it is updated in the DOM). */
const setDialogError = (dialog: HTMLDialogElement, text: string) => {
  const el = dialog.querySelector<HTMLElement>("[data-dialog-error]");
  if (el) el.textContent = text;
};

export function CommunitiesScreen() {
  const { go, toast } = useApp();
  const position = useUserPosition();
  const at = position.coord ?? (position.status === "denied" ? PILOT_AREA_CENTER : null);
  const query = useApiQuery<Community[]>(at ? () => communitiesApi.list(at) : null, [at?.[0], at?.[1]]);
  const list = query.data;

  useSocketEvent<CommunityEventNotice>("community:event", (e) => {
    const name = list?.find((c) => c.id === e.communityId)?.name ?? "komunitas Anda";
    toast(e.cancelledAt ? `Agenda dibatalkan di ${name}.` : `Agenda baru di ${name}.`);
  });

  const loading = !query.error && (position.status === "pending" || query.loading || !list);
  return (
    <div className="content-page">
      <div className="community-head">
        <Heading title="Komunitas" subtitle="Tempat berbagi kondisi jalur, agenda survei, dan kabar sekitar." back="" />
      </div>
      {position.status === "denied" ? (
        <div className="notice" role="status">
          Lokasi Anda tidak tersedia, jadi komunitas diurutkan dari area uji di Fakultas Teknik UGM.{" "}
          <Btn label="Coba lagi" action="retry-position" kind="sm" icon="locate-fixed" onClick={position.retry} />
        </div>
      ) : null}
      {loading ? (
        <section className="card">
          <LoadNotice error={null} text="Memuat komunitas…" onRetry={query.reload} id="communities" />
        </section>
      ) : query.error ? (
        <section className="card">
          <LoadNotice error={query.error} text="" onRetry={query.reload} id="communities" />
        </section>
      ) : !list?.length ? (
        <section className="card">
          <div className="empty compact">
            <h3>Belum ada komunitas</h3>
            <p>Komunitas di area Anda belum tersedia. Coba lagi nanti.</p>
          </div>
        </section>
      ) : (
        <div className="community-grid">
          {list.map((c) => (
            <section key={c.id} className="card community-card">
              <div className="row">
                <Circle icon={iconOf(c.icon)} />
                <h2>{c.name}</h2>
              </div>
              <p>{c.description}</p>
              <small>
                {`${c.memberCount} anggota${c.distanceM !== undefined ? `, ${distanceText(c.distanceM)} dari ${position.coord ? "Anda" : "area uji"}` : ""}`}
              </small>
              <div className="row between">
                {c.joined ? <Badge label="Anda tergabung" kind="green" icon="check" /> : <span></span>}
                <Btn
                  label="Buka"
                  action="open-community"
                  kind="primary sm"
                  icon="users"
                  data-community={c.id}
                  aria-label={`Buka komunitas ${c.name}`}
                  onClick={() => go(`community?id=${c.id}`)}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommunityScreen() {
  const id = useSearchParams().get("id");
  if (!id || !UUID.test(id))
    return (
      <section className="card">
        <EmptyState title="Komunitas tidak ditemukan" text="Pilih komunitas dari daftar komunitas." label="Ke daftar komunitas" route="communities" />
      </section>
    );
  return <CommunityDetail key={id} id={id} />;
}

function CommunityDetail({ id }: { id: string }) {
  const { toast } = useApp();
  const params = useSearchParams();
  const detail = useApiQuery<Community>(() => communitiesApi.get(id), [id], () => false);
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t === params.get("tab")) ?? "Laporan");
  const [busy, setBusy] = useState(false);
  const c = detail.data;
  const on = !!c?.myRole;

  const toggleJoin = async () => {
    setBusy(true);
    try {
      if (on) await communitiesApi.leave(id);
      else await communitiesApi.join(id);
      toast(on ? "Anda berhenti mengikuti komunitas." : "Anda mengikuti komunitas ini.");
      detail.reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!c)
    return (
      <div className="content-page narrow">
        <Heading title="Komunitas" back="communities" />
        <section className="card stack">
          <LoadNotice error={detail.error} text="Memuat komunitas…" onRetry={detail.reload} id="community" />
        </section>
      </div>
    );

  return (
    <div className="content-page narrow">
      <Heading
        title={c.name}
        subtitle={c.description}
        back="communities"
        actions={<Btn label={on ? "Tergabung" : "Ikuti"} action="join-community" kind="primary" aria-pressed={on} disabled={busy} onClick={toggleJoin} />}
      />
      <section className="card stack">
        <div className="toggle-group" role="group" aria-label="Isi komunitas">
          {TABS.map((t) => (
            <Btn
              key={t}
              label={t}
              action="community-tab"
              kind={"tab " + (tab === t ? "active" : "")}
              data-community-tab={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            />
          ))}
        </div>
        {tab === "Agenda" ? (
          <AgendaTab community={c} />
        ) : tab === "Diskusi" ? (
          <DiscussionTab community={c} onJoin={toggleJoin} joining={busy} />
        ) : (
          <ReportsTab id={id} />
        )}
      </section>
    </div>
  );
}

function ReportsTab({ id }: { id: string }) {
  const q = useApiQuery<NearbyReport[]>(() => communitiesApi.reports(id), [id]);
  return (
    <>
      <p className="explain">
        Daftar laporan hambatan yang sedang aktif di wilayah komunitas ini. Untuk melaporkan hambatan baru, gunakan{" "}
        <Link className="link" href="/report">
          Laporkan Hambatan
        </Link>
        .
      </p>
      {q.loading || q.error || !q.data ? (
        <LoadNotice error={q.error} text="Memuat laporan…" onRetry={q.reload} id="community-reports" />
      ) : q.empty ? (
        <div className="empty compact">
          <h3>Belum ada laporan di area ini</h3>
          <p>Area ini belum punya laporan aktif. Laporan pertama Anda membantu pengguna lain memilih rute.</p>
          <LinkBtn label="Laporkan Hambatan" route="report" kind="primary" icon="octagon-alert" />
        </div>
      ) : (
        <ul className="list">
          {q.data.map((r) => (
            <li key={r.id} className="list-item">
              <Circle icon="octagon-alert" />
              <div>
                <strong>{reportCategoryLabel(r.category)}</strong>
                <small>{`${SEVERITY_LABEL[r.severity] ?? r.severity}${r.description ? `, ${r.description}` : ""}`}</small>
              </div>
              <Badge label="Aktif" kind="yellow" />
              <small>{r.corroborationCount || 0} penguat</small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AgendaTab({ community }: { community: Community }) {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const { toast, modal, closeModal } = useApp();
  const q = useApiQuery<CommunityEvent[]>(() => communitiesApi.events(community.id), [community.id]);
  const { reload } = q;

  const verifiedVolunteer = user?.role === "volunteer" && user.volunteerProfile?.verificationStatus === "verified";
  const canCreate = community.myRole === "moderator" || (!!community.myRole && verifiedVolunteer);

  useSocketEvent<CommunityEventNotice>("community:event", (e) => {
    if (e.communityId !== community.id) return;
    toast(e.cancelledAt ? `Agenda dibatalkan di ${community.name}.` : `Agenda baru di ${community.name}.`);
    reload();
  });
  // REST fallback (API_CONTRACT §15.4): refresh while the socket is down.
  useEffect(() => {
    if (isConnected) return;
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [isConnected, reload]);

  const openCreate = () =>
    modal({
      title: "Buat agenda",
      confirmLabel: "Simpan agenda",
      body: (
        <>
          <TextField label="Judul agenda" name="event-title" inputProps={{ maxLength: 120 }} />
          <TextField label="Hari dan jam (WIB)" name="event-starts" type="datetime-local" />
          <TextField label="Tempat (opsional)" name="event-place" inputProps={{ maxLength: 300 }} />
          <AreaField label="Keterangan (opsional)" name="event-description" />
          <p className="inline-error" data-dialog-error aria-live="polite"></p>
        </>
      ),
      onConfirm: (dialog) => {
        const val = (n: string) => dialog.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value.trim() ?? "";
        const title = val("event-title");
        const starts = val("event-starts");
        const startsAt = starts ? new Date(`${starts}+07:00`) : null;
        if (title.length < 3) {
          setDialogError(dialog, "Judul agenda minimal 3 huruf.");
          return false;
        }
        if (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
          setDialogError(dialog, "Pilih hari dan jam di masa depan.");
          return false;
        }
        setDialogError(dialog, "");
        const confirm = dialog.querySelector<HTMLButtonElement>("[data-action=dialog-confirm]");
        if (confirm) confirm.disabled = true;
        void communitiesApi
          .createEvent(community.id, {
            title,
            startsAt: startsAt.toISOString(),
            ...(val("event-place") ? { locationNote: val("event-place") } : {}),
            ...(val("event-description") ? { description: val("event-description") } : {}),
          })
          .then(() => {
            closeModal();
            toast("Agenda tersimpan.");
            reload();
          })
          .catch((e) => {
            setDialogError(dialog, errorMessage(e));
            if (confirm) confirm.disabled = false;
          });
        return false;
      },
    });

  return (
    <>
      {canCreate ? <Btn label="Buat agenda" action="create-event" icon="plus" kind="sm" onClick={openCreate} /> : null}
      {q.loading || q.error || !q.data ? (
        <LoadNotice error={q.error} text="Memuat agenda…" onRetry={q.reload} id="community-events" />
      ) : q.empty ? (
        <div className="empty compact">
          <h3>Belum ada agenda</h3>
          <p>Agenda survei dan kegiatan komunitas yang akan datang muncul di sini.</p>
        </div>
      ) : (
        q.data.map((ev) => (
          <article key={ev.id} className="card border">
            <h3>{ev.title}</h3>
            <p>{[formatEventTime(ev.startsAt), ev.locationNote].filter(Boolean).join(", ")}</p>
            {ev.description ? <p className="post-body">{ev.description}</p> : null}
          </article>
        ))
      )}
    </>
  );
}

function DiscussionTab({ community, onJoin, joining }: { community: Community; onJoin: () => void; joining: boolean }) {
  const { toast, modal, confirmModal } = useApp();
  const isMember = !!community.myRole;
  const isModerator = community.myRole === "moderator";
  // Page 1 comes from the query (and is what every refresh reloads); "Muat lebih banyak" appends later pages.
  const first = useApiQuery(() => communitiesApi.posts(community.id, 1), [community.id], () => false);
  const [extra, setExtra] = useState<{ pages: number; items: CommunityPost[] }>({ pages: 1, items: [] });
  const [more, setMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const items = [...(first.data?.data ?? []), ...extra.items];
  const totalPages = first.data?.meta?.totalPages ?? 1;

  const refresh = () => {
    setExtra({ pages: 1, items: [] });
    first.reload();
  };
  const loadMore = async () => {
    setMore(true);
    try {
      const r = await communitiesApi.posts(community.id, extra.pages + 1);
      setExtra((e) => ({ pages: e.pages + 1, items: [...e.items, ...r.data] }));
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setMore(false);
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = String(fd.get("post-body") ?? "").trim();
    const title = String(fd.get("post-title") ?? "").trim();
    if (body.length < 3) {
      setFormError("Tulis diskusi terlebih dahulu, minimal 3 huruf.");
      return;
    }
    setSending(true);
    setFormError("");
    try {
      await communitiesApi.createPost(community.id, { ...(title ? { title } : {}), body });
      formRef.current?.reset();
      toast("Diskusi terkirim.");
      refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const askReason = (title: string, text: string, confirmLabel: string, run: (reason: string) => Promise<unknown>, done: string) =>
    modal({
      title,
      confirmLabel,
      danger: true,
      body: (
        <>
          <p>{text}</p>
          <label className="field">
            <span>Alasan (3 sampai 300 huruf)</span>
            <textarea name="reason" maxLength={300}></textarea>
          </label>
          <p className="inline-error" data-dialog-error aria-live="polite"></p>
        </>
      ),
      onConfirm: (dialog) => {
        const field = dialog.querySelector<HTMLTextAreaElement>('[name="reason"]');
        const reason = field?.value.trim() ?? "";
        if (reason.length < 3) {
          setDialogError(dialog, "Tulis alasan minimal 3 huruf.");
          field?.focus();
          return false;
        }
        void run(reason)
          .then(() => {
            toast(done);
            refresh();
          })
          .catch((err) => toast(errorMessage(err)));
      },
    });

  const flag = (p: CommunityPost) =>
    askReason("Laporkan kiriman?", "Beri tahu kami kenapa kiriman ini tidak pantas.", "Laporkan", (r) => communitiesApi.flag(p.id, r), "Kiriman dilaporkan. Terima kasih.");
  const hide = (p: CommunityPost) =>
    askReason("Sembunyikan kiriman?", "Kiriman akan disembunyikan dari anggota komunitas.", "Sembunyikan", (r) => communitiesApi.moderate(p.id, "hidden", r), "Kiriman disembunyikan.");
  const remove = (p: CommunityPost) =>
    confirmModal("Hapus kiriman?", "Kiriman Anda akan dihapus dan tidak bisa dikembalikan.", () => {
      void communitiesApi
        .deletePost(p.id)
        .then(() => {
          toast("Kiriman dihapus.");
          refresh();
        })
        .catch((err) => toast(errorMessage(err)));
    });

  return (
    <>
      {isMember ? (
        <form ref={formRef} onSubmit={submit} noValidate>
          <TextField label="Judul (opsional)" name="post-title" inputProps={{ maxLength: 120 }} />
          <label className="field">
            <span>Tulis diskusi</span>
            <textarea
              name="post-body"
              placeholder="Bagikan informasi aksesibilitas..."
              maxLength={1000}
              aria-describedby="post-error"
              aria-invalid={formError ? true : undefined}
            ></textarea>
          </label>
          <p id="post-error" className="inline-error" aria-live="polite">
            {formError}
          </p>
          <Btn type="submit" label="Kirim diskusi" action="post-discussion" kind="primary" disabled={sending} />
        </form>
      ) : (
        <div className="notice">
          Ikuti komunitas ini untuk ikut berdiskusi. <Btn label="Ikuti" action="join-to-discuss" kind="sm" disabled={joining} onClick={onJoin} />
        </div>
      )}
      {!first.data ? (
        <LoadNotice error={first.error} text="Memuat diskusi…" onRetry={first.reload} id="community-posts" />
      ) : !items.length ? (
        <div className="empty compact">
          <h3>Belum ada diskusi</h3>
          <p>Jadilah yang pertama berbagi kabar jalur di sekitar komunitas ini.</p>
        </div>
      ) : (
        <>
          {items.map((p) => (
            <article key={p.id} className="discussion">
              <div className="conversation">
                <Avatar name={p.author.name} />
                <div className="body">
                  {p.title ? <h3>{p.title}</h3> : null}
                  <p className="post-body">{p.body}</p>
                  <small>{`${p.author.name}, ${formatPostTime(p.createdAt)}`}</small>
                  <div className="row">
                    {p.isMine ? (
                      <Btn label="Hapus" action="delete-post" kind="sm" icon="trash-2" aria-label={`Hapus kiriman Anda: ${p.title || p.body.slice(0, 40)}`} onClick={() => remove(p)} />
                    ) : (
                      <Btn label="Laporkan kiriman" action="flag-post" kind="sm" icon="flag" aria-label={`Laporkan kiriman dari ${p.author.name}`} onClick={() => flag(p)} />
                    )}
                    {isModerator && !p.isMine ? (
                      <Btn label="Sembunyikan" action="hide-post" kind="sm" icon="eye-off" aria-label={`Sembunyikan kiriman dari ${p.author.name}`} onClick={() => hide(p)} />
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
          {extra.pages < totalPages ? (
            <Btn label="Muat lebih banyak" action="more-posts" disabled={more} onClick={loadMore} />
          ) : null}
        </>
      )}
    </>
  );
}
