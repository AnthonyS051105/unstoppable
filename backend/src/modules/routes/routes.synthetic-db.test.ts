import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma.js';
import { seedSyntheticRouting } from '../../../prisma/routing-synthetic.dev.seed.js';
import { SYNTHETIC_TAG, syntheticNodes } from '../../../prisma/routing-synthetic.fixture.js';
import { compareRoutes, planRoute } from './routes.service.js';
import { buildCostExpression } from './weight-builder.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { GeoJsonPoint, WeightConfig } from './routes.types.js';
const enabled = process.env.ROUTING_SYNTHETIC_LOCAL === '1';
const point = (key: string): GeoJsonPoint => ({type:'Point',coordinates:[...syntheticNodes.find(n=>n.key===key)!.coord]});
const user = '00000000-0000-0000-0000-000000000001';
let fixture: Awaited<ReturnType<typeof seedSyntheticRouting>>;
const expected = { wheelchair: 'ramp', crutches: 'covered', low_vision: 'stairs', blind: 'guided' };
describe.skipIf(!enabled)('local disposable PostGIS + pgRouting synthetic survey', () => {
  beforeEach(async () => { fixture = await seedSyntheticRouting(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('uses real seeded profile costs to choose four distinct physical branches', async () => {
    const results = [];
    for (const [profile, branch] of Object.entries(expected)) {
      const route = await planRoute(user,point('origin'),point('destination'),profile);
      expect(route.edgeIds).toEqual(fixture.edges.get(branch)!.map(String));
      expect(route.geometry.coordinates).toEqual([point('origin').coordinates,point(branch).coordinates,point('destination').coordinates]);
      const cfg = (await prisma.accessibilityProfile.findUniqueOrThrow({where:{id:profile}})).weightConfig as unknown as WeightConfig;
      // Evaluate the SAME SQL cost expression used in production, not a test copy.
      const costs = await prisma.$queryRaw<{branch:string;cost:number}[]>(Prisma.sql`
        SELECT e.metadata->>'branch' AS branch, SUM(CASE WHEN c.cost < 0 THEN 1e9 ELSE c.cost END)::float AS cost
        FROM path_edges e CROSS JOIN LATERAL (SELECT 0 AS penalty, '' AS max_effect) r
        CROSS JOIN LATERAL (SELECT ${Prisma.raw(buildCostExpression(cfg,{}))} AS cost) c
        WHERE e.metadata->>'syntheticFixture' = ${SYNTHETIC_TAG} GROUP BY e.metadata->>'branch' ORDER BY cost`);
      expect(costs[0]!.branch).toBe(branch);
      results.push({profile,branch,distance:route.totalDistanceM,costs});
    }
    console.log('SYNTHETIC profile results',JSON.stringify(results));
    expect(new Set(results.map(r=>r.branch)).size).toBe(4);
  });
  it('excludes the production defect: a cheap edge whose geometry is unrelated to its node IDs', async () => {
    const [bad] = await prisma.$queryRaw<{id:bigint}[]>`
      INSERT INTO path_edges (source_node_id,target_node_id,geometry,length_m,surface_type,width_cm,slope_percent,is_operational,status,metadata,updated_at)
      VALUES (${fixture.nodes.get('origin')!},${fixture.nodes.get('destination')!},ST_GeogFromText('LINESTRING(110.4005 -7.8,110.4006 -7.8001)'),1,'beton',200,0,TRUE,'approved',${JSON.stringify({syntheticFixture:SYNTHETIC_TAG,corrupt:true})}::jsonb,NOW()) RETURNING id`;
    const route = await planRoute(user,point('origin'),point('destination'),'wheelchair');
    expect(route.edgeIds).not.toContain(String(bad!.id));
    expect(route.edgeIds).toEqual(fixture.edges.get('ramp')!.map(String));
  });
  it('does not route through a closed or unapproved intermediate node', async () => {
    await prisma.$executeRaw`UPDATE path_nodes SET is_operational=FALSE WHERE id=${fixture.nodes.get('ramp')!}`;
    const route = await planRoute(user,point('origin'),point('destination'),'wheelchair');
    expect(route.edgeIds).toEqual(fixture.edges.get('covered')!.map(String));
    await prisma.$executeRaw`UPDATE path_nodes SET is_operational=TRUE,status='draft' WHERE id=${fixture.nodes.get('ramp')!}`;
    const draft = await planRoute(user,point('origin'),point('destination'),'wheelchair');
    expect(draft.edgeIds).toEqual(fixture.edges.get('covered')!.map(String));
    await prisma.$executeRaw`UPDATE path_nodes SET status='approved' WHERE id=${fixture.nodes.get('ramp')!}`;
  });
  it('keeps stable fixture IDs when seeded twice without duplicating graph rows', async () => {
    await prisma.$executeRaw`UPDATE path_nodes SET surveyed_at=NOW(),operational_note='incorrect survey label' WHERE id=${fixture.nodes.get('origin')!}`;
    const again = await seedSyntheticRouting();
    const nodes = await prisma.$queryRaw<{surveyedAt:Date|null;note:string}[]>`SELECT surveyed_at AS "surveyedAt",operational_note AS note FROM path_nodes WHERE id=${fixture.nodes.get('origin')!}`;
    expect(nodes[0]!.surveyedAt).toBeNull();
    expect(nodes[0]!.note).toContain('SYNTHETIC');
    expect([...again.nodes]).toEqual([...fixture.nodes]);
    expect([...again.edges]).toEqual([...fixture.edges]);
    const rows = await prisma.$queryRaw<{count:bigint}[]>`SELECT COUNT(*) FROM path_edges WHERE metadata->>'syntheticFixture'=${SYNTHETIC_TAG}`;
    expect(Number(rows[0]!.count)).toBe(8);
  });
  it('preserves a zero-XY-length floor transition while rejecting a horizontal zero-length edge', async () => {
    // Synthetic lift: source is ground floor, intermediate is floor 1 at same XY.
    await prisma.$executeRaw`UPDATE path_nodes SET location=(SELECT location FROM path_nodes WHERE id=${fixture.nodes.get('origin')!}),floor_level=1,node_type='lift' WHERE id=${fixture.nodes.get('ramp')!}`;
    await prisma.$executeRaw`UPDATE path_edges SET geometry=ST_MakeLine(s.location::geometry,t.location::geometry)::geography,length_m=1,is_indoor=TRUE
      FROM path_nodes s,path_nodes t WHERE path_edges.source_node_id=s.id AND path_edges.target_node_id=t.id AND path_edges.id=${fixture.edges.get('ramp')![0]!}`;
    await prisma.$executeRaw`UPDATE path_edges SET geometry=ST_MakeLine(s.location::geometry,t.location::geometry)::geography,length_m=ST_Distance(s.location,t.location)
      FROM path_nodes s,path_nodes t WHERE path_edges.source_node_id=s.id AND path_edges.target_node_id=t.id AND path_edges.id=${fixture.edges.get('ramp')![1]!}`;
    const vertical = await planRoute(user,point('origin'),point('destination'),'wheelchair');
    expect(vertical.edgeIds).toEqual(fixture.edges.get('ramp')!.map(String));
    await prisma.$executeRaw`UPDATE path_nodes SET floor_level=0 WHERE id=${fixture.nodes.get('ramp')!}`;
    const horizontal = await planRoute(user,point('origin'),point('destination'),'wheelchair');
    expect(horizontal.edgeIds).toEqual(fixture.edges.get('covered')!.map(String));
  });
  it('never claims the whole route was surveyed when one segment has no survey date', async () => {
    await prisma.$executeRaw`UPDATE path_edges SET surveyed_at='2026-01-01T00:00:00Z' WHERE id=${fixture.edges.get('ramp')![0]!}`;
    const route = await planRoute(user,point('origin'),point('destination'),'wheelchair');
    expect(route.dataFreshness.surveyedAt).toBeNull();
  });
  it('reports the disconnected destination as unreachable for all profiles', async () => {
    const result = await compareRoutes(user,point('origin'),point('isolated'),Object.keys(expected));
    expect(result.results).toHaveLength(4);
    for(const route of result.results) { expect(route.reachable).toBe(false); expect(route.geometry).toBeUndefined(); expect(route.reasons?.some(r=>r.type==='no_path_in_graph')).toBe(true); }
  });
  it('supports reversed traversal with the same surveyed bends', async () => {
    const route = await planRoute(user,point('destination'),point('origin'),'blind');
    expect(route.edgeIds).toEqual([...fixture.edges.get('guided')!].reverse().map(String));
    expect(route.geometry.coordinates).toEqual([point('destination').coordinates,point('guided').coordinates,point('origin').coordinates]);
  });
});
