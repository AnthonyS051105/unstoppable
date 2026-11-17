import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEMO_TAG,
  EXPECTED_LOCAL_PROFILE_BRANCH,
  PRESERVED_CLOSURE_NODE_ID,
} from "./demo-release.fixture.js";
import {
  assertApplyGuard,
  cleanupDemoDataset,
  loadDatabaseUrl,
  parseCliArgs,
  restoreFromBackup,
  runDemoRelease,
  type CliOptions,
} from "./demo-release.seed.js";

const dbEnabled = process.env.DEMO_RELEASE_TEST_DB === "1";

function baseOpts(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    apply: false,
    auditOnly: false,
    cleanup: false,
    restorePath: null,
    envFile: null,
    ackFixture: null,
    ackTarget: null,
    backupOut: null,
    manifestOut: null,
    credentialsOut: null,
    rotatePasswords: false,
    skipDevRepair: false,
    ...overrides,
  };
}

describe("demo-release guards and neutral transit fixture (offline unit)", () => {
  it("defaults to dry-run and requires explicit fixture & target acknowledgments for apply", () => {
    const parsedDefault = parseCliArgs([]);
    expect(parsedDefault.apply).toBe(false);
    expect(() => assertApplyGuard(parsedDefault, "prod-db.example.com")).not.toThrow();

    expect(() =>
      assertApplyGuard(baseOpts({ apply: true }), "127.0.0.1"),
    ).toThrow(/--ack-fixture=demo-release-v1/);

    expect(() =>
      assertApplyGuard(
        baseOpts({ apply: true, ackFixture: DEMO_TAG }),
        "aws-0-ap-northeast-2.pooler.supabase.com",
      ),
    ).toThrow(/--ack-target=aws-0-ap-northeast-2\.pooler\.supabase\.com/);

    expect(() =>
      assertApplyGuard(
        baseOpts({
          apply: true,
          ackFixture: DEMO_TAG,
          ackTarget: "aws-0-ap-northeast-2.pooler.supabase.com",
        }),
        "aws-0-ap-northeast-2.pooler.supabase.com",
      ),
    ).not.toThrow();
  });

  it("rejects truncated or malformed DATABASE_URL values from env files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-release-env-"));
    const badEnvPath = path.join(tmpDir, "truncated.env");
    fs.writeFileSync(badEnvPath, "DATABASE_URL='postgresql://user:pass@aws-0.pooler.supabase.>\n", "utf8");
    expect(() => loadDatabaseUrl(badEnvPath)).toThrow(/truncated/);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("provides honest synthetic multimodal transit fixture without claiming GTFS", () => {
    const raw = fs.readFileSync(path.resolve(import.meta.dirname, "demo-release.transit.json"), "utf8");
    const transit = JSON.parse(raw) as {
      fixtureTag: string;
      synthetic: boolean;
      verifiedFeed: boolean;
      disclaimer: string;
      corridors: Array<{
        id: string;
        routeShortName: string;
        scheduleType: string;
        stops: Array<{ stopId: string; name: string; accessibility: { synthetic: boolean; verifiedAt: null } }>;
      }>;
    };
    expect(transit.fixtureTag).toBe(DEMO_TAG);
    expect(transit.synthetic).toBe(true);
    expect(transit.verifiedFeed).toBe(false);
    expect(transit.disclaimer).toContain("Not an actual");
    expect(transit.corridors[0]!.routeShortName).toBe("[DEMO] Bus A");
    expect(transit.corridors[0]!.scheduleType).toBe("synthetic_frequency");
    expect(transit.corridors[0]!.stops.map((s) => s.stopId)).toEqual(["DEMO-STOP-A", "DEMO-STOP-B"]);
    expect(transit.corridors[0]!.stops.every((s) => s.accessibility.synthetic && s.accessibility.verifiedAt === null)).toBe(true);
  });
});

describe.skipIf(!dbEnabled)("demo-release disposable PostGIS integration", () => {
  let tmpDir: string;
  let sentinelBuildingId: string;
  let sentinelUserId: string;
  let sentinelEdgeId: bigint;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "demo-release-local-test-secret";
    const { targetHost } = loadDatabaseUrl(null);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(targetHost)) {
      throw new Error(`Refusing integration test against non-local host: ${targetHost}`);
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-release-it-"));
    const { prisma } = await import("../src/config/prisma.js");

    // Ensure clean starting state for demo rows + test DEV rows 30/31/33 + sentinel
    await prisma.$executeRaw`DELETE FROM path_edges WHERE id IN (30, 31, 33)`;
    await prisma.$executeRaw`DELETE FROM path_nodes WHERE id IN (37, 38, 39, 40, 41)`;
    await prisma.$executeRaw`DELETE FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TAG}`;
    await prisma.$executeRaw`DELETE FROM path_nodes WHERE name LIKE '[DEMO]%'`;
    await prisma.$executeRaw`DELETE FROM buildings WHERE code LIKE 'DEMO-%' OR code = 'SENTINEL-REAL-1'`;
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE '%@demo.unstoppable.local' OR email = 'sentinel-real@example.com'`;

    // 1. Seed unrelated real sentinel rows (must remain untouched across apply/restore/cleanup)
    const [sb] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO buildings (id, name, code, faculty, location, floor_count, has_lift, has_accessible_toilet, surveyed_at, updated_at)
      VALUES (gen_random_uuid(), 'Gedung Sentinel Survei Asli', 'SENTINEL-REAL-1', 'FMIPA', ST_SetSRID(ST_MakePoint(110.36, -7.76), 4326)::geography, 2, true, true, '2026-01-01T00:00:00Z'::timestamptz, NOW())
      RETURNING id::text AS id
    `;
    sentinelBuildingId = sb!.id;

    const [sn1] = await prisma.$queryRaw<Array<{ id: bigint }>>`
      INSERT INTO path_nodes (building_id, floor_level, node_type, name, location, is_operational, status, surveyed_at, updated_at)
      VALUES (${sentinelBuildingId}::uuid, 0, 'gate', 'Sentinel Real Gate', ST_SetSRID(ST_MakePoint(110.36, -7.76), 4326)::geography, true, 'approved', '2026-01-01T00:00:00Z'::timestamptz, NOW())
      RETURNING id
    `;
    const [sn2] = await prisma.$queryRaw<Array<{ id: bigint }>>`
      INSERT INTO path_nodes (building_id, floor_level, node_type, name, location, is_operational, status, surveyed_at, updated_at)
      VALUES (${sentinelBuildingId}::uuid, 0, 'entrance', 'Sentinel Real Entrance', ST_SetSRID(ST_MakePoint(110.3604, -7.76), 4326)::geography, true, 'approved', '2026-01-01T00:00:00Z'::timestamptz, NOW())
      RETURNING id
    `;
    const [se] = await prisma.$queryRaw<Array<{ id: bigint }>>`
      INSERT INTO path_edges (source_node_id, target_node_id, geometry, length_m, surface_type, width_cm, is_operational, status, surveyed_at, updated_at)
      SELECT s.id, t.id, ST_MakeLine(s.location::geometry, t.location::geometry)::geography, ROUND(ST_Distance(s.location, t.location)::numeric, 2), 'paving', 200, true, 'approved', '2026-01-01T00:00:00Z'::timestamptz, NOW()
      FROM path_nodes s, path_nodes t WHERE s.id = ${sn1!.id} AND t.id = ${sn2!.id}
      RETURNING id
    `;
    sentinelEdgeId = se!.id;

    const su = await prisma.user.create({
      data: {
        name: "Sentinel Real User",
        email: "sentinel-real@example.com",
        phoneNumber: "081111111111",
        phoneVerified: true,
        role: "mobility_user",
        passwordHash: "sentinel-hash",
      },
    });
    sentinelUserId = su.id;

    // 2. Seed simulated [DEV] nodes 37/38/40 and malformed edges 30/31/33 matching qa/routing-report.md
    const devNodes: Array<[number, string, number, number, boolean]> = [
      [37, "[DEV] Gerbang Utama FT", 110.3718, -7.7655, true],
      [38, "[DEV] Simpang Taman FT", 110.3721, -7.7655, false],
      [40, "[DEV] Ramp Samping KPFT", 110.3723, -7.7657, true],
    ];
    for (const [id, name, lng, lat, isOp] of devNodes) {
      await prisma.$executeRaw`
        INSERT INTO path_nodes (id, floor_level, node_type, name, location, is_operational, status, surveyed_at, updated_at)
        VALUES (${id}, 0, 'junction', ${name}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${isOp}, 'approved', NULL, NOW())
      `;
    }
    const devEdges: Array<[number, number, number]> = [
      [30, 37, 40],
      [31, 37, 38],
      [33, 37, 38],
    ];
    for (const [id, src, tgt] of devEdges) {
      await prisma.$executeRaw`
        INSERT INTO path_edges (id, source_node_id, target_node_id, geometry, length_m, surface_type, width_cm, slope_percent, has_handrail, is_covered, is_operational, status, surveyed_at, updated_at)
        VALUES (${id}, ${src}, ${tgt}, ST_GeogFromText('SRID=4326;LINESTRING(110.3725 -7.7655, 110.3726 -7.7656)'), 15.62, 'beton', 160, 4.5, true, true, true, 'approved', '2026-10-01T02:40:00Z'::timestamptz, NOW())
      `;
    }
    await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('path_nodes','id'), GREATEST((SELECT MAX(id) FROM path_nodes), 100))`;
    await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('path_edges','id'), GREATEST((SELECT MAX(id) FROM path_edges), 100))`;
  });

  afterAll(async () => {
    const { prisma } = await import("../src/config/prisma.js");
    await cleanupDemoDataset(baseOpts({ apply: true, ackFixture: DEMO_TAG }));
    await prisma.$executeRaw`DELETE FROM path_edges WHERE id IN (30, 31, 33) OR id = ${sentinelEdgeId}`;
    await prisma.$executeRaw`DELETE FROM path_nodes WHERE id IN (37, 38, 40) OR building_id = ${sentinelBuildingId}::uuid`;
    await prisma.$executeRaw`DELETE FROM buildings WHERE id = ${sentinelBuildingId}::uuid`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${sentinelUserId}::uuid`;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("performs zero mutations in default dry-run mode", async () => {
    const res = (await runDemoRelease(baseOpts())) as {
      mode: string;
      devEdgeRepairsPlanned: Array<{ id: string; eligibleForRepair: boolean }>;
    };
    expect(res.mode).toBe("dry-run");
    expect(res.devEdgeRepairsPlanned.map((e) => [e.id, e.eligibleForRepair])).toEqual([
      ["30", true],
      ["31", true],
      ["33", true],
    ]);

    const { prisma } = await import("../src/config/prisma.js");
    const demoCount = await prisma.$queryRaw<Array<{ cnt: number }>>`
      SELECT COUNT(*)::int AS cnt FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TAG}
    `;
    expect(demoCount[0]!.cnt).toBe(0);
  });

  it("applies backup, DEV edge repairs, isolated demo graph, accounts, routes, idempotence, and rollback", async () => {
    const backupPath = path.join(tmpDir, "backup.json");
    const manifestPath = path.join(tmpDir, "manifest.json");
    const credsPath = path.join(tmpDir, "creds.json");

    const applied = (await runDemoRelease(
      baseOpts({
        apply: true,
        ackFixture: DEMO_TAG,
        backupOut: backupPath,
        manifestOut: manifestPath,
        credentialsOut: credsPath,
      }),
    )) as {
      mode: string;
      manifest: {
        devEdgeRepairs: Array<{ id: string; action: string }>;
        localDemo: {
          isolatedDestination: { unreachableAllProfiles: boolean };
          expectedRoutesByProfile: Record<string, { expectedBranch: string; edgeIds: string[]; vertexCount: number }>;
        };
        multimodalTransitDemo: {
          firstMileWheelchair: { edgeIds: string[] };
          lastMileWheelchair: { edgeIds: string[] };
        };
        accounts: Array<{ key: string; userId: string }>;
      };
    };

    expect(applied.mode).toBe("applied");
    expect(applied.manifest.devEdgeRepairs).toHaveLength(3);
    expect(applied.manifest.devEdgeRepairs.every((r) => r.action === "repaired")).toBe(true);
    expect(applied.manifest.localDemo.isolatedDestination.unreachableAllProfiles).toBe(true);

    // File permissions & no credentials in manifest
    expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(credsPath).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(manifestPath, "utf8")).not.toContain("password");

    for (const [profile, expectedBranch] of Object.entries(EXPECTED_LOCAL_PROFILE_BRANCH)) {
      const route = applied.manifest.localDemo.expectedRoutesByProfile[profile]!;
      expect(route.expectedBranch).toBe(expectedBranch);
      expect(route.edgeIds).toHaveLength(2);
      expect(route.vertexCount).toBe(5);
    }

    const { prisma } = await import("../src/config/prisma.js");

    // Node 38 closure preserved
    const [n38] = await prisma.$queryRaw<Array<{ isOperational: boolean }>>`
      SELECT is_operational AS "isOperational" FROM path_nodes WHERE id = ${PRESERVED_CLOSURE_NODE_ID}
    `;
    expect(n38!.isOperational).toBe(false);

    // Repaired DEV edges now endpoint-consistent with synthetic metadata and null surveyed_at
    const repairedCheck = await prisma.$queryRaw<
      Array<{ id: bigint; okStart: boolean; okEnd: boolean; surveyedAt: Date | null; synthetic: string }>
    >`
      SELECT e.id,
             ST_Equals(ST_StartPoint(e.geometry::geometry), s.location::geometry) AS "okStart",
             ST_Equals(ST_EndPoint(e.geometry::geometry), t.location::geometry) AS "okEnd",
             e.surveyed_at AS "surveyedAt",
             e.metadata->>'synthetic' AS synthetic
      FROM path_edges e
      JOIN path_nodes s ON s.id = e.source_node_id
      JOIN path_nodes t ON t.id = e.target_node_id
      WHERE e.id IN (30, 31, 33)
    `;
    for (const row of repairedCheck) {
      expect(row.okStart).toBe(true);
      expect(row.okEnd).toBe(true);
      expect(row.surveyedAt).toBeNull();
      expect(row.synthetic).toBe("true");
    }

    // Real backend services: building catalog, volunteer availability, caregiver dependents, auth login
    const buildingsSvc = await import("../src/modules/buildings/buildings.service.js");
    const buildings = await buildingsSvc.listBuildings();
    const demoBuildings = buildings.filter((b) => b.name.startsWith("[DEMO]"));
    expect(demoBuildings).toHaveLength(5);
    expect(demoBuildings.every((b) => b.accessibilityScore === null && b.surveyedAt === null)).toBe(true);

    const volunteersSvc = await import("../src/modules/volunteers/volunteers.service.js");
    const seniorId = applied.manifest.accounts.find((a) => a.key === "senior_wheelchair")!.userId;
    const availLocal = await volunteersSvc.findAvailable(seniorId, { lng: 110.378, lat: -7.77 });
    expect(availLocal.some((v) => v.name === "[DEMO] Relawan Pendamping & Pemeta")).toBe(true);
    const availStopB = await volunteersSvc.findAvailable(seniorId, { lng: 110.3658, lat: -7.7895 });
    expect(availStopB.some((v) => v.name === "[DEMO] Relawan Pendamping & Pemeta")).toBe(true);

    const usersSvc = await import("../src/modules/users/users.service.js");
    const caregiverId = applied.manifest.accounts.find((a) => a.key === "caregiver")!.userId;
    const dependents = await usersSvc.listDependents(caregiverId);
    expect(dependents).toHaveLength(2);

    const creds = JSON.parse(fs.readFileSync(credsPath, "utf8")) as {
      accounts: Array<{ email: string; password: string }>;
    };
    const authSvc = await import("../src/modules/auth/auth.service.js");
    const loginRes = await authSvc.login({
      email: creds.accounts[0]!.email,
      password: creds.accounts[0]!.password,
    });
    expect(loginRes.accessToken).toBeTruthy();

    // Verify AI destination resolver SQL pattern finds [DEMO] buildings
    const resolvedDest = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM buildings WHERE name ILIKE ${"%Perpustakaan Ramah Lansia%"} LIMIT 1
    `;
    expect(resolvedDest[0]?.name).toBe("[DEMO] Perpustakaan Ramah Lansia");

    // Idempotence check: re-run apply keeps same IDs and skips already-repaired DEV edges
    const rerun = (await runDemoRelease(
      baseOpts({
        apply: true,
        ackFixture: DEMO_TAG,
        backupOut: path.join(tmpDir, "backup-rerun.json"),
        manifestOut: manifestPath,
      }),
    )) as {
      manifest: {
        nodes: Record<string, string>;
        edges: Record<string, string>;
        devEdgeRepairs: Array<{ id: string; action: string; reason?: string }>;
      };
    };
    expect(rerun.manifest.devEdgeRepairs.every((r) => r.action === "skipped" && r.reason === "already_endpoint_consistent")).toBe(true);
    expect(Object.keys(rerun.manifest.edges)).toHaveLength(10);

    // Sentinel untouched
    const [sbCheck] = await prisma.$queryRaw<Array<{ surveyedAt: Date | null }>>`
      SELECT surveyed_at AS "surveyedAt" FROM buildings WHERE id = ${sentinelBuildingId}::uuid
    `;
    expect(sbCheck!.surveyedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");

    // Rollback from backup restores pre-repair DEV edges 30/31/33 and removes created demo rows
    const restored = (await restoreFromBackup(
      baseOpts({
        apply: true,
        ackFixture: DEMO_TAG,
        restorePath: backupPath,
      }),
    )) as { mode: string; restoredEdges: string[]; deletedEdges: string[] };
    expect(restored.mode).toBe("applied-restore");
    expect(restored.restoredEdges).toEqual(["30", "31", "33"]);
    expect(restored.deletedEdges).toHaveLength(10);

    const [edge30AfterRestore] = await prisma.$queryRaw<Array<{ geojson: string }>>`
      SELECT ST_AsGeoJSON(geometry)::text AS geojson FROM path_edges WHERE id = 30
    `;
    expect(edge30AfterRestore!.geojson).toContain("110.3725");

    // Sentinel STILL untouched after restore
    const sentinelUser = await prisma.user.findUnique({ where: { id: sentinelUserId } });
    expect(sentinelUser?.name).toBe("Sentinel Real User");

    // Non-DEV endpoint guard: if node 40 loses [DEV] prefix, edge 30 repair MUST be skipped, never blindly overwritten
    await prisma.$executeRaw`UPDATE path_nodes SET name = 'Real Surveyed Ramp' WHERE id = 40`;
    const dryGuard = (await runDemoRelease(baseOpts())) as {
      devEdgeRepairsPlanned: Array<{ id: string; eligibleForRepair: boolean; skipReason: string | null }>;
    };
    const e30Plan = dryGuard.devEdgeRepairsPlanned.find((e) => e.id === "30")!;
    expect(e30Plan.eligibleForRepair).toBe(false);
    expect(e30Plan.skipReason).toBe("endpoints_not_proven_DEV");
    await prisma.$executeRaw`UPDATE path_nodes SET name = '[DEV] Ramp Samping KPFT' WHERE id = 40`;
  });
});
