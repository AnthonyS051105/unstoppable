import { describe, it, expect, beforeAll } from "vitest";
import { assertFtApplyGuard, seedFtDemo } from "./ft-ugm-demo.seed.js";
import { FT_DEMO_DATA, FT_DEMO_TAG, buildFtNetwork, FT_DEMO_ACCOUNTS } from "./ft-ugm-demo.fixture.js";

it("requires explicit fixture and target acknowledgements for writes", () => {
  expect(() => assertFtApplyGuard([], "remote.example")).not.toThrow();
  expect(() => assertFtApplyGuard(["--apply"], "localhost")).toThrow();
  expect(() => assertFtApplyGuard(["--apply", `--ack-fixture=${FT_DEMO_TAG}`], "remote.example")).toThrow();
  expect(() => assertFtApplyGuard(["--apply", `--ack-fixture=${FT_DEMO_TAG}`, "--ack-target=remote.example"], "remote.example")).not.toThrow();
});
it("contains exactly two senior profiles, two campus OD pairs and connected exact geometries", () => {
  const { nodes, edges } = buildFtNetwork();
  expect(FT_DEMO_ACCOUNTS.filter(a => a.profile).map(a => a.profile)).toEqual(["wheelchair", "blind"]);
  expect(FT_DEMO_DATA.cases).toHaveLength(2);
  const positions = new Map(nodes.map(n => [n.key, n.coord]));
  for (const edge of edges) {
    expect(edge.coordinates[0]).toEqual(positions.get(edge.from));
    expect(edge.coordinates.at(-1)).toEqual(positions.get(edge.to));
    expect(edge.coordinates.length).toBeGreaterThanOrEqual(2);
    for (const [lng, lat] of edge.coordinates) { expect(lng).toBeGreaterThan(110.369); expect(lng).toBeLessThan(110.3791); expect(lat).toBeGreaterThan(-7.7691); expect(lat).toBeLessThan(-7.762); }
  }
  for (const c of FT_DEMO_DATA.cases) {
    expect(edges.filter(e => e.caseKey === c.key && e.stairs)).toHaveLength(1);
    expect(edges.some(e => e.caseKey === c.key && e.branch === "ramp")).toBe(true);
  }
});

describe.skipIf(process.env.FT_DEMO_TEST_DB !== "1")("real PostGIS + pgRouting FT demonstration", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/ft_demo") throw new Error("Integration tests require disposable localhost/ft_demo.");
    await seedFtDemo(["--apply", `--ack-fixture=${FT_DEMO_TAG}`]);
  }, 60_000);
  it("chooses different profile branches in both directions and keeps repeat seeds stable", async () => {
    const { prisma } = await import("../src/config/prisma.js");
    const { planRoute } = await import("../src/modules/routes/routes.service.js");
    const before = await seedFtDemo(["--apply", `--ack-fixture=${FT_DEMO_TAG}`]);
    if (before.mode !== "applied") throw new Error("Expected apply");
    const manifest = before.manifest!;
    for (const c of FT_DEMO_DATA.cases) {
      const point = (coordinates: [number, number]) => ({ type: "Point" as const, coordinates });
      const chair = await planRoute(manifest.users.wheelchair!, point(c.origin), point(c.destination), "wheelchair");
      const blind = await planRoute(manifest.users.blind!, point(c.origin), point(c.destination), "blind");
      const stair = buildFtNetwork().edges.find(e => e.caseKey === c.key && e.stairs)!;
      expect(chair.edgeIds).not.toContain(manifest.edgeIds[stair.key]);
      expect(blind.edgeIds).toContain(manifest.edgeIds[stair.key]);
      expect(chair.edgeIds).not.toEqual(blind.edgeIds);
      expect(chair.dataFreshness?.surveyedAt).toBeNull();
      const reverse = await planRoute(manifest.users.wheelchair!, point(c.destination), point(c.origin), "wheelchair");
      expect(reverse.geometry.coordinates[0]).toEqual(c.destination);
      expect(reverse.geometry.coordinates.at(-1)).toEqual(c.origin);
    }
    const [{ broken }] = await prisma.$queryRaw<{ broken: bigint }[]>`SELECT COUNT(*) AS broken FROM path_edges e JOIN path_nodes s ON s.id=e.source_node_id JOIN path_nodes t ON t.id=e.target_node_id WHERE e.metadata->>'demoFixture'=${FT_DEMO_TAG} AND (ST_Distance(ST_StartPoint(e.geometry::geometry)::geography,s.location)>0.02 OR ST_Distance(ST_EndPoint(e.geometry::geometry)::geography,t.location)>0.02 OR ABS(e.length_m-ST_Length(e.geometry))>0.02)`;
    expect(Number(broken)).toBe(0);
    const after = await seedFtDemo(["--apply", `--ack-fixture=${FT_DEMO_TAG}`]);
    expect(after.manifest?.edgeIds).toEqual(manifest.edgeIds);
    expect(after.manifest?.users).toEqual(manifest.users);
  }, 60_000);
});
