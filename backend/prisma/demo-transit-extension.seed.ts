import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import {
  BASE_DEMO_RELEASE_TAG,
  DEMO_TRANSIT_EXT_BUILDINGS,
  DEMO_TRANSIT_EXT_EDGES,
  DEMO_TRANSIT_EXT_NODES,
  DEMO_TRANSIT_EXT_TAG,
  PRESERVED_CLOSURE_NODE_ID,
  REQUIRED_BASE_DEMO_NODES,
} from "./demo-transit-extension.fixture.js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const COORD_EPS = 1e-6;

export interface ExtCliOptions {
  apply: boolean;
  auditOnly: boolean;
  cleanup: boolean;
  restorePath: string | null;
  envFile: string | null;
  ackFixture: string | null;
  ackTarget: string | null;
  backupOut: string | null;
  manifestOut: string | null;
}

export interface ExtBackupPayload {
  schemaVersion: 1;
  createdAt: string;
  fixtureTag: string;
  targetHost: string;
  targetDb: string;
  preservedNode38: {
    id: string;
    name: string | null;
    isOperational: boolean;
    status: string;
  } | null;
  preExistingExt: {
    buildingIds: string[];
    nodeIds: string[];
    edgeIds: string[];
  };
}

function stripSurroundingQuotes(raw: string): string {
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

export function assertExtApplyGuard(opts: ExtCliOptions, targetHost: string): void {
  if (!opts.apply) return;
  if (opts.ackFixture !== DEMO_TRANSIT_EXT_TAG) {
    throw new Error(`--apply requires --ack-fixture=${DEMO_TRANSIT_EXT_TAG}`);
  }
  if (!isLocalHost(targetHost) && opts.ackTarget !== targetHost) {
    throw new Error(
      `Non-local target '${targetHost}' requires explicit --ack-target=${targetHost} alongside --apply.`,
    );
  }
}

export function parseExtCliArgs(argv: string[]): ExtCliOptions {
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
  };
}

function writePrivateJson(filePath: string, data: unknown, mode = 0o600): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode });
  fs.chmodSync(filePath, mode);
}

function toLineStringWkt(coords: readonly (readonly [number, number])[]): string {
  return `SRID=4326;LINESTRING(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(",")})`;
}

async function getRuntimeDeps() {
  const [{ prisma }, routesSvc] = await Promise.all([
    import("../src/config/prisma.js"),
    import("../src/modules/routes/routes.service.js"),
  ]);
  return { prisma, routesSvc };
}

export async function auditExtDatabase(targetHost: string, targetDb: string) {
  const { prisma } = await getRuntimeDeps();
  const [node38] = await prisma.$queryRaw<
    Array<{ id: bigint; name: string | null; isOperational: boolean; status: string }>
  >`SELECT id, name, is_operational AS "isOperational", status FROM path_nodes WHERE id = ${PRESERVED_CLOSURE_NODE_ID}`;

  const baseNodes = await prisma.$queryRaw<
    Array<{ id: bigint; name: string; lng: number; lat: number; status: string; isOperational: boolean }>
  >`
    SELECT id, name, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat, status, is_operational AS "isOperational"
    FROM path_nodes
    WHERE name = ANY(${REQUIRED_BASE_DEMO_NODES.map((n) => n.name)})
    ORDER BY id ASC
  `;

  const existingBuildings = await prisma.$queryRaw<Array<{ id: string; code: string | null; name: string }>>`
    SELECT id::text, code, name
    FROM buildings
    WHERE code = ANY(${DEMO_TRANSIT_EXT_BUILDINGS.map((b) => b.code)})
    ORDER BY code
  `;
  const existingNodes = await prisma.$queryRaw<Array<{ id: bigint; name: string | null }>>`
    SELECT id, name
    FROM path_nodes
    WHERE name = ANY(${DEMO_TRANSIT_EXT_NODES.map((n) => n.name)})
    ORDER BY id
  `;
  const existingEdges = await prisma.$queryRaw<Array<{ id: bigint; edgeKey: string | null }>>`
    SELECT id, metadata->>'edgeKey' AS "edgeKey"
    FROM path_edges
    WHERE metadata->>'demoFixture' = ${DEMO_TRANSIT_EXT_TAG}
    ORDER BY id
  `;
  const [baseDemoEdgeCount] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM path_edges WHERE metadata->>'demoFixture' = ${BASE_DEMO_RELEASE_TAG}
  `;

  return {
    targetHost,
    targetDb,
    preservedNode38: node38
      ? { id: node38.id.toString(), name: node38.name, isOperational: node38.isOperational, status: node38.status }
      : null,
    baseDemoEdgeCount: baseDemoEdgeCount?.count ?? 0,
    requiredBaseNodes: REQUIRED_BASE_DEMO_NODES.map((req) => {
      const found = baseNodes.find((b) => b.name === req.name);
      const coordMatch = found
        ? Math.abs(found.lng - req.expectedCoord[0]) <= COORD_EPS &&
          Math.abs(found.lat - req.expectedCoord[1]) <= COORD_EPS
        : false;
      return {
        key: req.key,
        name: req.name,
        foundId: found ? found.id.toString() : null,
        coordMatch,
        operational: Boolean(found?.isOperational && found.status === "approved"),
      };
    }),
    existingExt: {
      buildingIds: existingBuildings.map((b) => b.id),
      nodeIds: existingNodes.map((n) => n.id.toString()),
      edgeIds: existingEdges.map((e) => e.id.toString()),
    },
  };
}

export async function restoreExtFromBackup(opts: ExtCliOptions) {
  if (!opts.restorePath) throw new Error("--restore=<path> is required");
  const { targetHost } = loadDatabaseUrl(opts.envFile);
  assertExtApplyGuard(opts, targetHost);
  const raw = fs.readFileSync(opts.restorePath, "utf8");
  const backup = JSON.parse(raw) as ExtBackupPayload;
  if (backup.schemaVersion !== 1 || backup.fixtureTag !== DEMO_TRANSIT_EXT_TAG) {
    throw new Error("Invalid backup file schemaVersion or fixtureTag");
  }

  if (!opts.apply) {
    return {
      mode: "dry-run-restore",
      backupPath: opts.restorePath,
      wouldPreserveExtIds: backup.preExistingExt,
      wouldRemoveExtCreatedAfterBackup: true,
    };
  }

  const { prisma } = await getRuntimeDeps();
  const result = await prisma.$transaction(
    async (tx) => {
      const keepEdges = new Set(backup.preExistingExt.edgeIds);
      const keepNodes = new Set(backup.preExistingExt.nodeIds);
      const keepBuildings = new Set(backup.preExistingExt.buildingIds);

      const currentEdges = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TRANSIT_EXT_TAG}
      `;
      const deletedEdges: string[] = [];
      for (const row of currentEdges) {
        if (!keepEdges.has(row.id.toString())) {
          await tx.$executeRaw`DELETE FROM path_edges WHERE id = ${row.id}`;
          deletedEdges.push(row.id.toString());
        }
      }

      const currentNodes = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM path_nodes WHERE name = ANY(${DEMO_TRANSIT_EXT_NODES.map((n) => n.name)})
      `;
      const deletedNodes: string[] = [];
      for (const row of currentNodes) {
        if (!keepNodes.has(row.id.toString())) {
          const del = await tx.$executeRaw`
            DELETE FROM path_nodes n
            WHERE n.id = ${row.id}
              AND NOT EXISTS (SELECT 1 FROM path_edges e WHERE e.source_node_id = n.id OR e.target_node_id = n.id)
          `;
          if (del === 1) deletedNodes.push(row.id.toString());
        }
      }

      const currentBuildings = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM buildings WHERE code = ANY(${DEMO_TRANSIT_EXT_BUILDINGS.map((b) => b.code)})
      `;
      const deletedBuildings: string[] = [];
      for (const row of currentBuildings) {
        if (!keepBuildings.has(row.id)) {
          await tx.$executeRaw`DELETE FROM buildings WHERE id = ${row.id}::uuid`;
          deletedBuildings.push(row.id);
        }
      }

      return { deletedEdges, deletedNodes, deletedBuildings };
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  return { mode: "applied-restore", backupPath: opts.restorePath, ...result };
}

export async function cleanupExtDataset(opts: ExtCliOptions) {
  const { targetHost, targetDb } = loadDatabaseUrl(opts.envFile);
  assertExtApplyGuard(opts, targetHost);
  const audit = await auditExtDatabase(targetHost, targetDb);
  if (!opts.apply) {
    return {
      mode: "dry-run-cleanup",
      wouldDeleteEdges: audit.existingExt.edgeIds,
      wouldDeleteNodesIfUnreferenced: audit.existingExt.nodeIds,
      wouldDeleteBuildings: audit.existingExt.buildingIds,
    };
  }

  const { prisma } = await getRuntimeDeps();
  const res = await prisma.$transaction(
    async (tx) => {
      const delEdges = await tx.$executeRaw`DELETE FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TRANSIT_EXT_TAG}`;
      const delNodes = await tx.$executeRaw`
        DELETE FROM path_nodes n
        WHERE n.name = ANY(${DEMO_TRANSIT_EXT_NODES.map((x) => x.name)})
          AND NOT EXISTS (SELECT 1 FROM path_edges e WHERE e.source_node_id = n.id OR e.target_node_id = n.id)
      `;
      const delBuildings = await tx.$executeRaw`
        DELETE FROM buildings WHERE code = ANY(${DEMO_TRANSIT_EXT_BUILDINGS.map((b) => b.code)})
      `;
      return { delEdges, delNodes, delBuildings };
    },
    { maxWait: 20_000, timeout: 60_000 },
  );
  return { mode: "applied-cleanup", ...res };
}

export async function runDemoTransitExtension(opts: ExtCliOptions) {
  const { targetHost, targetDb } = loadDatabaseUrl(opts.envFile);
  assertExtApplyGuard(opts, targetHost);

  const audit = await auditExtDatabase(targetHost, targetDb);
  if (opts.auditOnly) {
    return { mode: "audit", audit };
  }

  for (const base of audit.requiredBaseNodes) {
    if (!base.foundId || !base.coordMatch || !base.operational) {
      throw new Error(
        `Required base demo node '${base.name}' is missing or mismatched (run demo-release.seed.ts first). Details: ${JSON.stringify(base)}`,
      );
    }
  }

  if (!opts.apply) {
    return {
      mode: "dry-run",
      targetHost,
      targetDb,
      preservedNode38: audit.preservedNode38,
      baseDemoEdgeCount: audit.baseDemoEdgeCount,
      requiredBaseNodes: audit.requiredBaseNodes,
      extBuildingsPlanned: DEMO_TRANSIT_EXT_BUILDINGS.map((b) => ({ code: b.code, name: b.name })),
      extNodesPlanned: DEMO_TRANSIT_EXT_NODES.map((n) => ({ key: n.key, name: n.name, coord: n.coord })),
      extEdgesPlanned: DEMO_TRANSIT_EXT_EDGES.map((e) => ({ key: e.key, branch: e.branch, from: e.fromKey, to: e.toKey })),
      existingExtFound: audit.existingExt,
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = opts.backupOut ?? `/tmp/unstoppable-qa/demo-transit-ext-backup-${timestamp}.json`;
  const backupPayload: ExtBackupPayload = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    fixtureTag: DEMO_TRANSIT_EXT_TAG,
    targetHost,
    targetDb,
    preservedNode38: audit.preservedNode38,
    preExistingExt: audit.existingExt,
  };
  writePrivateJson(backupPath, backupPayload, 0o600);

  const { prisma, routesSvc } = await getRuntimeDeps();
  const txResult = await prisma.$transaction(
    async (tx) => {
      const nodeIds = new Map<string, bigint>();
      for (const base of audit.requiredBaseNodes) {
        nodeIds.set(base.key, BigInt(base.foundId!));
      }

      const buildingIds = new Map<string, string>();
      for (const b of DEMO_TRANSIT_EXT_BUILDINGS) {
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

      for (const n of DEMO_TRANSIT_EXT_NODES) {
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
              is_operational, operational_note, status, surveyed_at, updated_at
            )
            VALUES (
              ${bId}::uuid,
              ${n.floorLevel ?? 0},
              ${n.nodeType},
              ${n.name},
              ST_SetSRID(ST_MakePoint(${n.coord[0]}, ${n.coord[1]}), 4326)::geography,
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

      const edgeIds = new Map<string, bigint>();
      for (const e of DEMO_TRANSIT_EXT_EDGES) {
        const sourceId = nodeIds.get(e.fromKey);
        const targetId = nodeIds.get(e.toKey);
        if (!sourceId || !targetId) {
          throw new Error(`Missing node mapping for extension edge '${e.key}' (${e.fromKey} -> ${e.toKey})`);
        }
        const wkt = toLineStringWkt(e.coordinates);
        const metadata = {
          demoFixture: DEMO_TRANSIT_EXT_TAG,
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
              (SELECT id FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TRANSIT_EXT_TAG} AND metadata->>'edgeKey' = ${e.key} LIMIT 1),
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

      if (audit.preservedNode38) {
        const [n38After] = await tx.$queryRaw<Array<{ isOperational: boolean }>>`
          SELECT is_operational AS "isOperational" FROM path_nodes WHERE id = ${PRESERVED_CLOSURE_NODE_ID}
        `;
        if (n38After && n38After.isOperational !== audit.preservedNode38.isOperational) {
          throw new Error("Safety invariant violated: node 38 operational state changed");
        }
      }

      return {
        buildings: Object.fromEntries(buildingIds.entries()),
        nodes: Object.fromEntries([...nodeIds.entries()].map(([k, v]) => [k, v.toString()])),
        edges: Object.fromEntries([...edgeIds.entries()].map(([k, v]) => [k, v.toString()])),
      };
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  // Verify real PostGIS routing on newly added transfer & last-mile connectors using demo wheelchair user if present
  let routeVerification: Record<string, unknown> = { skipped: "demo_senior_wheelchair_not_found" };
  const wheelchairUser = await prisma.user.findUnique({
    where: { email: "demo-senior-wheelchair@demo.unstoppable.local" },
    select: { id: true },
  });
  if (wheelchairUser) {
    const transferWalk = await routesSvc.planRoute(
      wheelchairUser.id,
      { type: "Point", coordinates: [110.3658, -7.7895] },
      { type: "Point", coordinates: [110.3662, -7.7895] },
      "wheelchair",
      false,
    );
    const accessibleLastMile = await routesSvc.planRoute(
      wheelchairUser.id,
      { type: "Point", coordinates: [110.3879, -7.7895] },
      { type: "Point", coordinates: [110.3885, -7.7896] },
      "wheelchair",
      false,
    );
    let stairsLastMileBlocked = false;
    try {
      await routesSvc.planRoute(
        wheelchairUser.id,
        { type: "Point", coordinates: [110.3881, -7.7901] },
        { type: "Point", coordinates: [110.3885, -7.7896] },
        "wheelchair",
        false,
      );
    } catch {
      stairsLastMileBlocked = true;
    }
    const stairsLastMileLowVision = await routesSvc.planRoute(
      wheelchairUser.id,
      { type: "Point", coordinates: [110.3881, -7.7901] },
      { type: "Point", coordinates: [110.3885, -7.7896] },
      "low_vision",
      false,
    );
    routeVerification = {
      transferWalkEdgeIds: transferWalk.edgeIds,
      transferWalkDistanceM: transferWalk.totalDistanceM,
      accessibleLastMileEdgeIds: accessibleLastMile.edgeIds,
      accessibleLastMileDistanceM: accessibleLastMile.totalDistanceM,
      stairsLastMileBlockedForWheelchair: stairsLastMileBlocked,
      stairsLastMileLowVisionEdgeIds: stairsLastMileLowVision.edgeIds,
    };
  }

  const manifestPath = opts.manifestOut ?? `/tmp/unstoppable-qa/demo-transit-ext-manifest.json`;
  const manifest = {
    schemaVersion: 1,
    appliedAt: new Date().toISOString(),
    fixtureTag: DEMO_TRANSIT_EXT_TAG,
    synthetic: true,
    verifiedSurvey: false,
    targetHost,
    targetDb,
    backupPath,
    records: txResult,
    routeVerification,
  };
  writePrivateJson(manifestPath, manifest, 0o600);

  return {
    mode: "applied",
    targetHost,
    targetDb,
    backupPath,
    manifestPath,
    records: txResult,
    routeVerification,
  };
}

async function main() {
  const opts = parseExtCliArgs(process.argv.slice(2));
  let result: unknown;
  if (opts.restorePath) {
    result = await restoreExtFromBackup(opts);
  } else if (opts.cleanup) {
    result = await cleanupExtDataset(opts);
  } else {
    result = await runDemoTransitExtension(opts);
  }
  console.log(JSON.stringify(result, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        const { prisma } = await import("../src/config/prisma.js");
        await prisma.$disconnect();
      } catch {
        // ignore if prisma was never loaded
      }
    });
}
