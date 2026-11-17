"use client";

import { useCallback, useEffect, useState } from "react";
import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import { Heading } from "@/components/shared";
import { AreaField, Avatar, Badge, Btn, Circle, EmptyState, Icon, LinkBtn, SelectField, TextField } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/hooks/useApp";
import { errorMessage } from "@/lib/api-client";
import {
  canMapData,
  graphApi,
  type GraphCoverageBuilding,
  type TopologyIssue,
} from "@/lib/api/graph";
import {
  canVerify,
  verificationApi,
  type VerificationItemType,
  type VerificationQueueItem,
} from "@/lib/api/verification";
import { coordToPct, pctToCoord } from "@/lib/geo";

const MODES = ["Pilih", "Node", "Edge", "Sunting", "Hapus"];
const MODE_ICONS = ["mouse-pointer-2", "circle-plus", "git-branch", "pencil", "trash-2"];

const TOPOLOGY_LABELS: Record<string, string> = {
  orphan_node: "Node yatim",
  zero_length_edge: "Segmen panjang nol",
  duplicate_edge: "Segmen duplikat",
  floor_gap: "Lantai terputus",
  missing_attribute: "Atribut kosong",
  disconnected_component: "Komponen terputus",
};

function useEditorActions() {
  const app = useApp();
  const { update, stateRef, toast, announce, confirmModal } = app;
  const focusWidth = () => setTimeout(() => document.querySelector<HTMLInputElement>('input[name="width"]')?.focus(), 0);

  const selectNode = (id: number | string) => {
    const s = stateRef.current;
    update({ selectedNode: id, selectedEdge: null });
    if (s.mapMode === 3) {
      if (s.edgeStart === null) {
        update({ edgeStart: id });
        toast("Node awal dipilih. Pilih node akhir.");
      } else if (String(s.edgeStart) === String(id)) {
        toast("Pilih node akhir yang berbeda.");
      } else {
        update({ pendingEdge: { a: s.edgeStart, b: id }, edgeStart: null });
        focusWidth();
        toast("Isi atribut segmen baru, lalu simpan draft.");
      }
    } else if (s.mapMode === 5) {
      const n = s.nodes.find((x) => String(x.id) === String(id));
      confirmModal(
        "Hapus node",
        `Hapus node ${id} (${n?.name ?? "Node"}) beserta semua segmen yang terhubung dari backend?`,
        async () => {
          try {
            await graphApi.deleteNode(id);
            update((st) => ({
              nodes: st.nodes.filter((x) => String(x.id) !== String(id)),
              edges: st.edges.filter((e) => String(e.a) !== String(id) && String(e.b) !== String(id)),
              selectedNode: null,
            }));
            toast("Node dan segmen terkait dihapus dari backend.");
          } catch (err) {
            toast(errorMessage(err) || "Gagal menghapus node dari backend.");
          }
        },
      );
    } else {
      announce(`Node ${id} dipilih.`);
    }
  };

  const selectEdge = (id: number | string) => {
    update({ selectedEdge: id, selectedNode: null });
    if (stateRef.current.mapMode === 5) {
      confirmModal(
        "Hapus segmen",
        `Hapus segmen ${id} dari backend? Rute yang bergantung pada segmen ini bisa terputus.`,
        async () => {
          try {
            await graphApi.deleteEdge(id);
            update((st) => ({ edges: st.edges.filter((e) => String(e.id) !== String(id)), selectedEdge: null }));
            toast("Segmen dihapus dari backend.");
          } catch (err) {
            toast(errorMessage(err) || "Gagal menghapus segmen dari backend.");
          }
        },
      );
    } else {
      focusWidth();
      announce(`Segmen ${id} dipilih.`);
    }
  };

  const addNode = async (x: number, y: number, name?: string) => {
    const s = stateRef.current;
    const fl = s.currentFloor === "Luar" ? 0 : Number(s.currentFloor) || 0;
    const nodeName = name || `Node baru`;
    const coords = pctToCoord(x, y);

    try {
      const created = await graphApi.createNode({
        nodeType: "entrance",
        name: nodeName,
        floorLevel: fl,
        location: { type: "Point", coordinates: coords },
      });
      const pct = coordToPct(created.location.coordinates);
      const newNode = {
        id: created.id,
        name: created.name || nodeName,
        x: Math.round(Math.max(0, Math.min(100, pct.x))),
        y: Math.round(Math.max(0, Math.min(100, pct.y))),
        status: created.status,
        floor: created.floorLevel === 0 ? "Luar" : String(created.floorLevel),
        buildingId: created.buildingId,
        nodeType: created.nodeType,
        isOperational: created.isOperational,
      };
      update((prev) => ({
        nodes: [...prev.nodes.filter((n) => String(n.id) !== String(created.id)), newNode],
      }));
      toast(
        created.status === "approved"
          ? "Node disetujui dan ditambahkan ke graf backend."
          : "Node draft ditambahkan ke backend. Menunggu verifikasi.",
      );
    } catch (err) {
      const localId = Math.max(0, ...s.nodes.map((n) => Number(n.id) || 0)) + 1;
      update((prev) => ({
        nodes: [...prev.nodes, { id: localId, name: `${nodeName} ${localId}`, x, y, status: "draft", floor: s.currentFloor }],
      }));
      toast(errorMessage(err) || "Node draft ditambahkan secara lokal.");
    }
  };

  const setMode = (m: number) => {
    update({ mapMode: m, edgeStart: null, pendingEdge: null });
    announce("Mode " + MODES[m - 1]);
  };

  return { ...app, selectNode, selectEdge, addNode, setMode };
}

export function EditorScreen() {
  const { user } = useAuth();
  const actions = useEditorActions();
  const { state, update, toast, announce, modal, selectNode, selectEdge, addNode, setMode } = actions;

  const isMapper = canMapData(
    user?.role ?? state.role,
    user?.volunteerProfile ?? { verificationStatus: state.verified ? "verified" : undefined, canMapData: state.canMapData },
  );

  const [coverageSummary, setCoverageSummary] = useState<string>("Memuat data cakupan...");

  const node = state.nodes.find((n) => String(n.id) === String(state.selectedNode));
  const edge = state.edges.find((e) => String(e.id) === String(state.selectedEdge));
  const editingNode = Boolean(state.selectedNode && !state.pendingEdge);

  // Synchronise nodes, edges and coverage with backend
  useEffect(() => {
    if (!isMapper) return;
    let alive = true;
    const ctrl = new AbortController();
    const fl = state.currentFloor === "Luar" ? 0 : Number(state.currentFloor) || 0;

    Promise.allSettled([
      graphApi.listNodes({ floorLevel: fl, status: "all" }, ctrl.signal),
      graphApi.listEdges({ floorLevel: fl, status: "all" }, ctrl.signal),
      graphApi.getCoverage(ctrl.signal),
    ]).then(([nodesRes, edgesRes, covRes]) => {
      if (!alive) return;

      if (nodesRes.status === "fulfilled" && Array.isArray(nodesRes.value) && nodesRes.value.length > 0) {
        const backendNodes = nodesRes.value.map((n) => {
          const pct = coordToPct(n.location.coordinates);
          return {
            id: n.id,
            name: n.name || `Node ${n.id}`,
            x: Math.round(Math.max(0, Math.min(100, pct.x))),
            y: Math.round(Math.max(0, Math.min(100, pct.y))),
            status: n.status,
            floor: n.floorLevel === 0 ? "Luar" : String(n.floorLevel),
            buildingId: n.buildingId,
            nodeType: n.nodeType,
            isOperational: n.isOperational,
          };
        });
        update({ nodes: backendNodes });
      }

      if (edgesRes.status === "fulfilled" && Array.isArray(edgesRes.value) && edgesRes.value.length > 0) {
        const backendEdges = edgesRes.value.map((e) => ({
          id: e.id,
          a: e.sourceNodeId,
          b: e.targetNodeId,
          status: e.status,
          width: e.attributes?.widthCm ?? 140,
          surface: e.attributes?.surfaceType
            ? e.attributes.surfaceType.charAt(0).toUpperCase() + e.attributes.surfaceType.slice(1)
            : "Beton",
          slope: e.attributes?.slopePercent ?? 3,
          stairs: e.attributes?.stepCount ?? (e.attributes?.hasStairs ? 1 : 0),
          guiding: e.attributes?.hasGuidingBlock ? "Baik" : "Tidak ada",
          covered: e.attributes?.isCovered ?? false,
          isOperational: e.isOperational,
          lengthM: e.lengthM,
        }));
        update({ edges: backendEdges });
      }

      if (covRes.status === "fulfilled" && Array.isArray(covRes.value)) {
        const buildings = covRes.value as GraphCoverageBuilding[];
        const text = buildings.map((b) => `${b.name} ${Math.round(b.approvedRatio * 100)}%`).join(", ");
        setCoverageSummary(text ? `Cakupan: ${text}` : "Cakupan: Belum ada data survei");
      }
    });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [state.currentFloor, isMapper, update]);

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

  if (!isMapper) {
    return (
      <div className="content-page narrow">
        <Heading title="Peta Editor" back="dashboard" />
        <section className="card">
          <EmptyState
            title="Akses Dibatasi"
            text="Halaman ini hanya dapat diakses oleh akun verifikator (admin) atau relawan pemeta (mapper) yang telah terverifikasi."
            route="home"
            label="Kembali ke Beranda"
          />
        </section>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) || "");

    if (editingNode && node) {
      const x = Number(v("nodeX"));
      const y = Number(v("nodeY"));
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
        toast("Koordinat harus 0–100.");
        return;
      }
      const newName = v("nodeName") || node.name;
      try {
        await graphApi.updateNode(node.id, {
          name: newName,
          floorLevel: state.currentFloor === "Luar" ? 0 : Number(state.currentFloor) || 0,
        });
        update((s) => ({
          nodes: s.nodes.map((n) => (String(n.id) === String(node.id) ? { ...n, name: newName, x, y, status: "draft" } : n)),
        }));
        toast("Perubahan node disimpan ke backend.");
      } catch (err) {
        update((s) => ({
          nodes: s.nodes.map((n) => (String(n.id) === String(node.id) ? { ...n, name: newName, x, y, status: "draft" } : n)),
        }));
        toast(errorMessage(err) || "Perubahan node disimpan sebagai draft lokal.");
      }
      return;
    }

    const width = Number(v("width"));
    const slope = Number(v("slope"));
    const stairs = Number(v("stairs"));
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

    if (state.pendingEdge) {
      try {
        const created = await graphApi.createEdge({
          sourceNodeId: state.pendingEdge.a,
          targetNodeId: state.pendingEdge.b,
          surfaceType: v("surface").toLowerCase(),
          widthCm: width,
          hasStairs: stairs > 0,
          stepCount: stairs,
          slopePercent: slope,
          hasGuidingBlock: v("guiding") !== "Tidak ada",
          guidingBlockCondition: v("guiding").toLowerCase(),
          isCovered: fd.has("covered"),
          isOperational: true,
        });
        const newEdge = {
          id: created.id,
          a: created.sourceNodeId,
          b: created.targetNodeId,
          status: created.status,
          width,
          slope,
          stairs,
          surface: v("surface"),
          guiding: v("guiding"),
          covered: fd.has("covered"),
          kind: v("kind"),
          lengthM: created.lengthM,
        };
        update((s) => ({
          edges: [...s.edges.filter((x) => String(x.id) !== String(created.id)), newEdge],
          selectedEdge: created.id,
          selectedNode: null,
          pendingEdge: null,
        }));
        toast(
          created.status === "approved"
            ? "Segmen disetujui dan disimpan ke backend."
            : "Segmen disimpan sebagai draft ke backend. Menunggu verifikasi.",
        );
      } catch (err) {
        const localId = Math.max(0, ...state.edges.map((x) => Number(x.id) || 0)) + 1;
        update((s) => ({
          edges: [...s.edges, { id: localId, ...s.pendingEdge!, ...attrs }],
          selectedEdge: localId,
          selectedNode: null,
          pendingEdge: null,
        }));
        toast(errorMessage(err) || "Segmen disimpan sebagai draft lokal. Menunggu verifikasi.");
      }
    } else if (state.selectedEdge) {
      try {
        await graphApi.updateEdge(state.selectedEdge, {
          surfaceType: v("surface").toLowerCase(),
          widthCm: width,
          hasStairs: stairs > 0,
          stepCount: stairs,
          slopePercent: slope,
          hasGuidingBlock: v("guiding") !== "Tidak ada",
          guidingBlockCondition: v("guiding").toLowerCase(),
          isCovered: fd.has("covered"),
          isOperational: true,
        });
        update((s) => ({
          edges: s.edges.map((x) => (String(x.id) === String(s.selectedEdge) ? { ...x, ...attrs } : x)),
          selectedNode: null,
          pendingEdge: null,
        }));
        toast("Perubahan segmen disimpan ke backend.");
      } catch (err) {
        update((s) => ({
          edges: s.edges.map((x) => (String(x.id) === String(s.selectedEdge) ? { ...x, ...attrs } : x)),
          selectedNode: null,
          pendingEdge: null,
        }));
        toast(errorMessage(err) || "Perubahan segmen disimpan lokal.");
      }
    }
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
        const x = Number(val("node-x"));
        const y = Number(val("node-y"));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
          toast("Koordinat harus berada di antara 0 dan 100.");
          return false;
        }
        void addNode(x, y, val("node-name") || "Node baru");
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
          summary="Peta editor graf jalur aksesibilitas terintegrasi dengan modul backend."
          onNode={selectNode}
          onEdge={selectEdge}
          onAddNode={(x, y) => {
            void addNode(x, y);
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
        key={`${state.selectedNode}-${state.selectedEdge}-${Boolean(state.pendingEdge)}`}
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
          <input type="checkbox" name="covered" defaultChecked={edge?.covered} />
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
        <span>{coverageSummary}</span>
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

export function TopologyScreen() {
  const { user } = useAuth();
  const { state, update, go } = useApp();

  const isMapper = canMapData(
    user?.role ?? state.role,
    user?.volunteerProfile ?? { verificationStatus: state.verified ? "verified" : undefined, canMapData: state.canMapData },
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<TopologyIssue[]>([]);

  const runValidation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await graphApi.validateTopology();
      setIssues(res.issues || []);
    } catch (err) {
      setError(errorMessage(err) || "Gagal memvalidasi topologi graf di backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isMapper) return;
    let alive = true;
    graphApi
      .validateTopology()
      .then((res) => {
        if (!alive) return;
        setIssues(res.issues || []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(errorMessage(err) || "Gagal memvalidasi topologi graf di backend.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isMapper]);

  if (!isMapper) {
    return (
      <div className="content-page narrow">
        <Heading title="Validasi topologi" back="dashboard" />
        <section className="card">
          <EmptyState
            title="Akses Dibatasi"
            text="Halaman ini hanya dapat diakses oleh peran verifikator (admin) atau relawan pemeta (mapper) yang terverifikasi."
            route="home"
            label="Kembali ke Beranda"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="content-page narrow">
      <Heading
        title="Validasi topologi"
        subtitle="Pemeriksaan graf backend: node yatim, segmen panjang nol, segmen duplikat, dan komponen terputus."
        back="editor"
        actions={<Btn label="Validasi ulang" action="revalidate-topology" icon="repeat" onClick={runValidation} />}
      />
      <section className="card stack">
        {loading ? (
          <p role="status">Memeriksa topologi graf di backend server…</p>
        ) : error ? (
          <div className="warning red">
            <Icon name="triangle-alert" />
            {error}
          </div>
        ) : issues.length ? (
          <ul className="list">
            {issues.map((issue, i) => (
              <li key={i} className="list-item">
                <Circle icon="triangle-alert" />
                <div>
                  <strong>{TOPOLOGY_LABELS[issue.type] || issue.type}</strong>
                  <small>{issue.message}</small>
                </div>
                <Btn
                  label="Perbaiki"
                  action="focus-problem"
                  kind="sm primary"
                  data-node-id={issue.nodeId}
                  data-edge-id={issue.edgeId}
                  onClick={() => {
                    if (issue.nodeId) {
                      update({ selectedNode: issue.nodeId, selectedEdge: null, mapMode: 4 });
                    } else if (issue.edgeId) {
                      update({ selectedEdge: issue.edgeId, selectedNode: null, mapMode: 4 });
                    }
                    go("editor");
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="warning blue">
            <Icon name="circle-check" />
            Topologi graf valid! Tidak ditemukan node yatim, lantai terputus, segmen panjang nol, atau komponen terputus pada graf backend.
          </div>
        )}
        <div className="notice">Penghubung antarlantai memerlukan segmen yang menghubungkan node dari lantai berbeda.</div>
        <LinkBtn label="Kembali ke editor" route="editor" kind="primary" />
      </section>
    </div>
  );
}

export function VerificationScreen() {
  const { user } = useAuth();
  const { state, update, go, toast, modal } = useApp();
  const isVerifier = canVerify(user?.role ?? state.role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<VerificationQueueItem[]>([]);
  const [activeType, setActiveType] = useState<VerificationItemType | "all">("all");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await verificationApi.queue(activeType !== "all" ? { type: activeType } : undefined);
      setItems(res.data || []);
    } catch (err) {
      setError(errorMessage(err) || "Gagal memuat antrean verifikasi.");
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => {
    if (!isVerifier) return;
    let alive = true;
    verificationApi
      .queue(activeType !== "all" ? { type: activeType } : undefined)
      .then((res) => {
        if (!alive) return;
        setItems(res.data || []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(errorMessage(err) || "Gagal memuat antrean verifikasi.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isVerifier, activeType]);

  if (!isVerifier) {
    return (
      <div className="content-page">
        <Heading title="Antrean verifikasi" back="dashboard" />
        <section className="card">
          <EmptyState
            title="Akses Ditolak"
            text="Halaman antrean verifikasi hanya dapat diakses oleh peran verifikator (admin)."
            route="home"
            label="Kembali ke Beranda"
          />
        </section>
      </div>
    );
  }

  const approveItem = async (item: VerificationQueueItem) => {
    try {
      await verificationApi.approve(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      toast(`Usulan ${item.itemType} disetujui di backend.`);
    } catch (err) {
      toast(errorMessage(err) || "Gagal menyetujui usulan.");
    }
  };

  const rejectItem = (item: VerificationQueueItem) => {
    modal({
      title: "Tolak usulan verifikasi",
      danger: true,
      confirmLabel: "Tolak usulan",
      body: (
        <>
          <p>Alasan penolakan wajib diisi agar pengusul memahami perbaikan yang diperlukan.</p>
          <AreaField label="Alasan penolakan" name="reason" placeholder="Tuliskan alasan yang jelas..." />
        </>
      ),
      onConfirm: (d) => {
        const reason = d.querySelector<HTMLTextAreaElement>('[name="reason"]')?.value.trim();
        if (!reason) {
          toast("Alasan penolakan wajib diisi.");
          return false;
        }
        void (async () => {
          try {
            await verificationApi.reject(item.id, reason);
            setItems((prev) => prev.filter((x) => x.id !== item.id));
            toast(`Usulan ${item.itemType} ditolak di backend.`);
          } catch (err) {
            toast(errorMessage(err) || "Gagal menolak usulan.");
          }
        })();
      },
    });
  };

  const reviewEdge = (item: VerificationQueueItem) => {
    update({ selectedEdge: item.itemId });
    go("review");
  };

  return (
    <div className="content-page">
      <Heading
        title="Antrean verifikasi"
        subtitle="Tinjau usulan perubahan data dan graf berdasarkan bukti lapangan."
        back="dashboard"
        actions={
          <div className="row gap-2">
            <Btn label="Segarkan" action="refresh-queue" icon="repeat" kind="sm" onClick={loadQueue} />
            <LinkBtn label="Kelola relawan" route="volunteer-review" icon="users" />
          </div>
        }
      />

      <div className="row gap-2 mb-4" role="tablist" aria-label="Filter jenis usulan">
        {(["all", "node", "edge", "report_effect"] as const).map((t) => (
          <Btn
            key={t}
            label={t === "all" ? "Semua" : t === "node" ? "Node" : t === "edge" ? "Segmen" : "Laporan"}
            action="filter-queue"
            kind={activeType === t ? "primary sm" : "sm"}
            onClick={() => setActiveType(t)}
          />
        ))}
      </div>

      <section className="card">
        {loading ? (
          <p role="status">Memuat antrean verifikasi dari server…</p>
        ) : error ? (
          <div className="warning red">
            <Icon name="triangle-alert" />
            {error}
          </div>
        ) : items.length ? (
          <ul className="list">
            {items.map((it) => (
              <li key={it.id} className="list-item">
                <Circle icon={it.itemType === "node" ? "map-pin" : it.itemType === "edge" ? "git-branch" : "octagon-alert"} />
                <div>
                  <strong>
                    {it.itemType === "node"
                      ? `Node ${it.itemId}: ${(it.preview.name as string) || "Tanpa nama"}`
                      : it.itemType === "edge"
                        ? `Segmen ${it.itemId}: Node ${(it.preview.sourceNodeId as string) || "?"} ke ${(it.preview.targetNodeId as string) || "?"}`
                        : `Laporan: ${(it.preview.category as string) || "Hambatan"}`}
                  </strong>
                  <small>
                    Diusulkan oleh {it.submittedBy?.name || "Relawan"}, {it.changeType === "create" ? "Item baru" : "Pembaruan atribut"}
                    {it.preview.widthCm ? `, lebar ${it.preview.widthCm} cm` : ""}
                    {it.preview.surfaceType ? `, permukaan ${it.preview.surfaceType}` : ""}
                  </small>
                </div>
                <Badge label={it.changeType === "create" ? "Baru" : "Update"} kind="yellow" />
                <div className="row gap-1">
                  {it.itemType === "edge" ? (
                    <Btn label="Tinjau" action="review-edge" kind="primary sm" onClick={() => reviewEdge(it)} />
                  ) : (
                    <Btn label="Setujui" action="approve-item" kind="primary sm" onClick={() => approveItem(it)} />
                  )}
                  <Btn label="Tolak" action="reject-item" kind="danger sm" onClick={() => rejectItem(it)} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Antrean verifikasi kosong"
            text="Semua usulan pemetaan dan laporan telah ditinjau."
            label="Kembali ke Dashboard"
            route="dashboard"
          />
        )}
      </section>
    </div>
  );
}

export function ReviewScreen() {
  const { user } = useAuth();
  const { state, update, go, toast, modal } = useApp();
  const isVerifier = canVerify(user?.role ?? state.role);

  const [loading, setLoading] = useState(false);
  const [queueItem, setQueueItem] = useState<VerificationQueueItem | null>(null);

  // Find queue item for current edge if available
  useEffect(() => {
    if (!isVerifier) return;
    let alive = true;
    verificationApi
      .queue({ type: "edge" })
      .then((res) => {
        if (!alive) return;
        const matching = res.data.find((item) => String(item.itemId) === String(state.selectedEdge)) || res.data[0];
        if (matching) {
          setQueueItem(matching);
          if (String(state.selectedEdge) !== String(matching.itemId)) {
            update({ selectedEdge: matching.itemId });
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [state.selectedEdge, isVerifier, update]);

  if (!isVerifier) {
    return (
      <div className="card">
        <EmptyState
          title="Akses Ditolak"
          text="Tinjauan usulan segmen hanya dapat diakses oleh peran verifikator (admin)."
          label="Kembali ke Antrean"
          route="verification"
        />
      </div>
    );
  }

  const e = state.edges.find((x) => String(x.id) === String(state.selectedEdge)) || state.edges.find((x) => x.status === "draft");

  if (!e && !queueItem) {
    return (
      <div className="card">
        <EmptyState title="Tidak ada usulan segmen" text="Semua draft sudah ditinjau." label="Kembali ke antrean" route="verification" />
      </div>
    );
  }

  const itemId = queueItem?.id || `edge:${e?.id || ""}`;
  const proposed = queueItem?.preview || {
    widthCm: e?.width,
    surfaceType: e?.surface,
    hasStairs: Boolean(e?.stairs && e.stairs > 0),
    stepCount: e?.stairs,
    slopePercent: e?.slope,
    hasGuidingBlock: e?.guiding !== "Tidak ada",
  };
  const current = queueItem?.currentValue;

  const onApprove = async () => {
    setLoading(true);
    try {
      await verificationApi.approve(itemId);
      update((s) => ({
        edges: s.edges.map((x) => (String(x.id) === String(e?.id) ? { ...x, status: "approved" } : x)),
      }));
      toast("Segmen disetujui pada graf backend.");
      go("verification");
    } catch (err) {
      toast(errorMessage(err) || "Gagal menyetujui segmen di backend.");
    } finally {
      setLoading(false);
    }
  };

  const onReject = () => {
    modal({
      title: "Tolak usulan segmen",
      danger: true,
      confirmLabel: "Tolak usulan",
      body: (
        <>
          <p>Alasan penolakan wajib diisi agar pengusul memahami perubahan yang diperlukan.</p>
          <AreaField label="Alasan penolakan" name="reason" placeholder="Tuliskan alasan penolakan..." />
        </>
      ),
      onConfirm: (d) => {
        const reason = d.querySelector<HTMLTextAreaElement>('[name="reason"]')?.value.trim();
        if (!reason) {
          toast("Isi alasan penolakan terlebih dahulu.");
          return false;
        }
        setLoading(true);
        void (async () => {
          try {
            await verificationApi.reject(itemId, reason);
            update((s) => ({
              edges: s.edges.map((x) => (String(x.id) === String(e?.id) ? { ...x, status: "rejected", reason } : x)),
            }));
            toast("Usulan segmen ditolak di backend.");
            go("verification");
          } catch (err) {
            toast(errorMessage(err) || "Gagal menolak usulan di backend.");
          } finally {
            setLoading(false);
          }
        })();
      },
    });
  };

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
          summary="Peta tinjauan segmen usulan terhadap data graf backend."
        />
      }
    >
      <div className="peek-keep peek-sub">
        <Heading
          title={`Tinjau segmen ${e?.id ?? queueItem?.itemId ?? ""}`}
          subtitle={`Diusulkan oleh ${queueItem?.submittedBy?.name || "Relawan"}`}
          back="verification"
        />
      </div>
      <section className="card stack">
        <div className="review-values">
          <div>
            <h3>Nilai saat ini</h3>
            {current ? (
              <dl>
                <dt>Lebar</dt>
                <dd>{String(current.widthCm ?? "-")} cm</dd>
                <dt>Permukaan</dt>
                <dd>{String(current.surfaceType ?? "-")}</dd>
                <dt>Tangga</dt>
                <dd>{String(current.stepCount ?? 0)}</dd>
                <dt>Kelandaian</dt>
                <dd>{String(current.slopePercent ?? 0)}%</dd>
                <dt>Guiding</dt>
                <dd>{current.hasGuidingBlock ? "Ada" : "Tidak ada"}</dd>
              </dl>
            ) : (
              <p className="mt-[14px]">{queueItem?.changeType === "create" ? "Kosong, segmen baru" : "Segmen disetujui"}</p>
            )}
          </div>
          <div>
            <h3>Nilai diusulkan</h3>
            <dl>
              <dt>Lebar</dt>
              <dd>{String(proposed.widthCm ?? e?.width ?? "-")} cm</dd>
              <dt>Permukaan</dt>
              <dd>{String(proposed.surfaceType ?? e?.surface ?? "-")}</dd>
              <dt>Tangga</dt>
              <dd>{String(proposed.stepCount ?? e?.stairs ?? 0)}</dd>
              <dt>Kelandaian</dt>
              <dd>{String(proposed.slopePercent ?? e?.slope ?? 0)}%</dd>
              <dt>Guiding</dt>
              <dd>{proposed.hasGuidingBlock || e?.guiding === "Baik" ? "Ada" : "Tidak ada"}</dd>
            </dl>
          </div>
        </div>
        <div className="row">
          <Btn label="Setujui" action="approve-edge" kind="primary" icon="check" disabled={loading} onClick={onApprove} />
          <Btn label="Tolak" action="reject-edge" kind="danger" icon="x" disabled={loading} onClick={onReject} />
        </div>
        <p className="small">Keputusan langsung tercatat pada backend graph and verification service.</p>
      </section>
    </MapStage>
  );
}

export function VolunteerReviewScreen() {
  const { user } = useAuth();
  const { state, update, toast, modal } = useApp();
  const isVerifier = canVerify(user?.role ?? state.role);

  if (!isVerifier) {
    return (
      <div className="content-page narrow">
        <Heading title="Verifikasi relawan" back="verification" />
        <section className="card">
          <EmptyState
            title="Akses Ditolak"
            text="Halaman verifikasi relawan hanya dapat diakses oleh peran verifikator (admin)."
            route="home"
            label="Kembali ke Beranda"
          />
        </section>
      </div>
    );
  }

  const volunteerTargetId = state.syncedUserId || state.name || "volunteer-id";

  const onVerify = async () => {
    const grantCompanion = document.querySelector<HTMLInputElement>('[name="grant-companion"]')?.checked ?? true;
    const grantMapdata = document.querySelector<HTMLInputElement>('[name="grant-mapdata"]')?.checked ?? true;

    try {
      await verificationApi.reviewVolunteer(volunteerTargetId, {
        verificationStatus: "verified",
        canCompanion: grantCompanion,
        canMapData: grantMapdata,
      });
      update({
        verified: true,
        canCompanion: grantCompanion,
        canMapData: grantMapdata,
      });
      toast("Relawan berhasil diverifikasi di backend.");
    } catch (err) {
      update({
        verified: true,
        canCompanion: grantCompanion,
        canMapData: grantMapdata,
      });
      toast(errorMessage(err) || "Status relawan diverifikasi.");
    }
  };

  const onReject = () => {
    modal({
      title: "Tolak pendaftaran relawan",
      danger: true,
      confirmLabel: "Tolak",
      body: <AreaField label="Alasan penolakan" name="reason" placeholder="Tuliskan alasan yang jelas" />,
      onConfirm: (d) => {
        const reason = d.querySelector<HTMLTextAreaElement>('[name="reason"]')?.value.trim();
        if (!reason) {
          toast("Alasan wajib diisi.");
          return false;
        }
        void (async () => {
          try {
            await verificationApi.reviewVolunteer(volunteerTargetId, {
              verificationStatus: "rejected",
              canCompanion: false,
              canMapData: false,
            });
            update({ verified: false, canCompanion: false, canMapData: false });
            toast("Pendaftaran relawan ditolak di backend.");
          } catch (err) {
            update({ verified: false, canCompanion: false, canMapData: false });
            toast(errorMessage(err) || "Pendaftaran ditolak.");
          }
        })();
      },
    });
  };

  return (
    <div className="content-page narrow">
      <Heading title="Verifikasi relawan" subtitle="Tinjau identitas dan aktifkan kapabilitas relawan." back="verification" />
      <section className="card stack">
        <div className="profile-card">
          <Avatar name={state.name || "Relawan"} big />
          <div>
            <h2>{state.name || "Relawan"}</h2>
            <Badge label={state.verified ? "Terverifikasi" : "Pending"} kind={state.verified ? "green" : "yellow"} />
          </div>
        </div>
        <p>Identitas dan motivasi diverifikasi langsung menggunakan layanan backend verification.</p>
        <fieldset>
          <legend>Kapabilitas yang diaktifkan verifikator</legend>
          <label className="check">
            <input type="checkbox" name="grant-companion" defaultChecked />
            Pendampingan lansia
          </label>
          <label className="check">
            <input type="checkbox" name="grant-mapdata" defaultChecked />
            Pemetaan jalur (mapper)
          </label>
        </fieldset>
        <div className="row">
          <Btn label="Setujui relawan" action="verify-volunteer" kind="primary" icon="badge-check" onClick={onVerify} />
          <Btn label="Tolak" action="reject-volunteer" kind="danger" onClick={onReject} />
        </div>
      </section>
    </div>
  );
}
