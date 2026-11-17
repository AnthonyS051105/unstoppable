import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_TAG } from "./demo-release.fixture.js";
import { runDemoRelease } from "./demo-release.seed.js";
import {
  DEMO_TRANSIT_EXT_BUILDINGS,
  DEMO_TRANSIT_EXT_EDGES,
  DEMO_TRANSIT_EXT_NODES,
  DEMO_TRANSIT_EXT_TAG,
  PRESERVED_CLOSURE_NODE_ID,
} from "./demo-transit-extension.fixture.js";
import {
  assertExtApplyGuard,
  cleanupExtDataset,
  loadDatabaseUrl,
  parseExtCliArgs,
  restoreExtFromBackup,
  runDemoTransitExtension,
  type ExtCliOptions,
} from "./demo-transit-extension.seed.js";

const dbEnabled = process.env.DEMO_RELEASE_TEST_DB === "1";

function baseOpts(overrides: Partial<ExtCliOptions> = {}): ExtCliOptions {
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
    ...overrides,
  };
}

describe("demo-transit-extension guards (offline unit)", () => {
  it("defaults to dry-run and requires explicit fixture & target acknowledgments for apply", () => {
    const parsedDefault = parseExtCliArgs([]);
    expect(parsedDefault.apply).toBe(false);
    expect(() => assertExtApplyGuard(parsedDefault, "prod-db.example.com")).not.toThrow();

    expect(() => assertExtApplyGuard(baseOpts({ apply: true }), "127.0.0.1")).toThrow(
      /--ack-fixture=demo-transit-ext-v1/,
    );
    expect(() =>
      assertExtApplyGuard(
        baseOpts({ apply: true, ackFixture: DEMO_TRANSIT_EXT_TAG }),
        "aws-0-ap-northeast-2.pooler.supabase.com",
      ),
    ).toThrow(/--ack-target=aws-0-ap-northeast-2\.pooler\.supabase\.com/);
    expect(() =>
      assertExtApplyGuard(
        baseOpts({
          apply: true,
          ackFixture: DEMO_TRANSIT_EXT_TAG,
          ackTarget: "aws-0-ap-northeast-2.pooler.supabase.com",
        }),
        "aws-0-ap-northeast-2.pooler.supabase.com",
      ),
    ).not.toThrow();
  });

  it("rejects truncated DATABASE_URL from env files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-transit-ext-env-"));
    const badEnv = path.join(tmpDir, "bad.env");
    fs.writeFileSync(badEnv, "DATABASE_URL='postgresql://u:p@host.>'\n", "utf8");
    expect(() => loadDatabaseUrl(badEnv)).toThrow(/truncated/);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe.skipIf(!dbEnabled)("demo-transit-extension + multimodal PostGIS integration", () => {
  let tmpDir: string;
  let sentinelBuildingId: string;
  let sentinelUserId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "demo-transit-ext-test-secret";
    const { targetHost } = loadDatabaseUrl(null);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(targetHost)) {
      throw new Error(`Refusing integration test against non-local host: ${targetHost}`);
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-transit-ext-it-"));
    const { prisma } = await import("../src/config/prisma.js");

    // Ensure clean base demo state + sentinel non-demo rows + node 38
    await prisma.$executeRaw`DELETE FROM path_edges WHERE metadata->>'demoFixture' IN (${DEMO_TAG}, ${DEMO_TRANSIT_EXT_TAG})`;
    await prisma.$executeRaw`DELETE FROM path_nodes WHERE name LIKE '[DEMO]%' OR id IN (37, 38, 40)`;
    await prisma.$executeRaw`DELETE FROM buildings WHERE code = ANY(${["DEMO-HALTE-SELATAN", "DEMO-PERPUS-LANSIA", "DEMO-PAVILIUN-TERISOLASI", "DEMO-KORIDOR-ASAL", "DEMO-KORIDOR-TUJUAN", "DEMO-KLINIK-TIMUR"]})`;
    await prisma.$executeRaw`
      INSERT INTO path_nodes (id, node_type, name, location, is_operational, status, surveyed_at, updated_at)
      VALUES (
        ${PRESERVED_CLOSURE_NODE_ID},
        'junction',
        '[DEV] Simpang Taman FT',
        ST_SetSRID(ST_MakePoint(110.3721, -7.7655), 4326)::geography,
        FALSE,
        'approved',
        '2026-09-05T00:00:00Z'::timestamptz,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET is_operational = FALSE, status = 'approved'
    `;

    const [b] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO buildings (id, name, code, faculty, location, floor_count, has_lift, has_accessible_toilet, surveyed_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'Gedung Sentinel Integrasi',
        'SENTINEL-EXT-TEST',
        'Fakultas Teknik',
        ST_SetSRID(ST_MakePoint(110.41, -7.82), 4326)::geography,
        2, TRUE, TRUE, '2026-09-05T00:00:00Z'::timestamptz, NOW()
      )
      RETURNING id::text AS id
    `;
    sentinelBuildingId = b!.id;

    const u = await prisma.user.create({
      data: {
        name: "Sentinel Real User Ext",
        email: "sentinel-ext@example.org",
        phoneNumber: "08998877665",
        role: "mobility_user",
        passwordHash: "hash",
        phoneVerified: true,
      },
      select: { id: true },
    });
    sentinelUserId = u.id;

    // Seed base demo-release-v1
    await runDemoRelease({
      apply: true,
      auditOnly: false,
      cleanup: false,
      restorePath: null,
      envFile: null,
      ackFixture: DEMO_TAG,
      ackTarget: null,
      backupOut: path.join(tmpDir, "base-backup.json"),
      manifestOut: path.join(tmpDir, "base-manifest.json"),
      credentialsOut: path.join(tmpDir, "base-creds.json"),
      rotatePasswords: false,
      skipDevRepair: true,
    });
  }, 60_000);

  afterAll(async () => {
    const { prisma } = await import("../src/config/prisma.js");
    await cleanupExtDataset(baseOpts({ apply: true, ackFixture: DEMO_TRANSIT_EXT_TAG }));
    await prisma.$executeRaw`DELETE FROM path_edges WHERE metadata->>'demoFixture' = ${DEMO_TAG}`;
    await prisma.$executeRaw`DELETE FROM path_nodes WHERE name LIKE '[DEMO]%' OR id = ${PRESERVED_CLOSURE_NODE_ID}`;
    await prisma.$executeRaw`DELETE FROM buildings WHERE id = ${sentinelBuildingId}::uuid OR code = ANY(${DEMO_TRANSIT_EXT_BUILDINGS.map((b) => b.code)})`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${sentinelUserId}::uuid OR email LIKE 'demo-%@demo.unstoppable.local'`;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("applies idempotently, drives real pgRouting profile-aware multimodal choices, and rolls back cleanly", async () => {
    const { prisma } = await import("../src/config/prisma.js");
    const { recommendMultimodal, defaultTransitDemoDependencies } = await import(
      "../src/modules/transit-demo/transit-demo.service.js"
    );

    const backupOut = path.join(tmpDir, "ext-backup.json");
    const manifestOut = path.join(tmpDir, "ext-manifest.json");

    // 1. Apply extension
    const apply1 = (await runDemoTransitExtension(
      baseOpts({ apply: true, ackFixture: DEMO_TRANSIT_EXT_TAG, backupOut, manifestOut }),
    )) as { mode: string; records: { edges: Record<string, string> } };
    expect(apply1.mode).toBe("applied");
    expect(Object.keys(apply1.records.edges)).toHaveLength(DEMO_TRANSIT_EXT_EDGES.length);

    // 2. Idempotent second apply reuses same edge IDs
    const apply2 = (await runDemoTransitExtension(
      baseOpts({
        apply: true,
        ackFixture: DEMO_TRANSIT_EXT_TAG,
        backupOut: path.join(tmpDir, "ext-backup-2.json"),
        manifestOut,
      }),
    )) as { records: { edges: Record<string, string> } };
    expect(apply2.records.edges).toEqual(apply1.records.edges);

    // 3. Real DB multimodal recommendation checks
    const wheelchairUser = await prisma.user.findUniqueOrThrow({
      where: { email: "demo-senior-wheelchair@demo.unstoppable.local" },
      select: { id: true },
    });
    const fixedNow = Date.parse("2026-11-17T08:55:00+07:00");
    const depMorning = "2026-11-17T09:00:00+07:00";

    // 3a. Short accessible walk
    const shortRes = await recommendMultimodal(
      wheelchairUser.id,
      {
        origin: { type: "Point", coordinates: [110.378, -7.77] },
        destination: { type: "Point", coordinates: [110.3787, -7.77] },
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: depMorning,
      },
      defaultTransitDemoDependencies,
      fixedNow,
    );
    expect(shortRes.recommended.kind).toBe("direct_walk");

    // 3b. Long 0-transfer transit
    const directBusRes = await recommendMultimodal(
      wheelchairUser.id,
      {
        origin: { type: "Point", coordinates: [110.378, -7.752] },
        destination: { type: "Point", coordinates: [110.3665, -7.7896] },
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: depMorning,
      },
      defaultTransitDemoDependencies,
      fixedNow,
    );
    expect(directBusRes.recommended.kind).toBe("transit_0_transfer");
    expect(directBusRes.recommended.previewWalkRoute?.edgeIds.length).toBeGreaterThan(0);

    // 3c. Long 1-transfer OD switches by accessibility profile in real PostGIS DB
    const wcKlinik = await recommendMultimodal(
      wheelchairUser.id,
      {
        origin: { type: "Point", coordinates: [110.378, -7.752] },
        destination: { type: "Point", coordinates: [110.3885, -7.7896] },
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: depMorning,
      },
      defaultTransitDemoDependencies,
      fixedNow,
    );
    expect(wcKlinik.recommended.kind).toBe("transit_1_transfer");

    const lvKlinik = await recommendMultimodal(
      wheelchairUser.id,
      {
        origin: { type: "Point", coordinates: [110.378, -7.752] },
        destination: { type: "Point", coordinates: [110.3885, -7.7896] },
        profileId: "low_vision",
        demoContext: true,
        requestedDepartureIso: depMorning,
      },
      defaultTransitDemoDependencies,
      fixedNow,
    );
    expect(lvKlinik.recommended.id).toBe("transit-0-demo-angkot-c");

    // 3d. Exceeding walk tolerance or isolated destination recommends verified companion
    const isolatedRes = await recommendMultimodal(
      wheelchairUser.id,
      {
        origin: { type: "Point", coordinates: [110.378, -7.77] },
        destination: { type: "Point", coordinates: [110.3804, -7.77] },
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: depMorning,
      },
      defaultTransitDemoDependencies,
      fixedNow,
    );
    expect(isolatedRes.recommended.kind).toBe("companion_fallback");
    expect(isolatedRes.companionRecommendation.verifiedVolunteers[0]?.name).toContain("[DEMO] Relawan");

    // 3e. Non-demo area disables demo transit cleanly
    const nonDemoRes = await recommendMultimodal(
      wheelchairUser.id,
      {
        origin: { type: "Point", coordinates: [110.41, -7.82] },
        destination: { type: "Point", coordinates: [110.415, -7.822] },
        profileId: "wheelchair",
        demoContext: true,
        requestedDepartureIso: depMorning,
      },
      defaultTransitDemoDependencies,
      fixedNow,
    );
    expect(nonDemoRes.providerStatus.active).toBe(false);
    expect(nonDemoRes.providerStatus.reason).toBe("outside_demo_area");

    // 4. Verify rollback restores cleanly without touching base demo-release-v1 or sentinel rows or node 38
    const restoreRes = (await restoreExtFromBackup(
      baseOpts({ apply: true, ackFixture: DEMO_TRANSIT_EXT_TAG, restorePath: backupOut }),
    )) as { deletedEdges: string[]; deletedNodes: string[]; deletedBuildings: string[] };
    expect(restoreRes.deletedEdges).toHaveLength(DEMO_TRANSIT_EXT_EDGES.length);
    expect(restoreRes.deletedNodes).toHaveLength(DEMO_TRANSIT_EXT_NODES.length);
    expect(restoreRes.deletedBuildings).toHaveLength(DEMO_TRANSIT_EXT_BUILDINGS.length);

    const [sentinelB] = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM buildings WHERE id = ${sentinelBuildingId}::uuid
    `;
    expect(sentinelB?.id).toBe(sentinelBuildingId);

    const [n38] = await prisma.$queryRaw<Array<{ isOperational: boolean }>>`
      SELECT is_operational AS "isOperational" FROM path_nodes WHERE id = ${PRESERVED_CLOSURE_NODE_ID}
    `;
    expect(n38?.isOperational).toBe(false);
  }, 60_000);
});
