import fs from "node:fs";
import { createHash } from "node:crypto";

export const FT_DEMO_TAG = "ft-ugm-demo-v1";
export type Coord = [number, number];
type Path = { branch: "guided" | "ramp"; lengthM: number; coordinates: Coord[]; osmWayIds: string[]; osmNodeIds: string[] };
export type DemoCase = { key: string; originName: string; destinationName: string; origin: Coord; destination: Coord; paths: Path[] };
export const FT_DEMO_DATA = JSON.parse(fs.readFileSync(new URL("./ft-ugm-demo.paths.json", import.meta.url), "utf8")) as {
  fixture: string; geometrySource: string; downloadedAt: string; accessPolicyNote: string; cases: DemoCase[];
};
export const FT_DEMO_ACCOUNTS = [
  { key: "wheelchair", name: "[DEMO FT] Pak Budi Kursi Roda", phone: "089900002001", role: "mobility_user", profile: "wheelchair" },
  { key: "blind", name: "[DEMO FT] Bu Sari Tunanetra", phone: "089900002002", role: "blind_user", profile: "blind" },
  { key: "caregiver", name: "[DEMO FT] Rina Keluarga", phone: "089900002003", role: "caregiver", profile: null },
  { key: "volunteer", name: "[DEMO FT] Andi Relawan Pemeta", phone: "089900002004", role: "volunteer", profile: null },
  { key: "admin", name: "[DEMO FT] Admin Verifikator", phone: "089900002005", role: "admin", profile: null },
] as const;
export const ftEmail = (key: string) => `ft-demo-${key}@demo.unstoppable.local`;
export const edgePair = (a: string, b: string) => [a, b].sort().join(":");
export type FixtureEdge = { key: string; from: string; to: string; coordinates: Coord[]; branch: "shared" | "guided" | "ramp"; stairs: boolean; caseKey: string };
export type FixtureNode = { key: string; coord: Coord; name: string; caseKey: string; buildingCode: string | null; nodeType: string };

/** Collapse intermediate OSM vertices, keeping geometry bends and every shared fork/join. */
export function buildFtNetwork() {
  const nodes: FixtureNode[] = [], edges: FixtureEdge[] = [];
  for (const c of FT_DEMO_DATA.cases) {
    const neighbors = new Map<string, Set<string>>(), coords = new Map<string, Coord>();
    for (const path of c.paths) path.osmNodeIds.forEach((n, i) => {
      coords.set(n, path.coordinates[i]!);
      if (!neighbors.has(n)) neighbors.set(n, new Set());
      for (const j of [i - 1, i + 1]) if (path.osmNodeIds[j]) neighbors.get(n)!.add(path.osmNodeIds[j]!);
    });
    const first = c.paths[0]!, start = first.osmNodeIds[0]!, end = first.osmNodeIds.at(-1)!;
    const anchors = new Set([start, end, ...[...neighbors].filter(([, ns]) => ns.size !== 2).map(([n]) => n)]);
    for (const p of c.paths) {
      anchors.add(p.osmNodeIds[Math.floor(p.osmNodeIds.length / 3)]!);
      anchors.add(p.osmNodeIds[Math.floor(p.osmNodeIds.length * 2 / 3)]!);
    }
    const byKey = new Map<string, FixtureEdge>();
    for (const p of c.paths) {
      let from = 0;
      for (let i = 1; i < p.osmNodeIds.length; i++) {
        if (!anchors.has(p.osmNodeIds[i]!)) continue;
        const a = p.osmNodeIds[from]!, b = p.osmNodeIds[i]!;
        const sequence = p.osmNodeIds.slice(from, i + 1);
        const signature = createHash("sha256").update((a < b ? sequence : [...sequence].reverse()).join(",")).digest("hex").slice(0, 10);
        const key = `${c.key}:${edgePair(a, b)}:${signature}`;
        const previous = byKey.get(key);
        if (previous) previous.branch = "shared";
        else byKey.set(key, { key, from: `${c.key}:${a}`, to: `${c.key}:${b}`, coordinates: p.coordinates.slice(from, i + 1), branch: p.branch, stairs: false, caseKey: c.key });
        from = i;
      }
    }
    const stair = [...byKey.values()].find((e) => e.branch === "guided");
    if (!stair || ![...byKey.values()].some((e) => e.branch === "ramp")) throw new Error(`Missing distinct branches for ${c.key}`);
    stair.stairs = true;
    edges.push(...byKey.values());
    for (const n of anchors) nodes.push({ key: `${c.key}:${n}`, coord: coords.get(n)!, caseKey: c.key,
      name: n === start ? c.originName : n === end ? c.destinationName : `[DEMO FT] Simpang ${c.key} ${n}`,
      buildingCode: n === start ? `FT-DEMO-${c.key}-ORIGIN` : n === end ? `FT-DEMO-${c.key}-DEST` : null,
      nodeType: n === start ? "gate" : n === end ? "entrance" : "junction" });
  }
  return { nodes, edges };
}
