import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcrypt";
import { loadDatabaseUrl, isLocalHost } from "./demo-release.seed.js";
import { FT_DEMO_ACCOUNTS, FT_DEMO_DATA, FT_DEMO_TAG, buildFtNetwork, ftEmail } from "./ft-ugm-demo.fixture.js";

export function assertFtApplyGuard(args: string[], hostname: string) {
  if (!args.includes("--apply")) return;
  if (!args.includes(`--ack-fixture=${FT_DEMO_TAG}`)) throw new Error(`--apply requires --ack-fixture=${FT_DEMO_TAG}`);
  if (!isLocalHost(hostname) && !args.includes(`--ack-target=${hostname}`)) throw new Error("Remote apply requires an explicit --ack-target matching the database hostname.");
}
const argValue = (args: string[], key: string) => args.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1);
const privateJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data, (_, value) => typeof value === "bigint" ? value.toString() : value, 2) + "\n"); }
  finally { fs.closeSync(fd); }
};

export async function seedFtDemo(args = process.argv.slice(2)) {
  const target = loadDatabaseUrl(argValue(args, "--env-file") ?? null);
  assertFtApplyGuard(args, target.targetHost);
  const { prisma } = await import("../src/config/prisma.js");
  const { nodes, edges } = buildFtNetwork();
  const knownUsers = await prisma.user.findMany({ where: { OR: FT_DEMO_ACCOUNTS.flatMap(a => [{ email: ftEmail(a.key) }, { phoneNumber: a.phone }]) }, select: { id: true, name: true, email: true, phoneNumber: true, role: true } });
  for (const a of FT_DEMO_ACCOUNTS) {
    const user = knownUsers.find(u => u.email === ftEmail(a.key) || u.phoneNumber === a.phone);
    if (user && (user.email !== ftEmail(a.key) || user.phoneNumber !== a.phone || user.role !== a.role || !user.name.startsWith("[DEMO FT]"))) throw new Error(`Account collision for ${a.key}; refusing to touch existing data.`);
  }
  const existingEdges = await prisma.$queryRaw<{ id: bigint; metadata: unknown }[]>`SELECT id, metadata FROM path_edges WHERE metadata->>'demoFixture'=${FT_DEMO_TAG}`;
  if (!args.includes("--apply")) return { mode: "dry-run", fixture: FT_DEMO_TAG, targetHost: target.targetHost, targetDatabase: target.targetDb,
    syntheticAccessibility: true, verifiedSurvey: false, buildings: 4, nodes: nodes.length + 1, edges: edges.length,
    existingFixtureEdges: existingEdges.length, existingAccounts: knownUsers.length, accounts: FT_DEMO_ACCOUNTS.map(a => ({ ...a, email: ftEmail(a.key) })),
    cases: FT_DEMO_DATA.cases.map(c => ({ key: c.key, origin: c.originName, destination: c.destinationName, coordinates: [c.origin, c.destination], paths: c.paths.map(p => ({ branch: p.branch, mapGeometryDistanceM: p.lengthM })) })),
    note: "No database writes, notifications, or external messages were sent." };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = argValue(args, "--out-dir") ?? "/tmp/unstoppable-ft-demo";
  const credentialsPath = path.join(outputDir, `credentials-${stamp}.json`), manifestPath = path.join(outputDir, `manifest-${stamp}.json`), backupPath = path.join(outputDir, `before-${stamp}.json`);
  privateJson(backupPath, { fixture: FT_DEMO_TAG, createdAt: new Date(), targetHost: target.targetHost, existingUsers: knownUsers, existingEdges,
    note: "Existing fixture rows are not updated; this records which records predated the run." });
  const passwords = new Map(FT_DEMO_ACCOUNTS.map(a => [a.key, crypto.randomBytes(18).toString("base64url")]));
  const hashes = new Map(await Promise.all(FT_DEMO_ACCOUNTS.map(async a => [a.key, await bcrypt.hash(passwords.get(a.key)!, 10)] as const)));
  // Write passwords privately before the transaction so no successful commit can strand credentials.
  privateJson(credentialsPath, { fixture: FT_DEMO_TAG, targetHost: target.targetHost, accounts: FT_DEMO_ACCOUNTS.filter(a => !knownUsers.some(u => u.email === ftEmail(a.key))).map(a => ({ key: a.key, email: ftEmail(a.key), phone: a.phone, password: passwords.get(a.key) })) });
  const manifest = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${FT_DEMO_TAG}))`;
    const users: Record<string, string> = {};
    for (const a of FT_DEMO_ACCOUNTS) {
      const existing = await tx.user.findUnique({ where: { email: ftEmail(a.key) } });
      const user = existing ?? await tx.user.create({ data: { name: a.name, email: ftEmail(a.key), phoneNumber: a.phone, phoneVerified: true, role: a.role, passwordHash: hashes.get(a.key)! } });
      users[a.key] = user.id;
      if (a.profile) {
        await tx.userAccessibilityProfile.upsert({ where: { userId_profileId: { userId: user.id, profileId: a.profile } }, update: {}, create: { userId: user.id, profileId: a.profile, isPrimary: true } });
        await tx.blindUserProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, onboardingCompleted: true, emergencyContactName: "[DEMO FT] Rina Keluarga", emergencyContactPhone: "089900002003" } });
      }
      if (a.role === "volunteer") {
        await tx.volunteerProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, verificationStatus: "verified", canCompanion: true, canMapData: true, isActive: true, verifiedAt: new Date(), motivation: FT_DEMO_TAG, serviceAreaNote: "[DEMO FT] FT UGM dan FMIPA (atribut sintetis)" } });
        if (!await tx.volunteerAvailability.count({ where: { volunteerId: user.id } })) await tx.$executeRaw`INSERT INTO volunteer_availability (id,volunteer_id,center_point,radius_meters,is_active) VALUES (gen_random_uuid(),${user.id}::uuid,ST_SetSRID(ST_MakePoint(110.3738,-7.766),4326)::geography,1500,TRUE)`;
      }
    }
    for (const key of ["wheelchair", "blind"]) await tx.caregiverRelationship.upsert({ where: { blindUserId_caregiverId: { blindUserId: users[key]!, caregiverId: users.caregiver! } }, update: {}, create: { blindUserId: users[key]!, caregiverId: users.caregiver!, relationshipType: "primary", locationSharingMode: key === "wheelchair" ? "during_trip" : "sos_only" } });
    const buildings: Record<string, string> = {};
    for (const c of FT_DEMO_DATA.cases) for (const side of ["ORIGIN", "DEST"] as const) {
      const code = `FT-DEMO-${c.key}-${side}`, coord = side === "ORIGIN" ? c.origin : c.destination, name = side === "ORIGIN" ? c.originName : c.destinationName;
      const existing = await tx.building.findUnique({ where: { code } });
      if (existing && !existing.name.startsWith("[DEMO FT]")) throw new Error(`Building collision: ${code}`);
      const row = existing ?? (await tx.$queryRaw<{ id: string }[]>`INSERT INTO buildings (id,name,code,faculty,location,floor_count,has_lift,has_accessible_toilet,surveyed_at,updated_at) VALUES (gen_random_uuid(),${name},${code},'FT UGM / FMIPA — skenario demo',ST_SetSRID(ST_MakePoint(${coord[0]},${coord[1]}),4326)::geography,1,FALSE,FALSE,NULL,NOW()) RETURNING id::text`)[0]!;
      buildings[code] = row!.id;
    }
    const nodeIds: Record<string, string> = {};
    for (const n of [...nodes, { key: "draft-bench", coord: [110.3723,-7.7656] as [number,number], name: "[DEMO FT] Usulan tempat istirahat TETI", caseKey: "draft", buildingCode: null, nodeType: "junction" }]) {
      const note = `${FT_DEMO_TAG}:${n.key}; synthetic accessibility; not a field survey`;
      const [existing] = await tx.$queryRaw<{ id: bigint; note: string | null }[]>`SELECT id,operational_note AS note FROM path_nodes WHERE name=${n.name}`;
      if (existing && existing.note !== note) throw new Error(`Node collision: ${n.name}`);
      const status = n.key === "draft-bench" ? "draft" : "approved";
      const row = existing ?? (await tx.$queryRaw<{ id: bigint }[]>`INSERT INTO path_nodes (building_id,floor_level,node_type,name,location,is_operational,operational_note,status,surveyed_at,created_by,approved_by,updated_at) VALUES (${n.buildingCode ? buildings[n.buildingCode] : null}::uuid,0,${n.nodeType},${n.name},ST_SetSRID(ST_MakePoint(${n.coord[0]},${n.coord[1]}),4326)::geography,TRUE,${note},${status},NULL,${users.volunteer}::uuid,${status === "approved" ? users.admin : null}::uuid,NOW()) RETURNING id`)[0]!;
      nodeIds[n.key] = row.id.toString();
    }
    const edgeIds: Record<string, string> = {};
    for (const e of edges) {
      const [existing] = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM path_edges WHERE metadata->>'demoFixture'=${FT_DEMO_TAG} AND metadata->>'edgeKey'=${e.key}`;
      if (existing) { edgeIds[e.key] = existing.id.toString(); continue; }
      const geometry = JSON.stringify({ type: "LineString", coordinates: e.coordinates });
      const metadata = JSON.stringify({ demoFixture: FT_DEMO_TAG, edgeKey: e.key, caseKey: e.caseKey, branch: e.branch, synthetic: true, verifiedSurvey: false, geometrySource: FT_DEMO_DATA.geometrySource, accessibilityNote: "Widths, guiding blocks, stairs, slopes and handrails are fabricated for this demonstration." });
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`INSERT INTO path_edges (source_node_id,target_node_id,geometry,length_m,surface_type,width_cm,has_stairs,step_count,slope_percent,has_handrail,is_covered,is_indoor,is_one_way,has_guiding_block,guiding_block_condition,is_operational,operational_note,status,surveyed_at,metadata,created_by,approved_by,updated_at)
        SELECT ${BigInt(nodeIds[e.from]!)},${BigInt(nodeIds[e.to]!)},ST_GeomFromGeoJSON(${geometry})::geography,ROUND(ST_Length(ST_GeomFromGeoJSON(${geometry})::geography)::numeric,2),'beton',${e.branch === "guided" ? 120 : 180},${e.stairs},${e.stairs ? 4 : 0},${e.branch === "ramp" ? 3 : 0},${e.stairs},TRUE,FALSE,FALSE,${e.branch !== "ramp"},${e.branch !== "ramp" ? "baik" : null},TRUE,'Atribut aksesibilitas sintetis untuk demo FT UGM','approved',NULL,${metadata}::jsonb,${users.volunteer}::uuid,${users.admin}::uuid,NOW() RETURNING id`;
      edgeIds[e.key] = row!.id.toString();
    }
    return { fixture: FT_DEMO_TAG, syntheticAccessibility: true, verifiedSurvey: false, createdAt: new Date(), targetHost: target.targetHost, users, buildings, nodeIds, edgeIds,
      cases: FT_DEMO_DATA.cases.map(c => ({ key: c.key, origin: { name: c.originName, coord: c.origin }, destination: { name: c.destinationName, coord: c.destination }, branches: c.paths.map(p => ({ branch: p.branch, geometryDistanceM: p.lengthM })),
        report: (() => { const edge = edges.find(e => e.caseKey === c.key && e.branch === "ramp")!; return { edgeKey: edge.key, edgeId: edgeIds[edge.key], coord: [(edge.coordinates[0]![0] + edge.coordinates[1]![0]) / 2, (edge.coordinates[0]![1] + edge.coordinates[1]![1]) / 2], category: "ramp_terhalang", severity: "high", description: "[DEMO FT] Ramp tertutup barang. Ini laporan latihan, bukan kejadian nyata." }; })() })),
      draftNodeId: nodeIds["draft-bench"], credentialsPath, backupPath };
  }, { timeout: 60_000 });
  privateJson(manifestPath, manifest);
  return { mode: "applied", manifestPath, credentialsPath, backupPath, manifest };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedFtDemo().then(result => console.log(JSON.stringify(result,null,2))).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode=1; }).finally(async () => { const { prisma } = await import("../src/config/prisma.js"); await prisma.$disconnect(); });
}
