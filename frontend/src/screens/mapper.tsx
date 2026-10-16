"use client";

import { useEffect } from "react";
import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import { Heading } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, SelectField, TextField } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import type { DemoState } from "@/lib/demo-state";

const MODES = ["Pilih", "Node", "Edge", "Sunting", "Hapus"];
const MODE_ICONS = ["mouse-pointer-2", "circle-plus", "git-branch", "pencil", "trash-2"];

function useEditorActions() {
  const app = useApp();
  const { update, stateRef, toast, announce, confirmModal } = app;
  const focusWidth = () => setTimeout(() => document.querySelector<HTMLInputElement>('input[name="width"]')?.focus(), 0);

  const selectNode = (id: number) => {
    const s = stateRef.current;
    update({ selectedNode: id, selectedEdge: null });
    if (s.mapMode === 3) {
      if (s.edgeStart === null) {
        update({ edgeStart: id });
        toast("Node awal dipilih. Pilih node akhir.");
      } else if (s.edgeStart === id) toast("Pilih node akhir yang berbeda.");
      else {
        update({ pendingEdge: { a: s.edgeStart, b: id }, edgeStart: null });
        focusWidth();
        toast("Isi atribut segmen baru, lalu simpan draft.");
      }
    } else if (s.mapMode === 5) {
      const n = s.nodes.find((x) => x.id === id);
      confirmModal(
        "Hapus node",
        `Hapus node ${id} (${n?.name}) beserta semua segmen yang terhubung? Perubahan tercatat pada graf demo.`,
        () => {
          update((st) => ({
            nodes: st.nodes.filter((x) => x.id !== id),
            edges: st.edges.filter((e) => e.a !== id && e.b !== id),
            selectedNode: null,
          }));
          toast("Node dan segmen terkait dihapus dari graf demo.");
        },
      );
    } else announce(`Node ${id} dipilih.`);
  };

  const selectEdge = (id: number) => {
    update({ selectedEdge: id, selectedNode: null });
    if (stateRef.current.mapMode === 5) {
      confirmModal("Hapus segmen", `Hapus segmen ${id} dari graf demo? Rute yang bergantung pada segmen ini bisa terputus.`, () => {
        update((st) => ({ edges: st.edges.filter((e) => e.id !== id), selectedEdge: null }));
        toast("Segmen dihapus.");
      });
    } else {
      focusWidth();
      announce(`Segmen ${id} dipilih.`);
    }
  };

  const addNode = (x: number, y: number, name?: string) =>
    update((s) => {
      const id = Math.max(0, ...s.nodes.map((n) => n.id)) + 1;
      return { nodes: [...s.nodes, { id, name: name || "Node baru " + id, x, y, status: "draft", floor: s.currentFloor }] };
    });

  const setMode = (m: number) => {
    update({ mapMode: m, edgeStart: null, pendingEdge: null });
    announce("Mode " + MODES[m - 1]);
  };

  return { ...app, selectNode, selectEdge, addNode, setMode };
}

export function EditorScreen() {
  const { state, update, toast, announce, modal, selectNode, selectEdge, addNode, setMode } = useEditorActions();
  const node = state.nodes.find((n) => n.id === state.selectedNode);
  const edge = state.edges.find((e) => e.id === state.selectedEdge);
  const editingNode = !!state.selectedNode && !state.pendingEdge;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("input,textarea,select,dialog") || !/^[1-5]$/.test(e.key)) return;
      e.preventDefault();
      setMode(Number(e.key));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) || "");
    if (editingNode && node) {
      const x = Number(v("nodeX")),
        y = Number(v("nodeY"));
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
        toast("Koordinat harus 0–100.");
        return;
      }
      update((s) => ({
        nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, name: v("nodeName") || n.name, x, y, status: "draft" } : n)),
      }));
      toast("Perubahan node disimpan sebagai draft.");
      return;
    }
    const width = Number(v("width")),
      slope = Number(v("slope")),
      stairs = Number(v("stairs"));
    if (width <= 0 || slope < 0 || slope > 100 || stairs < 0 || !Number.isInteger(stairs)) {
      toast("Lebar harus positif, kelandaian 0–100%, dan tangga bilangan bulat nonnegatif.");
      return;
    }
    if (!state.pendingEdge && !state.selectedEdge) {
      toast("Pilih segmen untuk disunting, atau hubungkan dua node pada mode Edge.");
      return;
    }
    const attrs = {
      width,
      slope,
      stairs,
      surface: v("surface"),
      guiding: v("guiding"),
      covered: fd.has("covered"),
      kind: v("kind"),
      status: "draft",
    };
    update((s) => {
      if (s.pendingEdge) {
        const id = Math.max(0, ...s.edges.map((x) => x.id)) + 1;
        return { edges: [...s.edges, { id, ...s.pendingEdge, ...attrs }], selectedEdge: id, selectedNode: null, pendingEdge: null };
      }
      return { edges: s.edges.map((x) => (x.id === s.selectedEdge ? { ...x, ...attrs } : x)), selectedNode: null, pendingEdge: null };
    });
    toast("Segmen disimpan sebagai draft. Menunggu verifikasi.");
  };

  const newNodeDialog = () =>
    modal({
      title: "Tambah node",
      confirmLabel: "Tambah node",
      body: (
        <>
          <p>Posisi dalam persen bidang peta. Semua nilai dapat diisi dengan keyboard.</p>
          <TextField label="Nama node" name="node-name" placeholder="Nama lokasi" />
          <TextField label="Posisi X (0–100)" name="node-x" value="50" type="number" />
          <TextField label="Posisi Y (0–100)" name="node-y" value="50" type="number" />
        </>
      ),
      onConfirm: (d) => {
        const val = (n: string) => d.querySelector<HTMLInputElement>(`[name="${n}"]`)!.value;
        const x = Number(val("node-x")),
          y = Number(val("node-y"));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
          toast("Koordinat harus berada di antara 0 dan 100.");
          return false;
        }
        addNode(x, y, val("node-name") || "Node baru");
        toast("Node draft ditambahkan. Hubungkan dengan segmen.");
      },
    });

  return (
    <MapStage
      id="editor-sheet"
      ariaLabel="Panel editor"
      skipLabel="Lewati ke panel editor"
      name="editor"
      map={
        <AppMap
          editor
          label="Peta editor"
          summary="Peta skematis lingkungan sekitar, data demonstrasi. Padanan keyboard untuk node dan segmen ada di panel editor."
          onNode={selectNode}
          onEdge={selectEdge}
          onAddNode={(x, y) => {
            addNode(x, y);
            toast("Node draft ditambahkan. Hubungkan dengan segmen.");
          }}
        />
      }
    >
      <div className="peek-keep">
        <Heading
          title="Peta Editor"
          subtitle="Pintasan keyboard: 1 Pilih, 2 Node, 3 Edge, 4 Sunting, 5 Hapus"
          back="dashboard"
          actions={<LinkBtnAction />}
        />
      </div>
      <div className="editor-toolbar" role="toolbar" aria-label="Mode editor">
        {MODES.map((t, i) => (
          <Btn
            key={t}
            label={`${i + 1} ${t}`}
            action="editor-mode"
            kind={state.mapMode === i + 1 ? "primary" : ""}
            icon={MODE_ICONS[i]}
            data-mode={i + 1}
            aria-pressed={state.mapMode === i + 1}
            onClick={() => setMode(i + 1)}
          />
        ))}
        <label className="field">
          <select
            name="floor"
            aria-label="Lantai"
            value={state.currentFloor}
            onChange={(e) => {
              update({ currentFloor: e.target.value, selectedNode: null, selectedEdge: null, pendingEdge: null, edgeStart: null });
              announce("Lantai " + e.target.value + " dipilih.");
            }}
          >
            {["Luar", "1", "2", "3"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <form
        className="card stack"
        data-form="editor"
        onSubmit={onSubmit}
        key={`${state.selectedNode}-${state.selectedEdge}-${!!state.pendingEdge}`}
      >
        <h3>Panel atribut</h3>
        <p className="small">
          {state.edgeStart
            ? "Pilih node akhir untuk edge baru."
            : state.selectedNode
              ? "Node " + state.selectedNode + " dipilih."
              : state.selectedEdge
                ? "Segmen " + state.selectedEdge + " dipilih."
                : "Pilih node atau segmen di peta."}
        </p>
        {editingNode ? (
          <>
            <TextField label="Nama node" name="nodeName" value={node?.name} />
            <TextField label="Posisi X (0–100)" name="nodeX" value={node?.x} type="number" />
            <TextField label="Posisi Y (0–100)" name="nodeY" value={node?.y} type="number" />
          </>
        ) : (
          <SelectField label="Jenis" name="kind" options={["Ramp", "Trotoar", "Penyeberangan", "Koridor"]} />
        )}
        <SelectField label="Permukaan" name="surface" options={["Beton", "Paving", "Aspal", "Tanah"]} value={edge?.surface} />
        <TextField label="Lebar (cm)" name="width" value={edge?.width || 140} type="number" required />
        <TextField label="Jumlah anak tangga" name="stairs" value={edge?.stairs || 0} type="number" required />
        <TextField label="Kelandaian (%)" name="slope" value={edge?.slope || 3} type="number" required />
        <SelectField label="Guiding block" name="guiding" options={["Baik", "Rusak", "Tidak ada"]} value={edge?.guiding} />
        <label className="check">
          <input type="checkbox" name="covered" />
          Beratap
        </label>
        <div className="row">
          <button type="submit" className="btn primary">
            Simpan draft
          </button>
          <Btn
            label="Batal"
            action="editor-cancel"
            onClick={() => update({ selectedEdge: null, selectedNode: null, pendingEdge: null, edgeStart: null })}
          />
        </div>
      </form>
      <div className="editor-footer row between">
        <span>Cakupan: FT 87%, FMIPA 64%, GIK belum dipetakan</span>
        <LinkBtn label="Antrean verifikasi" route="verification" kind="sm" />
      </div>
      <section className="card mt-[15px]">
        <h3>Objek peta: padanan keyboard</h3>
        <div className="row mt-[12px]">
          {state.nodes
            .filter((n) => (n.floor || "Luar") === state.currentFloor)
            .map((n) => (
              <Btn
                key={"n" + n.id}
                label={`Node ${n.id}: ${n.name}`}
                action="select-node"
                kind="sm"
                data-node-id={n.id}
                onClick={() => selectNode(n.id)}
              />
            ))}
          {state.edges.map((e) => (
            <Btn
              key={"e" + e.id}
              label={`Segmen ${e.id} (${e.a}–${e.b})`}
              action="select-edge"
              kind="sm"
              data-edge-id={e.id}
              onClick={() => selectEdge(e.id)}
            />
          ))}
          <Btn label="Tambah node melalui koordinat" action="node-dialog" kind="sm" icon="plus" onClick={newNodeDialog} />
        </div>
      </section>
    </MapStage>
  );
}

function LinkBtnAction() {
  const { go } = useApp();
  return <Btn label="Validasi topologi" action="validate-topology" icon="scan-line" onClick={() => go("topology")} />;
}

function topologyIssues(state: DemoState) {
  const problems: [string, string, number | undefined][] = [];
  const connected = new Set(state.edges.flatMap((e) => [e.a, e.b]));
  state.nodes
    .filter((n) => !connected.has(n.id))
    .forEach((n) => problems.push(["Node yatim", `Node ${n.id} (${n.name}) tidak memiliki segmen.`, n.id]));
  state.edges.forEach((e) => {
    const a = state.nodes.find((n) => n.id === e.a),
      b = state.nodes.find((n) => n.id === e.b);
    if (a && b && a.x === b.x && a.y === b.y) problems.push(["Segmen panjang nol", `Segmen ${e.id} memiliki panjang nol.`, a.id]);
  });
  if (state.nodes.length) {
    const visited = new Set<number>();
    const walk = (id: number) => {
      if (visited.has(id)) return;
      visited.add(id);
      state.edges.filter((e) => e.a === id || e.b === id).forEach((e) => walk(e.a === id ? e.b : e.a));
    };
    walk(state.nodes[0].id);
    if (visited.size < state.nodes.length)
      problems.push([
        "Komponen terputus",
        "Ada bagian graf yang tidak terhubung ke bagian lain.",
        state.nodes.find((n) => !visited.has(n.id))?.id,
      ]);
  }
  const floors = [...new Set(state.nodes.map((n) => n.floor || "Luar"))];
  for (const floor of floors.filter((f) => f !== "Luar")) {
    const nodes = state.nodes.filter((n) => (n.floor || "Luar") === floor);
    const ids = new Set(nodes.map((n) => n.id));
    if (!state.edges.some((e) => ids.has(e.a) !== ids.has(e.b)))
      problems.push(["Lantai terputus", `Lantai ${floor} tidak memiliki penghubung ke lantai lain.`, nodes[0]?.id]);
  }
  for (const e of state.edges) {
    if (
      (["width", "surface", "slope", "stairs", "guiding"] as const).some(
        (k) => e[k] === undefined || e[k] === null || (e[k] as unknown) === "",
      )
    )
      problems.push(["Atribut kosong", `Segmen ${e.id} belum memiliki seluruh atribut jalur.`, e.a]);
  }
  return problems;
}

export function TopologyScreen() {
  const { state, update, go } = useApp();
  const issues = topologyIssues(state);
  return (
    <div className="content-page narrow">
      <Heading title="Validasi topologi" subtitle="Pemeriksaan graf lokal pada lantai yang sedang diedit." back="editor" />
      <section className="card stack">
        {issues.length ? (
          <ul className="list">
            {issues.map(([t, d, id], i) => (
              <li key={i} className="list-item">
                <Circle icon="triangle-alert" />
                <div>
                  <strong>{t}</strong>
                  <small>{d}</small>
                </div>
                <Btn
                  label="Perbaiki"
                  action="focus-problem"
                  kind="sm primary"
                  data-node-id={id}
                  onClick={() => {
                    update({ selectedNode: id ?? null, currentFloor: state.nodes.find((n) => n.id === id)?.floor || "Luar", mapMode: 4 });
                    go("editor");
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="warning blue">
            <Icon name="circle-check" />
            Tidak ditemukan node yatim, lantai terputus, segmen panjang nol, komponen terputus, atau atribut kosong pada graf demo ini.
          </div>
        )}
        <div className="notice">Penghubung antarlantai memerlukan segmen yang menghubungkan node dari lantai berbeda.</div>
        <LinkBtn label="Kembali ke editor" route="editor" kind="primary" />
      </section>
    </div>
  );
}

export function VerificationScreen() {
  const { state, update, go, toast, modal } = useApp();
  const drafts = state.edges.filter((e) => e.status === "draft");
  const nodes = state.nodes.filter((n) => n.status === "draft");
  return (
    <div className="content-page">
      <Heading
        title="Antrean verifikasi"
        subtitle="Tinjau usulan berdasarkan data dan bukti lapangan."
        back="dashboard"
        actions={<LinkBtn label="Kelola relawan" route="volunteer-review" icon="users" />}
      />
      <section className="card">
        <ul className="list">
          {nodes.map((n) => (
            <li key={"n" + n.id} className="list-item">
              <Circle icon="map-pin" />
              <div>
                <strong>
                  Node {n.id}: {n.name}
                </strong>
                <small>
                  Lantai {n.floor || "Luar"}, koordinat {n.x}%, {n.y}%
                </small>
              </div>
              <Badge label="Draft" kind="yellow" />
              <Btn
                label="Tinjau node"
                action="review-node"
                kind="primary sm"
                data-node-id={n.id}
                onClick={() =>
                  modal({
                    title: "Tinjau node " + n.id,
                    body: (
                      <p>
                        Nama: {n.name}. Lantai: {n.floor || "Luar"}. Posisi: {n.x}%, {n.y}%. Data demo.
                      </p>
                    ),
                    confirmLabel: "Setujui node",
                    onConfirm: () => {
                      update((s) => ({ nodes: s.nodes.map((x) => (x.id === n.id ? { ...x, status: "approved" } : x)) }));
                      toast("Node disetujui pada graf lokal.");
                    },
                  })
                }
              />
            </li>
          ))}
          {drafts.length ? (
            drafts.map((e) => (
              <li key={"e" + e.id} className="list-item">
                <Circle icon="git-branch" />
                <div>
                  <strong>
                    Segmen {e.id}: Node {e.a} ke {e.b}
                  </strong>
                  <small>Diusulkan oleh Rina, 5 September 2026, {e.width} cm</small>
                </div>
                <Badge label="Draft" kind="yellow" />
                <Btn
                  label="Tinjau"
                  action="review-edge"
                  kind="primary sm"
                  data-edge-id={e.id}
                  onClick={() => {
                    update({ selectedEdge: e.id });
                    go("review");
                  }}
                />
              </li>
            ))
          ) : (
            <li>
              <p>Semua usulan segmen sudah ditinjau.</p>
            </li>
          )}
          {state.reports
            .filter((r) => r.status === "Menunggu verifikasi")
            .map((r) => (
              <li key={"r" + r.id} className="list-item">
                <Circle icon="octagon-alert" />
                <div>
                  <strong>{r.category}</strong>
                  <small>{r.location}</small>
                </div>
                <Btn
                  label="Tinjau laporan"
                  action="review-report"
                  kind="sm"
                  data-report-id={r.id}
                  onClick={() =>
                    modal({
                      title: "Tinjau laporan",
                      body: (
                        <>
                          <h3>{r.category}</h3>
                          <p>
                            {r.location}, {r.severity}
                          </p>
                          <p>{r.description || "Tanpa deskripsi"}</p>
                        </>
                      ),
                      confirmLabel: "Setujui laporan demo",
                      onConfirm: () => {
                        update((s) => ({ reports: s.reports.map((x) => (x.id === r.id ? { ...x, status: "Disetujui" } : x)) }));
                        toast("Laporan disetujui pada data demo.");
                      },
                    })
                  }
                />
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

export function ReviewScreen() {
  const { state, update, go, toast, modal } = useApp();
  const e = state.edges.find((x) => x.id === state.selectedEdge) || state.edges.find((x) => x.status === "draft");
  useEffect(() => {
    if (e && state.selectedEdge !== e.id) update({ selectedEdge: e.id });
  }, [e, state.selectedEdge, update]);
  if (!e)
    return (
      <div className="card">
        <EmptyState title="Tidak ada usulan segmen" text="Semua draft sudah ditinjau." label="Kembali ke antrean" route="verification" />
      </div>
    );
  return (
    <MapStage
      id="review-sheet"
      ariaLabel="Tinjauan segmen"
      skipLabel="Lewati ke tinjauan segmen"
      name="tinjauan"
      map={
        <AppMap
          editor
          label="Peta editor"
          summary="Peta skematis lingkungan sekitar, data demonstrasi. Nilai segmen yang ditinjau ada di panel tinjauan."
        />
      }
    >
      <div className="peek-keep peek-sub">
        <Heading title={"Tinjau segmen " + e.id} subtitle="Diusulkan oleh Rina, 5 September 2026" back="verification" />
      </div>
      <section className="card stack">
        <div className="review-values">
          <div>
            <h3>Nilai saat ini</h3>
            <p className="mt-[14px]">{e.status === "draft" ? "Kosong, segmen baru" : "Segmen disetujui"}</p>
          </div>
          <div>
            <h3>Nilai diusulkan</h3>
            <dl>
              <dt>Lebar</dt>
              <dd>{e.width} cm</dd>
              <dt>Permukaan</dt>
              <dd>{e.surface}</dd>
              <dt>Tangga</dt>
              <dd>{e.stairs}</dd>
              <dt>Kelandaian</dt>
              <dd>{e.slope}%</dd>
              <dt>Guiding</dt>
              <dd>{e.guiding}</dd>
            </dl>
          </div>
        </div>
        <div className="row">
          <Btn
            label="Setujui"
            action="approve-edge"
            kind="primary"
            icon="check"
            onClick={() => {
              update((s) => ({ edges: s.edges.map((x) => (x.id === e.id ? { ...x, status: "approved" } : x)) }));
              go("verification");
              toast("Segmen disetujui pada graf lokal.");
            }}
          />
          <Btn
            label="Tolak"
            action="reject-edge"
            kind="danger"
            icon="x"
            onClick={() =>
              modal({
                title: "Tolak usulan",
                danger: true,
                confirmLabel: "Tolak usulan",
                body: (
                  <>
                    <p>Alasan penolakan wajib diisi agar pengusul memahami perubahan yang diperlukan.</p>
                    <AreaField label="Alasan penolakan" name="reason" placeholder="Tuliskan alasan..." />
                  </>
                ),
                onConfirm: (d) => {
                  const reason = d.querySelector<HTMLTextAreaElement>('[name="reason"]')!.value.trim();
                  if (!reason) {
                    toast("Isi alasan penolakan terlebih dahulu.");
                    return false;
                  }
                  update((s) => ({ edges: s.edges.map((x) => (x.id === e.id ? { ...x, status: "rejected", reason } : x)) }));
                  go("verification");
                  toast("Usulan ditolak. Alasan tercatat pada data demo.");
                },
              })
            }
          />
        </div>
        <p className="small">Keputusan mengubah graf lokal. Graf produksi memerlukan akun dan otorisasi backend.</p>
      </section>
    </MapStage>
  );
}

export function VolunteerReviewScreen() {
  const { state, update, toast, modal } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Verifikasi relawan" subtitle="Peran verifikator dalam demonstrasi." back="verification" />
      <section className="card stack">
        <div className="profile-card">
          <Avatar name={state.name} big />
          <div>
            <h2>{state.name}</h2>
            <Badge label={state.verified ? "Terverifikasi" : "Pending"} kind={state.verified ? "green" : "yellow"} />
          </div>
        </div>
        <p>Identitas dan motivasi ditinjau pada layanan produksi. Demo tidak menyimpan berkas identitas.</p>
        <fieldset>
          <legend>Kapabilitas yang diaktifkan verifikator</legend>
          <label className="check">
            <input type="checkbox" name="grant-companion" defaultChecked />
            Pendampingan lansia
          </label>
          <label className="check">
            <input type="checkbox" name="grant-mapdata" defaultChecked />
            Pemetaan jalur
          </label>
        </fieldset>
        <div className="row">
          <Btn
            label="Setujui relawan demo"
            action="verify-volunteer"
            kind="primary"
            icon="badge-check"
            onClick={() => {
              update({
                verified: true,
                canCompanion: document.querySelector<HTMLInputElement>('[name="grant-companion"]')!.checked,
                canMapData: document.querySelector<HTMLInputElement>('[name="grant-mapdata"]')!.checked,
              });
              toast("Verifikator demo mengaktifkan kapabilitas relawan.");
            }}
          />
          <Btn
            label="Tolak"
            action="reject-volunteer"
            kind="danger"
            onClick={() =>
              modal({
                title: "Tolak pendaftaran relawan",
                danger: true,
                confirmLabel: "Tolak",
                body: <AreaField label="Alasan penolakan" name="reason" placeholder="Tuliskan alasan yang jelas" />,
                onConfirm: (d) => {
                  const reason = d.querySelector<HTMLTextAreaElement>('[name="reason"]')!.value.trim();
                  if (!reason) {
                    toast("Alasan wajib diisi.");
                    return false;
                  }
                  update({ verified: false, canCompanion: false, canMapData: false });
                  toast("Pendaftaran demo ditolak: " + reason);
                },
              })
            }
          />
        </div>
      </section>
    </div>
  );
}
