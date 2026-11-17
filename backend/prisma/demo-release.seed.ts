import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import type { Prisma as PrismaTypes } from "../generated/prisma/client.js";
import type { GeoJsonPoint, WeightConfig } from "../src/modules/routes/routes.types.js";
import {
  DEMO_ACCOUNTS,
  DEMO_BUILDINGS,
  DEMO_CAREGIVER_LINKS,
  DEMO_DEV_REPAIR_BATCH,
  DEMO_EDGES,
  DEMO_NODES,
  DEMO_TAG,
  DEV_EDGE_REPAIR_SPECS,
  EXPECTED_LOCAL_PROFILE_BRANCH,
  PRESERVED_CLOSURE_NODE_ID,
} from "./demo-release.fixture.js";

const BCRYPT_COST = 10;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const COORD_EPS = 1e-7;

export interface CliOptions {
  apply: boolean;
  auditOnly: boolean;
  cleanup: boolean;
  restorePath: string | null;
  envFile: string | null;
  ackFixture: string | null;
  ackTarget: string | null;
  backupOut: string | null;
  manifestOut: string | null;
  credentialsOut: string | null;
  rotatePasswords: boolean;
  skipDevRepair: boolean;
}

export function stripSurroundingQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function loadDatabaseUrl(envFile: string | null): { dbUrl: string; targetHost: string; targetDb: string } {
  let rawUrl = process.env.DATABASE_URL ?? "";
  if (envFile) {
    const content = fs.readFileSync(envFile, "utf8");
    const parsed = dotenv.parse(content);
    rawUrl = parsed.DATABASE_URL ?? "";
  }
  const dbUrl = stripSurroundingQuotes(rawUrl);
  if (!dbUrl) {
    throw new Error("DATABASE_URL is missing. Set DATABASE_URL or pass --env-file=<path>.");
  }
  if (dbUrl.endsWith(">")) {
    throw new Error("DATABASE_URL appears truncated (ends with '>'). Refusing to proceed.");
  }
  let urlObj: URL;
  try {
    urlObj = new URL(dbUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(urlObj.protocol)) {
    throw new Error(`Unsupported DATABASE_URL protocol: ${urlObj.protocol}`);
  }
  process.env.DATABASE_URL = dbUrl;
  return {
    dbUrl,
    targetHost: urlObj.hostname,
    targetDb: urlObj.pathname.replace(/^\//, ""),
  };
}

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

export function assertApplyGuard(opts: CliOptions, targetHost: string): void {
  if (!opts.apply) return;
  if (opts.ackFixture !== DEMO_TAG) {
    throw new Error(`--apply requires --ack-fixture=${DEMO_TAG}`);
  }
  if (!isLocalHost(targetHost) && opts.ackTarget !== targetHost) {
    throw new Error(
      `Non-local target '${targetHost}' requires explicit --ack-target=${targetHost} alongside --apply.`,
    );
  }
}

export function parseCliArgs(argv: string[]): CliOptions {
  const getVal = (prefix: string): string | null => {
    const found = argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  };
  return {
    apply: argv.includes("--apply"),
    auditOnly: argv.includes("--audit"),
    cleanup: argv.includes("--cleanup"),
    restorePath: getVal("--restore="),
    envFile: getVal("--env-file="),
    ackFixture: getVal("--ack-fixture="),
    ackTarget: getVal("--ack-target="),
    backupOut: getVal("--backup-out="),
    manifestOut: getVal("--manifest-out="),
    credentialsOut: getVal("--credentials-out="),
    rotatePasswords: argv.includes("--rotate-passwords"),
    skipDevRepair: argv.includes("--skip-dev-repair"),
  };
}

function generateStrongPassword(): string {
  return `${crypto.randomBytes(18).toString("base64url")}!A1a`;
}

function ensurePrivateDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function writePrivateJson(filePath: string, data: unknown, mode = 0o600): void {
  ensurePrivateDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode });
  fs.chmodSync(filePath, mode);
}

function approxEqualCoord(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.abs(a[0] - b[0]) <= COORD_EPS && Math.abs(a[1] - b[1]) <= COORD_EPS;
}

export interface DevEdgeSnapshot {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceName: string | null;
  targetName: string | null;
  sourceCoord: [number, number];
  targetCoord: [number, number];
  geojson: string;
  lengthM: string;
  surfaceType: string | null;
  widthCm: number | null;
  hasStairs: boolean;
  stepCount: number;
  slopePercent: string | null;
  hasHandrail: boolean;
  isCovered: boolean;
  isIndoor: boolean;
  isOneWay: boolean;
  hasGuidingBlock: boolean;
  guidingBlockCondition: string | null;
  isOperational: boolean;
  operationalNote: string | null;
  status: string;
  surveyedAt: string | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
  updatedAtRaw: string;
  startMatches: boolean;
  endMatches: boolean;
  eligibleForRepair: boolean;
  skipReason: string | null;
}

export interface DemoBackupPayload {
  schemaVersion: 1;
  createdAt: string;
  fixtureTag: string;
  targetHost: string;
  targetDb: string;
  devEdgesBefore: DevEdgeSnapshot[];
  preservedNode38: {
    id: string;
    name: string | null;
    isOperational: boolean;
    status: string;
  } | null;
  preExistingDemo: {
    buildingIds: string[];
    nodeIds: string[];
    edgeIds: string[];
    userIds: string[];
  };
}

async function getRuntimeDeps() {
  const [{ prisma }, { Prisma }, { buildCostExpression, buildDegradePenaltyExpression }, routesSvc] =
    await Promise.all([
      import("../src/config/prisma.js"),
      import("../generated/prisma/client.js"),
      import("../src/modules/routes/weight-builder.js"),
      import("../src/modules/routes/routes.service.js"),
    ]);
  return { prisma, Prisma, buildCostExpression, buildDegradePenaltyExpression, routesSvc };
}

type TxClient = PrismaTypes.TransactionClient;

async function inspectDevEdges(db: TxClient | Awaited<ReturnType<typeof getRuntimeDeps>>["prisma"]): Promise<DevEdgeSnapshot[]> {
  const ids = DEV_EDGE_REPAIR_SPECS.map((s) => s.id);
  const rows = await db.$queryRaw<
    Array<{
      id: bigint;
      sourceNodeId: bigint;
      targetNodeId: bigint;
      sourceName: string | null;
      targetName: string | null;
      sourceLng: number;
      sourceLat: number;
      targetLng: number;
      targetLat: number;
      geojson: string;
      lengthM: string;
      surfaceType: string | null;
      widthCm: number | null;
      hasStairs: boolean;
      stepCount: number;
      slopePercent: string | null;
      hasHandrail: boolean;
      isCovered: boolean;
      isIndoor: boolean;
      isOneWay: boolean;
      hasGuidingBlock: boolean;
      guidingBlockCondition: string | null;
      isOperational: boolean;
      operationalNote: string | null;
      status: string;
      surveyedAt: Date | null;
      metadata: Record<string, unknown> | null;
      updatedAt: Date;
      updatedAtRaw: string;
      startMatches: boolean;
      endMatches: boolean;
    }>
  >`
    SELECT e.id,
           e.source_node_id AS "sourceNodeId",
           e.target_node_id AS "targetNodeId",
           s.name AS "sourceName",
           t.name AS "targetName",
           ST_X(s.location::geometry) AS "sourceLng",
           ST_Y(s.location::geometry) AS "sourceLat",
           ST_X(t.location::geometry) AS "targetLng",
           ST_Y(t.location::geometry) AS "targetLat",
           ST_AsGeoJSON(e.geometry)::text AS geojson,
           e.length_m::text AS "lengthM",
           e.surface_type AS "surfaceType",
           e.width_cm AS "widthCm",
           e.has_stairs AS "hasStairs",
           e.step_count AS "stepCount",
           e.slope_percent::text AS "slopePercent",
           e.has_handrail AS "hasHandrail",
           e.is_covered AS "isCovered",
           e.is_indoor AS "isIndoor",
           e.is_one_way AS "isOneWay",
           e.has_guiding_block AS "hasGuidingBlock",
           e.guiding_block_condition AS "guidingBlockCondition",
           e.is_operational AS "isOperational",
           e.operational_note AS "operationalNote",
           e.status,
           e.surveyed_at AS "surveyedAt",
           e.metadata,
           e.updated_at AS "updatedAt",
           e.updated_at::text AS "updatedAtRaw",
           ST_Equals(ST_StartPoint(e.geometry::geometry), s.location::geometry) AS "startMatches",
           ST_Equals(ST_EndPoint(e.geometry::geometry), t.location::geometry) AS "endMatches"
    FROM path_edges e
    JOIN path_nodes s ON s.id = e.source_node_id
    JOIN path_nodes t ON t.id = e.target_node_id
    WHERE e.id = ANY(${ids})
    ORDER BY e.id ASC
  `;

  return rows.map((r) => {
    const spec = DEV_EDGE_REPAIR_SPECS.find((s) => s.id === r.id);
    let eligible = true;
    let skipReason: string | null = null;

    if (!spec) {
      eligible = false;
      skipReason = "not_in_allowlist";
    } else if (r.sourceNodeId !== spec.expectedSourceNodeId || r.targetNodeId !== spec.expectedTargetNodeId) {
      eligible = false;
      skipReason = `endpoint_ids_mismatch(got ${r.sourceNodeId}->${r.targetNodeId})`;
    } else if (
      !r.sourceName?.startsWith(spec.expectedSourceNamePrefix) ||
      !r.targetName?.startsWith(spec.expectedTargetNamePrefix)
    ) {
      eligible = false;
      skipReason = "endpoints_not_proven_DEV";
    } else if (r.status !== "approved") {
      eligible = false;
      skipReason = `status_not_approved(${r.status})`;
    } else if (r.startMatches && r.endMatches) {
      eligible = false;
      skipReason = "already_endpoint_consistent";
    } else {
      const parsedGeom = JSON.parse(r.geojson) as { type: string; coordinates: [number, number][] };
      const startCoord = parsedGeom.coordinates[0];
      const endCoord = parsedGeom.coordinates[parsedGeom.coordinates.length - 1];
      if (
        !startCoord ||
        !endCoord ||
        !approxEqualCoord(startCoord, spec.expectedCorruptStart) ||
        !approxEqualCoord(endCoord, spec.expectedCorruptEnd)
      ) {
        eligible = false;
        skipReason = "before_geometry_mismatch";
      }
    }

    return {
      id: r.id.toString(),
      sourceNodeId: r.sourceNodeId.toString(),
      targetNodeId: r.targetNodeId.toString(),
      sourceName: r.sourceName,
      targetName: r.targetName,
      sourceCoord: [r.sourceLng, r.sourceLat],
      targetCoord: [r.targetLng, r.targetLat],
      geojson: r.geojson,
      lengthM: r.lengthM,
      surfaceType: r.surfaceType,
      widthCm: r.widthCm,
      hasStairs: r.hasStairs,
      stepCount: r.stepCount,
      slopePercent: r.slopePercent,
      hasHandrail: r.hasHandrail,
      isCovered: r.isCovered,
      isIndoor: r.isIndoor,
      isOneWay: r.isOneWay,
      hasGuidingBlock: r.hasGuidingBlock,
      guidingBlockCondition: r.guidingBlockCondition,
      isOperational: r.isOperational,
      operationalNote: r.operationalNote,
      status: r.status,
      surveyedAt: r.surveyedAt ? r.surveyedAt.toISOString() : null,
      metadata: r.metadata,
      updatedAt: r.updatedAt.toISOString(),
      updatedAtRaw: r.updatedAtRaw,
      startMatches: r.startMatches,
      endMatches: r.endMatches,
      eligibleForRepair: eligible,
      skipReason,
    };
  });
}

export async function auditDemoDatabase(targetHost: string, targetDb: string) {
  const { prisma } = await getRuntimeDeps();
  const profiles = await prisma.accessibilityProfile.findMany({
    select: { id: true, label: true, primaryChannel: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });
  const devEdges = await inspectDevEdges(prisma);
  const [node38] = await prisma.$queryRaw<
    Array<{ id: bigint; name: string | null; isOperational: boolean; status: string }>
  >`SELECT id, name, is_operational AS "isOperational", status FROM path_nodes WHERE id = ${PRESERVED_CLOSURE_NODE_ID}`;

  const existingBuildings = await prisma.$queryRaw<Array<{ id: string; code: string | null; name: string }>>`
    SELECT id::text, code, name FROM buildings
    WHERE code = ANY(${DEMO_BUILDINGS.map((b) => b.code)}) OR name LIKE '[DEMO]%'
    ORDER BY name
  `;
  const existingNodes = await prisma.$queryRaw<Array<{ id: bigint; name: string | null }>>`
    SELECT id, name FROM path_nodes WHERE name = ANY(${DEMO_NODES.map((n) => n.name)}) OR name LIKE '[DEMO]%' ORDER BY id
  `;
  const existingEdges = await prisma.$queryRaw<Array<{ id: bigint; edgeKey: string | null }>>`
    SELECT id, metadata->>'edgeKey' AS "edgeKey" FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TAG} ORDER BY id
  `;
  const existingUsers = await prisma.$queryRaw<Array<{ id: string; role: string; name: string }>>`
    SELECT id::text, role, name FROM users WHERE email = ANY(${DEMO_ACCOUNTS.map((a) => a.email)}) ORDER BY role
  `;
  const [counts] = await prisma.$queryRaw<
    Array<{ buildings: number; nodes: number; edges: number; users: number }>
  >`
    SELECT
      (SELECT COUNT(*)::int FROM buildings) AS buildings,
      (SELECT COUNT(*)::int FROM path_nodes) AS nodes,
      (SELECT COUNT(*)::int FROM path_edges) AS edges,
      (SELECT COUNT(*)::int FROM users) AS users
  `;

  return {
    targetHost,
    targetDb,
    counts: counts!,
    profiles: profiles.map((p) => p.id),
    devEdges,
    preservedNode38: node38
      ? { id: node38.id.toString(), name: node38.name, isOperational: node38.isOperational, status: node38.status }
      : null,
    existingDemo: {
      buildingIds: existingBuildings.map((b) => b.id),
      nodeIds: existingNodes.map((n) => n.id.toString()),
      edgeIds: existingEdges.map((e) => e.id.toString()),
      userIds: existingUsers.map((u) => u.id),
    },
  };
}

function buildBackupPayload(
  audit: Awaited<ReturnType<typeof auditDemoDatabase>>,
): DemoBackupPayload {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    fixtureTag: DEMO_TAG,
    targetHost: audit.targetHost,
    targetDb: audit.targetDb,
    devEdgesBefore: audit.devEdges,
    preservedNode38: audit.preservedNode38,
    preExistingDemo: audit.existingDemo,
  };
}

function toLineStringWkt(coords: readonly (readonly [number, number])[]): string {
  return `SRID=4326;LINESTRING(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(",")})`;
}

export async function restoreFromBackup(opts: CliOptions) {
  if (!opts.restorePath) throw new Error("--restore=<path> is required");
  const { targetHost } = loadDatabaseUrl(opts.envFile);
  assertApplyGuard(opts, targetHost);
  const raw = fs.readFileSync(opts.restorePath, "utf8");
  const backup = JSON.parse(raw) as DemoBackupPayload;
  if (backup.schemaVersion !== 1 || backup.fixtureTag !== DEMO_TAG) {
    throw new Error("Invalid backup file schemaVersion or fixtureTag");
  }

  if (!opts.apply) {
    return {
      mode: "dry-run-restore",
      backupPath: opts.restorePath,
      wouldRestoreDevEdges: backup.devEdgesBefore.map((e) => e.id),
      wouldRemoveDemoCreatedAfterBackup: true,
    };
  }

  const { prisma } = await getRuntimeDeps();
  const result = await prisma.$transaction(async (tx) => {
    const restoredEdges: string[] = [];
    for (const edge of backup.devEdgesBefore) {
      const parsed = JSON.parse(edge.geojson) as { type: string; coordinates: [number, number][] };
      const wkt = toLineStringWkt(parsed.coordinates);
      const count = await tx.$executeRaw`
        UPDATE path_edges
        SET geometry = ST_GeogFromText(${wkt}),
            length_m = ${edge.lengthM}::numeric,
            metadata = ${edge.metadata ? JSON.stringify(edge.metadata) : null}::jsonb,
            surveyed_at = ${edge.surveyedAt ? new Date(edge.surveyedAt) : null}::timestamptz,
            updated_at = ${edge.updatedAtRaw}::timestamptz
        WHERE id = ${BigInt(edge.id)}
      `;
      if (count === 1) restoredEdges.push(edge.id);
    }

    const keepEdgeIds = new Set(backup.preExistingDemo.edgeIds);
    const keepNodeIds = new Set(backup.preExistingDemo.nodeIds);
    const keepBuildingIds = new Set(backup.preExistingDemo.buildingIds);
    const keepUserIds = new Set(backup.preExistingDemo.userIds);

    const currentEdges = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TAG}
    `;
    const deletedEdges: string[] = [];
    for (const row of currentEdges) {
      if (!keepEdgeIds.has(row.id.toString())) {
        await tx.$executeRaw`DELETE FROM path_edges WHERE id = ${row.id}`;
        deletedEdges.push(row.id.toString());
      }
    }

    const currentNodes = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM path_nodes WHERE name = ANY(${DEMO_NODES.map((n) => n.name)})
    `;
    const deletedNodes: string[] = [];
    for (const row of currentNodes) {
      if (!keepNodeIds.has(row.id.toString())) {
        const del = await tx.$executeRaw`
          DELETE FROM path_nodes n
          WHERE n.id = ${row.id}
            AND NOT EXISTS (SELECT 1 FROM path_edges e WHERE e.source_node_id = n.id OR e.target_node_id = n.id)
        `;
        if (del === 1) deletedNodes.push(row.id.toString());
      }
    }

    const currentBuildings = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM buildings WHERE code = ANY(${DEMO_BUILDINGS.map((b) => b.code)})
    `;
    const deletedBuildings: string[] = [];
    for (const row of currentBuildings) {
      if (!keepBuildingIds.has(row.id)) {
        await tx.$executeRaw`DELETE FROM buildings WHERE id = ${row.id}::uuid`;
        deletedBuildings.push(row.id);
      }
    }

    const currentUsers = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM users WHERE email = ANY(${DEMO_ACCOUNTS.map((a) => a.email)})
    `;
    const deletedUsers: string[] = [];
    for (const row of currentUsers) {
      if (!keepUserIds.has(row.id)) {
        await tx.$executeRaw`DELETE FROM users WHERE id = ${row.id}::uuid`;
        deletedUsers.push(row.id);
      }
    }

    return { restoredEdges, deletedEdges, deletedNodes, deletedBuildings, deletedUsers };
  }, { maxWait: 20_000, timeout: 60_000 });

  return { mode: "applied-restore", backupPath: opts.restorePath, ...result };
}

export async function cleanupDemoDataset(opts: CliOptions) {
  const { targetHost, targetDb } = loadDatabaseUrl(opts.envFile);
  assertApplyGuard(opts, targetHost);
  const audit = await auditDemoDatabase(targetHost, targetDb);
  if (!opts.apply) {
    return {
      mode: "dry-run-cleanup",
      wouldDeleteEdges: audit.existingDemo.edgeIds,
      wouldDeleteNodesIfUnreferenced: audit.existingDemo.nodeIds,
      wouldDeleteBuildings: audit.existingDemo.buildingIds,
      wouldDeleteUsers: audit.existingDemo.userIds,
    };
  }

  const { prisma } = await getRuntimeDeps();
  const res = await prisma.$transaction(async (tx) => {
    const delEdges = await tx.$executeRaw`DELETE FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TAG}`;
    const delNodes = await tx.$executeRaw`
      DELETE FROM path_nodes n
      WHERE n.name = ANY(${DEMO_NODES.map((x) => x.name)})
        AND NOT EXISTS (SELECT 1 FROM path_edges e WHERE e.source_node_id = n.id OR e.target_node_id = n.id)
    `;
    const delBuildings = await tx.$executeRaw`
      DELETE FROM buildings WHERE code = ANY(${DEMO_BUILDINGS.map((b) => b.code)})
    `;
    const delUsers = await tx.$executeRaw`
      DELETE FROM users WHERE email = ANY(${DEMO_ACCOUNTS.map((a) => a.email)})
    `;
    return { delEdges, delNodes, delBuildings, delUsers };
  }, { maxWait: 20_000, timeout: 60_000 });

  return { mode: "applied-cleanup", ...res };
}

export async function runDemoRelease(opts: CliOptions) {
  const { targetHost, targetDb } = loadDatabaseUrl(opts.envFile);
  assertApplyGuard(opts, targetHost);

  const audit = await auditDemoDatabase(targetHost, targetDb);
  const requiredProfiles = ["wheelchair", "crutches", "low_vision", "blind"];
  for (const p of requiredProfiles) {
    if (!audit.profiles.includes(p)) {
      throw new Error(`Required accessibility_profile '${p}' is missing in target database.`);
    }
  }

  if (opts.auditOnly) {
    return { mode: "audit", audit };
  }

  if (!opts.apply) {
    return {
      mode: "dry-run",
      targetHost,
      targetDb,
      preservedNode38: audit.preservedNode38,
      devEdgeRepairsPlanned: audit.devEdges.map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceName: e.sourceName,
        targetName: e.targetName,
        eligibleForRepair: !opts.skipDevRepair && e.eligibleForRepair,
        skipReason: opts.skipDevRepair ? "skipped_by_flag" : e.skipReason,
      })),
      demoBuildingsPlanned: DEMO_BUILDINGS.map((b) => ({ code: b.code, name: b.name })),
      demoNodesPlanned: DEMO_NODES.map((n) => ({ key: n.key, name: n.name, coord: n.coord })),
      demoEdgesPlanned: DEMO_EDGES.map((e) => ({ key: e.key, branch: e.branch, from: e.fromKey, to: e.toKey })),
      demoAccountsPlanned: DEMO_ACCOUNTS.map((a) => ({ key: a.key, name: a.name, role: a.role })),
      existingDemoFound: audit.existingDemo,
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = opts.backupOut ?? `/tmp/unstoppable-qa/demo-backup-${timestamp}.json`;
  const backupPayload = buildBackupPayload(audit);
  writePrivateJson(backupPath, backupPayload, 0o600);

  const { prisma, Prisma, buildCostExpression, buildDegradePenaltyExpression, routesSvc } =
    await getRuntimeDeps();

  const prehashedByKey = new Map<string, { password: string; passwordHash: string }>();
  for (const acc of DEMO_ACCOUNTS) {
    const pw = generateStrongPassword();
    prehashedByKey.set(acc.key, {
      password: pw,
      passwordHash: await bcrypt.hash(pw, BCRYPT_COST),
    });
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const txGeneratedCredentials: Array<{
      key: string;
      userId: string;
      name: string;
      email: string;
      phoneNumber: string;
      role: string;
      password: string;
      supportsFeatures: readonly string[];
    }> = [];
    // 1. Optional conditional repair of malformed [DEV] edges 30/31/33 ONLY when preconditions match.
    const devRepairOutcomes: Array<{
      id: string;
      action: "repaired" | "skipped";
      reason?: string;
      beforeGeojson?: string;
      afterGeojson?: string;
      beforeLengthM?: string;
      afterLengthM?: string;
    }> = [];

    if (!opts.skipDevRepair) {
      const txSnapshots = await inspectDevEdges(tx);
      for (const snap of txSnapshots) {
        if (!snap.eligibleForRepair) {
          devRepairOutcomes.push({
            id: snap.id,
            action: "skipped",
            ...(snap.skipReason ? { reason: snap.skipReason } : {}),
          });
          continue;
        }
        const newMetadata = {
          ...(snap.metadata ?? {}),
          demoRepairedFromDev: true,
          repairBatch: DEMO_DEV_REPAIR_BATCH,
          synthetic: true,
          verifiedSurvey: false,
          note: "Repaired endpoint geometry from [DEV] node coordinates for demo consistency; not a verified field survey.",
        };
        const updated = await tx.$queryRaw<Array<{ id: bigint; geojson: string; lengthM: string }>>`
          UPDATE path_edges e
          SET geometry = ST_MakeLine(s.location::geometry, t.location::geometry)::geography,
              length_m = GREATEST(1.0, ROUND(ST_Length(ST_MakeLine(s.location::geometry, t.location::geometry)::geography)::numeric, 2)),
              surveyed_at = NULL,
              metadata = ${JSON.stringify(newMetadata)}::jsonb,
              updated_at = NOW()
          FROM path_nodes s, path_nodes t
          WHERE e.id = ${BigInt(snap.id)}
            AND s.id = e.source_node_id
            AND t.id = e.target_node_id
            AND e.status = 'approved'
            AND e.updated_at::text = ${snap.updatedAtRaw}
            AND ST_AsGeoJSON(e.geometry)::text = ${snap.geojson}
          RETURNING e.id, ST_AsGeoJSON(e.geometry)::text AS geojson, e.length_m::text AS "lengthM"
        `;
        if (updated.length !== 1) {
          throw new Error(`Concurrency guard failed while repairing [DEV] edge ${snap.id}`);
        }
        devRepairOutcomes.push({
          id: snap.id,
          action: "repaired",
          beforeGeojson: snap.geojson,
          afterGeojson: updated[0]!.geojson,
          beforeLengthM: snap.lengthM,
          afterLengthM: updated[0]!.lengthM,
        });
      }
    }

    // Verify closed node 38 was NOT touched if present
    if (audit.preservedNode38) {
      const [n38After] = await tx.$queryRaw<Array<{ isOperational: boolean }>>`
        SELECT is_operational AS "isOperational" FROM path_nodes WHERE id = ${PRESERVED_CLOSURE_NODE_ID}
      `;
      if (n38After && n38After.isOperational !== audit.preservedNode38.isOperational) {
        throw new Error("Safety invariant violated: node 38 operational state changed");
      }
    }

    // 2. Upsert [DEMO] buildings (approved/searchable catalog records, surveyed_at = NULL)
    const buildingIds = new Map<string, string>();
    for (const b of DEMO_BUILDINGS) {
      const [row] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO buildings (
          id, name, code, faculty, location, floor_count, has_lift, has_accessible_toilet, surveyed_at, updated_at
        )
        VALUES (
          gen_random_uuid(),
          ${b.name},
          ${b.code},
          ${b.faculty},
          ST_SetSRID(ST_MakePoint(${b.coord[0]}, ${b.coord[1]}), 4326)::geography,
          ${b.floorCount},
          ${b.hasLift},
          ${b.hasAccessibleToilet},
          NULL,
          NOW()
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          faculty = EXCLUDED.faculty,
          location = EXCLUDED.location,
          floor_count = EXCLUDED.floor_count,
          has_lift = EXCLUDED.has_lift,
          has_accessible_toilet = EXCLUDED.has_accessible_toilet,
          surveyed_at = NULL,
          accessibility_score = NULL,
          score_computed_at = NULL,
          updated_at = NOW()
        RETURNING id::text AS id
      `;
      buildingIds.set(b.code, row!.id);
    }

    // 3. Upsert [DEMO] nodes
    const nodeIds = new Map<string, bigint>();
    for (const n of DEMO_NODES) {
      const bId = n.buildingCode ? buildingIds.get(n.buildingCode) ?? null : null;
      const existing = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM path_nodes WHERE name = ${n.name} ORDER BY id ASC LIMIT 1
      `;
      if (existing[0]) {
        await tx.$executeRaw`
          UPDATE path_nodes
          SET building_id = ${bId}::uuid,
              floor_level = ${n.floorLevel ?? 0},
              node_type = ${n.nodeType},
              location = ST_SetSRID(ST_MakePoint(${n.coord[0]}, ${n.coord[1]}), 4326)::geography,
              crossing_type = ${n.crossingType ?? null},
              has_traffic_signal = ${n.hasTrafficSignal ?? false},
              is_operational = TRUE,
              operational_note = ${n.note},
              status = 'approved',
              surveyed_at = NULL,
              updated_at = NOW()
          WHERE id = ${existing[0].id}
        `;
        nodeIds.set(n.key, existing[0].id);
      } else {
        const [created] = await tx.$queryRaw<Array<{ id: bigint }>>`
          INSERT INTO path_nodes (
            building_id, floor_level, node_type, name, location,
            crossing_type, has_traffic_signal, is_operational, operational_note,
            status, surveyed_at, updated_at
          )
          VALUES (
            ${bId}::uuid,
            ${n.floorLevel ?? 0},
            ${n.nodeType},
            ${n.name},
            ST_SetSRID(ST_MakePoint(${n.coord[0]}, ${n.coord[1]}), 4326)::geography,
            ${n.crossingType ?? null},
            ${n.hasTrafficSignal ?? false},
            TRUE,
            ${n.note},
            'approved',
            NULL,
            NOW()
          )
          RETURNING id
        `;
        nodeIds.set(n.key, created!.id);
      }
    }

    // 4. Upsert [DEMO] edges with explicit static bends & PostGIS geography length
    const edgeIds = new Map<string, bigint>();
    for (const e of DEMO_EDGES) {
      const sourceId = nodeIds.get(e.fromKey)!;
      const targetId = nodeIds.get(e.toKey)!;
      const wkt = toLineStringWkt(e.coordinates);
      const metadata = {
        demoFixture: DEMO_TAG,
        edgeKey: e.key,
        branch: e.branch,
        leg: e.leg,
        synthetic: true,
        verifiedSurvey: false,
        ...(e.extraMetadata ?? {}),
      };
      const [row] = await tx.$queryRaw<Array<{ id: bigint }>>`
        INSERT INTO path_edges (
          id, source_node_id, target_node_id, geometry, length_m,
          surface_type, width_cm, has_stairs, step_count, slope_percent,
          has_handrail, is_covered, is_indoor, is_one_way,
          has_guiding_block, guiding_block_condition,
          is_operational, operational_note, status, surveyed_at, metadata, updated_at
        )
        SELECT
          COALESCE(
            (SELECT id FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TAG} AND metadata->>'edgeKey' = ${e.key} LIMIT 1),
            nextval(pg_get_serial_sequence('path_edges', 'id'))
          ),
          ${sourceId},
          ${targetId},
          ST_GeogFromText(${wkt}),
          GREATEST(1.0, ROUND(ST_Length(ST_GeogFromText(${wkt}))::numeric, 2)),
          ${e.surfaceType},
          ${e.widthCm},
          ${e.hasStairs},
          ${e.stepCount},
          ${e.slopePercent},
          ${e.hasHandrail},
          ${e.isCovered},
          ${e.isIndoor},
          ${e.isOneWay},
          ${e.hasGuidingBlock},
          ${e.guidingBlockCondition},
          TRUE,
          ${e.operationalNote},
          'approved',
          NULL,
          ${JSON.stringify(metadata)}::jsonb,
          NOW()
        ON CONFLICT (id) DO UPDATE SET
          source_node_id = EXCLUDED.source_node_id,
          target_node_id = EXCLUDED.target_node_id,
          geometry = EXCLUDED.geometry,
          length_m = EXCLUDED.length_m,
          surface_type = EXCLUDED.surface_type,
          width_cm = EXCLUDED.width_cm,
          has_stairs = EXCLUDED.has_stairs,
          step_count = EXCLUDED.step_count,
          slope_percent = EXCLUDED.slope_percent,
          has_handrail = EXCLUDED.has_handrail,
          is_covered = EXCLUDED.is_covered,
          is_indoor = EXCLUDED.is_indoor,
          is_one_way = EXCLUDED.is_one_way,
          has_guiding_block = EXCLUDED.has_guiding_block,
          guiding_block_condition = EXCLUDED.guiding_block_condition,
          is_operational = TRUE,
          operational_note = EXCLUDED.operational_note,
          status = 'approved',
          surveyed_at = NULL,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `;
      edgeIds.set(e.key, row!.id);
    }

    // 5. Upsert dedicated [DEMO] accounts (never modifying existing real users)
    const accountIds = new Map<string, string>();
    for (const acc of DEMO_ACCOUNTS) {
      const existing = await tx.user.findUnique({
        where: { email: acc.email },
        select: { id: true, role: true },
      });
      if (existing && existing.role !== acc.role) {
        throw new Error(`Safety guard: existing user for ${acc.email} has unexpected role ${existing.role}`);
      }
      let userId: string;
      const prehashed = prehashedByKey.get(acc.key)!;
      if (existing) {
        let passwordHashUpdate: { passwordHash?: string } = {};
        if (opts.rotatePasswords) {
          passwordHashUpdate = { passwordHash: prehashed.passwordHash };
          txGeneratedCredentials.push({
            key: acc.key,
            userId: existing.id,
            name: acc.name,
            email: acc.email,
            phoneNumber: acc.phoneNumber,
            role: acc.role,
            password: prehashed.password,
            supportsFeatures: acc.supportsFeatures,
          });
        }
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            name: acc.name,
            phoneNumber: acc.phoneNumber,
            phoneVerified: true,
            ...passwordHashUpdate,
          },
          select: { id: true },
        });
        userId = updated.id;
      } else {
        const created = await tx.user.create({
          data: {
            name: acc.name,
            email: acc.email,
            phoneNumber: acc.phoneNumber,
            phoneVerified: true,
            role: acc.role,
            passwordHash: prehashed.passwordHash,
          },
          select: { id: true },
        });
        userId = created.id;
        txGeneratedCredentials.push({
          key: acc.key,
          userId,
          name: acc.name,
          email: acc.email,
          phoneNumber: acc.phoneNumber,
          role: acc.role,
          password: prehashed.password,
          supportsFeatures: acc.supportsFeatures,
        });
      }
      accountIds.set(acc.key, userId);

      if (acc.accessibilityProfileId) {
        await tx.userAccessibilityProfile.upsert({
          where: { userId_profileId: { userId, profileId: acc.accessibilityProfileId } },
          update: { isPrimary: true },
          create: { userId, profileId: acc.accessibilityProfileId, isPrimary: true },
        });
      }

      if (acc.role === "blind_user") {
        await tx.blindUserProfile.upsert({
          where: { userId },
          update: {
            onboardingCompleted: true,
            emergencyContactName: "[DEMO] Keluarga Pendamping",
            emergencyContactPhone: "089900001003",
          },
          create: {
            userId,
            onboardingCompleted: true,
            emergencyContactName: "[DEMO] Keluarga Pendamping",
            emergencyContactPhone: "089900001003",
          },
        });
      }

      if (acc.volunteer) {
        await tx.volunteerProfile.upsert({
          where: { userId },
          update: {
            verificationStatus: "verified",
            canCompanion: true,
            canMapData: true,
            isActive: true,
            verifiedAt: new Date(),
            ratingAvg: acc.volunteer.ratingAvg,
            totalHelps: acc.volunteer.totalHelps,
            serviceAreaNote: acc.volunteer.serviceAreaNote,
          },
          create: {
            userId,
            verificationStatus: "verified",
            canCompanion: true,
            canMapData: true,
            isActive: true,
            verifiedAt: new Date(),
            ratingAvg: acc.volunteer.ratingAvg,
            totalHelps: acc.volunteer.totalHelps,
            serviceAreaNote: acc.volunteer.serviceAreaNote,
            motivation: "SYNTHETIC [DEMO] verified companion/mapper account",
          },
        });

        await tx.$executeRaw`DELETE FROM volunteer_availability WHERE volunteer_id = ${userId}::uuid`;
        await tx.$executeRaw`
          INSERT INTO volunteer_availability (
            id, volunteer_id, center_point, radius_meters, day_of_week, start_time, end_time, is_active, created_at
          )
          VALUES (
            gen_random_uuid(),
            ${userId}::uuid,
            ST_SetSRID(ST_MakePoint(${acc.volunteer.centerCoord[0]}, ${acc.volunteer.centerCoord[1]}), 4326)::geography,
            ${acc.volunteer.radiusMeters},
            NULL,
            NULL,
            NULL,
            TRUE,
            NOW()
          )
        `;
      }
    }

    // 6. Seed caregiver relationships ONLY between own [DEMO] accounts
    for (const link of DEMO_CAREGIVER_LINKS) {
      const blindUserId = accountIds.get(link.blindUserKey)!;
      const caregiverId = accountIds.get(link.caregiverKey)!;
      await tx.caregiverRelationship.upsert({
        where: { blindUserId_caregiverId: { blindUserId, caregiverId } },
        update: {
          relationshipType: link.relationshipType,
          locationSharingMode: link.locationSharingMode,
        },
        create: {
          blindUserId,
          caregiverId,
          relationshipType: link.relationshipType,
          locationSharingMode: link.locationSharingMode,
        },
      });
    }

    // 7. Pre-commit geometry, endpoint, length, metadata, connectivity, and weight validation inside tx
    const invalidDemoEdges = await tx.$queryRaw<Array<{ id: bigint; reason: string }>>`
      SELECT e.id,
             CASE
               WHEN ST_GeometryType(e.geometry::geometry) <> 'ST_LineString' THEN 'not_linestring'
               WHEN ST_NPoints(e.geometry::geometry) < 2 THEN 'too_few_points'
               WHEN NOT ST_IsValid(e.geometry::geometry) THEN 'invalid_geom'
               WHEN NOT ST_Equals(ST_StartPoint(e.geometry::geometry), s.location::geometry) THEN 'start_mismatch'
               WHEN NOT ST_Equals(ST_EndPoint(e.geometry::geometry), t.location::geometry) THEN 'end_mismatch'
               WHEN e.length_m <= 0 THEN 'non_positive_length'
               WHEN e.surveyed_at IS NOT NULL THEN 'surveyed_at_not_null'
               WHEN e.metadata->>'synthetic' <> 'true' OR e.metadata->>'verifiedSurvey' <> 'false' THEN 'honest_metadata_missing'
               ELSE 'ok'
             END AS reason
      FROM path_edges e
      JOIN path_nodes s ON s.id = e.source_node_id
      JOIN path_nodes t ON t.id = e.target_node_id
      WHERE e.metadata->>'demoFixture' = ${DEMO_TAG}
    `;
    const badEdges = invalidDemoEdges.filter((r) => r.reason !== "ok");
    if (badEdges.length > 0) {
      throw new Error(`Pre-commit edge validation failed: ${JSON.stringify(badEdges)}`);
    }

    // Validate actual profile cost choices & connectivity inside the transaction before commit
    const originNodeId = nodeIds.get("origin")!;
    const destNodeId = nodeIds.get("destination")!;
    const isolatedNodeId = nodeIds.get("isolated")!;
    const transitOriginId = nodeIds.get("transitOrigin")!;
    const transitStopAId = nodeIds.get("transitStopA")!;
    const transitStopBId = nodeIds.get("transitStopB")!;
    const transitDestId = nodeIds.get("transitDestination")!;

    for (const [profileId, expectedBranch] of Object.entries(EXPECTED_LOCAL_PROFILE_BRANCH)) {
      const profile = await tx.accessibilityProfile.findUniqueOrThrow({ where: { id: profileId } });
      const weightConfig = profile.weightConfig as unknown as WeightConfig;
      const costExpr = buildCostExpression(weightConfig, {});
      const degradeExpr = buildDegradePenaltyExpression(weightConfig);

      const edgeSqlText = `
        SELECT e.id::bigint AS id,
               e.source_node_id::bigint AS source,
               e.target_node_id::bigint AS target,
               ${costExpr} AS cost,
               CASE WHEN e.is_one_way THEN -1 ELSE ${costExpr} END AS reverse_cost
        FROM path_edges e
        JOIN path_nodes s ON s.id = e.source_node_id
        JOIN path_nodes t ON t.id = e.target_node_id
        LEFT JOIN (
          SELECT rel.edge_id,
                 MAX(CASE WHEN rel.effect = 'block' THEN 'block' ELSE 'degrade' END) AS max_effect,
                 SUM(CASE WHEN rel.effect = 'degrade' THEN ${degradeExpr} ELSE 0 END) AS penalty
          FROM report_edge_links rel
          JOIN road_reports rr ON rr.id = rel.report_id
          WHERE rr.status = 'active'
          GROUP BY rel.edge_id
        ) r ON r.edge_id = e.id
        WHERE e.status = 'approved'
          AND s.status = 'approved' AND t.status = 'approved'
          AND s.is_operational = TRUE AND t.is_operational = TRUE
          AND e.is_operational = TRUE AND e.length_m > 0
          AND ST_GeometryType(e.geometry::geometry) = 'ST_LineString'
          AND ST_NPoints(e.geometry::geometry) >= 2
          AND ((ST_Length(e.geometry) > 0 AND ST_IsValid(e.geometry::geometry))
            OR (ST_Length(e.geometry) = 0 AND s.floor_level <> t.floor_level))
          AND ST_Equals(ST_StartPoint(e.geometry::geometry), s.location::geometry)
          AND ST_Equals(ST_EndPoint(e.geometry::geometry), t.location::geometry)
      `;

      const pathRows = await tx.$queryRaw<Array<{ edge: bigint }>>(Prisma.sql`
        SELECT d.edge
        FROM pgr_dijkstra(${Prisma.raw(`$$${edgeSqlText}$$`)}, ${originNodeId}::bigint, ${destNodeId}::bigint, directed := true) d
        WHERE d.edge <> -1
      `);
      const chosenEdgeIds = pathRows.map((r) => r.edge.toString());
      const expectedEdgeIds = [
        edgeIds.get(`${expectedBranch}-0`)!.toString(),
        edgeIds.get(`${expectedBranch}-1`)!.toString(),
      ];
      if (JSON.stringify(chosenEdgeIds) !== JSON.stringify(expectedEdgeIds)) {
        throw new Error(
          `Pre-commit routing weight check failed for ${profileId}: expected ${expectedBranch} (${expectedEdgeIds}), got ${chosenEdgeIds}`,
        );
      }

      const isoRows = await tx.$queryRaw<Array<{ edge: bigint }>>(Prisma.sql`
        SELECT d.edge
        FROM pgr_dijkstra(${Prisma.raw(`$$${edgeSqlText}$$`)}, ${originNodeId}::bigint, ${isolatedNodeId}::bigint, directed := true) d
        WHERE d.edge <> -1
      `);
      if (isoRows.length > 0) {
        throw new Error(`Pre-commit isolation check failed: isolated destination reachable for ${profileId}`);
      }

      const fmRows = await tx.$queryRaw<Array<{ edge: bigint }>>(Prisma.sql`
        SELECT d.edge
        FROM pgr_dijkstra(${Prisma.raw(`$$${edgeSqlText}$$`)}, ${transitOriginId}::bigint, ${transitStopAId}::bigint, directed := true) d
        WHERE d.edge <> -1
      `);
      const lmRows = await tx.$queryRaw<Array<{ edge: bigint }>>(Prisma.sql`
        SELECT d.edge
        FROM pgr_dijkstra(${Prisma.raw(`$$${edgeSqlText}$$`)}, ${transitStopBId}::bigint, ${transitDestId}::bigint, directed := true) d
        WHERE d.edge <> -1
      `);
      const gapRows = await tx.$queryRaw<Array<{ edge: bigint }>>(Prisma.sql`
        SELECT d.edge
        FROM pgr_dijkstra(${Prisma.raw(`$$${edgeSqlText}$$`)}, ${transitOriginId}::bigint, ${transitDestId}::bigint, directed := true) d
        WHERE d.edge <> -1
      `);
      if (fmRows.length === 0 || lmRows.length === 0 || gapRows.length > 0) {
        throw new Error(`Pre-commit multimodal corridor check failed for ${profileId}`);
      }
    }

    return {
      devRepairOutcomes,
      buildingIds: Object.fromEntries([...buildingIds].map(([k, v]) => [k, v])),
      nodeIds: Object.fromEntries([...nodeIds].map(([k, v]) => [k, v.toString()])),
      edgeIds: Object.fromEntries([...edgeIds].map(([k, v]) => [k, v.toString()])),
      accountIds: Object.fromEntries([...accountIds].map(([k, v]) => [k, v])),
      generatedCredentials: txGeneratedCredentials,
    };
  }, { maxWait: 20_000, timeout: 60_000 });

  let credsPath: string | null = null;
  if (txResult.generatedCredentials.length > 0) {
    credsPath = opts.credentialsOut ?? `/tmp/unstoppable-qa/demo-credentials-${timestamp}.json`;
    writePrivateJson(
      credsPath,
      {
        createdAt: new Date().toISOString(),
        targetHost,
        targetDb,
        accounts: txResult.generatedCredentials,
      },
      0o600,
    );
  }

  // 8. Post-commit real Route Service verification & manifest generation (no credentials)
  const seniorUserId = txResult.accountIds.senior_wheelchair!;
  const pointOf = (key: string): GeoJsonPoint => {
    const n = DEMO_NODES.find((item) => item.key === key)!;
    return { type: "Point", coordinates: [n.coord[0], n.coord[1]] };
  };

  const localRouteChecks: Record<string, unknown> = {};
  for (const [profile, expectedBranch] of Object.entries(EXPECTED_LOCAL_PROFILE_BRANCH)) {
    const res = await routesSvc.planRoute(seniorUserId, pointOf("origin"), pointOf("destination"), profile);
    const expectedEdgeIds = [
      txResult.edgeIds[`${expectedBranch}-0`]!,
      txResult.edgeIds[`${expectedBranch}-1`]!,
    ];
    if (JSON.stringify(res.edgeIds) !== JSON.stringify(expectedEdgeIds)) {
      throw new Error(`Post-commit Route Service mismatch for ${profile}: got ${res.edgeIds}, expected ${expectedEdgeIds}`);
    }
    localRouteChecks[profile] = {
      expectedBranch,
      edgeIds: res.edgeIds,
      totalDistanceM: res.totalDistanceM,
      estimatedDurationMin: res.estimatedDurationMin,
      vertexCount: res.geometry.coordinates.length,
      surveyedAt: res.dataFreshness.surveyedAt,
    };
  }

  const unreachableCheck = await routesSvc.compareRoutes(
    seniorUserId,
    pointOf("origin"),
    pointOf("isolated"),
    Object.keys(EXPECTED_LOCAL_PROFILE_BRANCH),
  );
  const transitFirstMile = await routesSvc.planRoute(
    seniorUserId,
    pointOf("transitOrigin"),
    pointOf("transitStopA"),
    "wheelchair",
  );
  const transitLastMile = await routesSvc.planRoute(
    seniorUserId,
    pointOf("transitStopB"),
    pointOf("transitDestination"),
    "wheelchair",
  );

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtureTag: DEMO_TAG,
    synthetic: true,
    verifiedSurvey: false,
    targetHost,
    targetDb,
    backupPath,
    restoreCommand: `npx tsx prisma/demo-release.seed.ts --restore=${backupPath} --apply --ack-fixture=${DEMO_TAG}${isLocalHost(targetHost) ? "" : ` --ack-target=${targetHost}`}`,
    devEdgeRepairs: txResult.devRepairOutcomes,
    preservedClosureNodeId: PRESERVED_CLOSURE_NODE_ID.toString(),
    buildings: txResult.buildingIds,
    nodes: txResult.nodeIds,
    edges: txResult.edgeIds,
    accounts: DEMO_ACCOUNTS.map((a) => ({
      key: a.key,
      userId: txResult.accountIds[a.key]!,
      name: a.name,
      role: a.role,
      accessibilityProfileId: a.accessibilityProfileId ?? null,
      supportsFeatures: a.supportsFeatures,
    })),
    localDemo: {
      origin: { nodeKey: "origin", buildingCode: "DEMO-HALTE-SELATAN", point: pointOf("origin") },
      destination: { nodeKey: "destination", buildingCode: "DEMO-PERPUS-LANSIA", point: pointOf("destination") },
      isolatedDestination: {
        nodeKey: "isolated",
        buildingCode: "DEMO-PAVILIUN-TERISOLASI",
        point: pointOf("isolated"),
        unreachableAllProfiles: unreachableCheck.results.every((r) => !r.reachable),
      },
      expectedRoutesByProfile: localRouteChecks,
    },
    multimodalTransitDemo: {
      corridorId: "demo-bus-a",
      routeShortName: "[DEMO] Bus A",
      synthetic: true,
      verifiedFeed: false,
      origin: { nodeKey: "transitOrigin", buildingCode: "DEMO-KORIDOR-ASAL", point: pointOf("transitOrigin") },
      stopA: { stopId: "DEMO-STOP-A", nodeKey: "transitStopA", point: pointOf("transitStopA") },
      stopB: { stopId: "DEMO-STOP-B", nodeKey: "transitStopB", point: pointOf("transitStopB") },
      destination: {
        nodeKey: "transitDestination",
        buildingCode: "DEMO-KORIDOR-TUJUAN",
        point: pointOf("transitDestination"),
      },
      firstMileWheelchair: {
        edgeIds: transitFirstMile.edgeIds,
        totalDistanceM: transitFirstMile.totalDistanceM,
      },
      lastMileWheelchair: {
        edgeIds: transitLastMile.edgeIds,
        totalDistanceM: transitLastMile.totalDistanceM,
      },
    },
  };

  const manifestPath = opts.manifestOut ?? "/tmp/unstoppable-qa/demo-manifest.json";
  writePrivateJson(manifestPath, manifest, 0o600);

  return {
    mode: "applied",
    backupPath,
    manifestPath,
    credentialsPath: credsPath,
    credentialsWritten: txResult.generatedCredentials.length > 0,
    manifest,
  };
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  let output: unknown;
  if (opts.restorePath) {
    output = await restoreFromBackup(opts);
  } else if (opts.cleanup) {
    output = await cleanupDemoDataset(opts);
  } else {
    output = await runDemoRelease(opts);
  }
  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error("[demo-release] Failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        const { prisma } = await import("../src/config/prisma.js");
        await prisma.$disconnect();
      } catch {
        // ignore if prisma was never initialized due to early guard failure
      }
    });
}
