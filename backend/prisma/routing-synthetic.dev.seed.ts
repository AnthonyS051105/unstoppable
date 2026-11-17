import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/config/prisma.js';
import { SYNTHETIC_PREFIX, SYNTHETIC_TAG, syntheticNodes, syntheticBranches } from './routing-synthetic.fixture.js';

export function assertDisposableDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
  if (process.env.ROUTING_SYNTHETIC_LOCAL !== '1' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('/routing_demo')) {
    throw new Error('Synthetic fixture requires ROUTING_SYNTHETIC_LOCAL=1 and a localhost database named routing_demo.');
  }
}
export async function seedSyntheticRouting(cleanup = false) {
  assertDisposableDatabase();
  return prisma.$transaction(async tx => {
    // Own metadata only. Never delete by broad DEV prefixes or replace any real survey.
    if (cleanup) await tx.$executeRaw`DELETE FROM path_edges WHERE metadata->>'syntheticFixture' = ${SYNTHETIC_TAG}`;
    else await tx.$executeRaw`DELETE FROM path_edges WHERE metadata->>'syntheticFixture' = ${SYNTHETIC_TAG} AND metadata->>'corrupt' = 'true'`;
    const ids = new Map<string, bigint>();
    for (const node of syntheticNodes) {
      const name = `${SYNTHETIC_PREFIX} ${node.key}`;
      if (cleanup) {
        // Do not cascade through a foreign edge someone added to our node.
        await tx.$executeRaw`DELETE FROM path_nodes n WHERE n.name = ${name} AND NOT EXISTS (SELECT 1 FROM path_edges e WHERE e.source_node_id=n.id OR e.target_node_id=n.id)`;
        continue;
      }
      const rows = await tx.$queryRaw<{id: bigint}[]>`SELECT id FROM path_nodes WHERE name = ${name} ORDER BY id LIMIT 1`;
      if (rows[0]) {
        await tx.$executeRaw`UPDATE path_nodes SET location=ST_SetSRID(ST_MakePoint(${node.coord[0]},${node.coord[1]}),4326)::geography,
          status='approved',is_operational=TRUE,floor_level=0,node_type=${node.type},surveyed_at=NULL,
          operational_note='SYNTHETIC demonstration; no verified field survey; local disposable database only',updated_at=NOW() WHERE id=${rows[0].id}`;
        ids.set(node.key, rows[0].id); continue;
      }
      const [row] = await tx.$queryRaw<{id: bigint}[]>`
        INSERT INTO path_nodes (name, node_type, floor_level, location, status, is_operational, operational_note, surveyed_at, updated_at)
        VALUES (${name}, ${node.type}, 0, ST_SetSRID(ST_MakePoint(${node.coord[0]}, ${node.coord[1]}),4326)::geography, 'approved', TRUE,
        'SYNTHETIC demonstration; no verified field survey; local disposable database only', NULL, NOW()) RETURNING id`;
      ids.set(node.key, row!.id);
    }
    if (cleanup) return { nodes: ids, edges: new Map<string, bigint[]>() };
    const edges = new Map<string, bigint[]>();
    for (const branch of syntheticBranches) {
      const edgeIds: bigint[] = [];
      for (const [index, [from, to]] of [['origin', branch.key], [branch.key, 'destination']].entries()) {
        // Preserve actual synthetic vertices in GeoJSON; length is derived by PostGIS.
        const metadata = JSON.stringify({ syntheticFixture: SYNTHETIC_TAG, synthetic: true, verifiedSurvey: false, branch: branch.key, leg: index,
          illumination: branch.guided ? 'synthetic illuminated path' : 'not modelled', note: 'Illumination is descriptive only; existing weights use guiding blocks, steps, cover, width and slope.' });
        const [row] = await tx.$queryRaw<{id: bigint}[]>`
          INSERT INTO path_edges (id, source_node_id, target_node_id, geometry, length_m, surface_type, width_cm, has_stairs, step_count, slope_percent,
            has_handrail, is_covered, is_indoor, is_one_way, has_guiding_block, guiding_block_condition, is_operational, status, surveyed_at, metadata, updated_at)
          SELECT COALESCE((SELECT id FROM path_edges WHERE metadata->>'syntheticFixture'=${SYNTHETIC_TAG} AND metadata->>'branch'=${branch.key} AND metadata->>'leg'=${String(index)} LIMIT 1), nextval(pg_get_serial_sequence('path_edges','id'))),
            s.id, t.id, ST_MakeLine(s.location::geometry,t.location::geometry)::geography,
            ROUND(ST_Distance(s.location,t.location)::numeric,2), 'beton', ${branch.width}, ${branch.steps > 0 && index === 0}, ${index === 0 ? branch.steps : 0}, ${branch.key === 'ramp' ? 4 : 0},
            TRUE, ${branch.covered}, FALSE, FALSE, ${branch.guided}, ${branch.guided ? 'baik' : null}, TRUE, 'approved', NULL, ${metadata}::jsonb, NOW()
          FROM path_nodes s, path_nodes t WHERE s.id = ${ids.get(from!)!} AND t.id = ${ids.get(to!)!}
          ON CONFLICT (id) DO UPDATE SET geometry=EXCLUDED.geometry,length_m=EXCLUDED.length_m,source_node_id=EXCLUDED.source_node_id,target_node_id=EXCLUDED.target_node_id,
            surface_type=EXCLUDED.surface_type,width_cm=EXCLUDED.width_cm,has_stairs=EXCLUDED.has_stairs,step_count=EXCLUDED.step_count,slope_percent=EXCLUDED.slope_percent,
            has_handrail=EXCLUDED.has_handrail,is_covered=EXCLUDED.is_covered,is_indoor=EXCLUDED.is_indoor,is_one_way=EXCLUDED.is_one_way,
            has_guiding_block=EXCLUDED.has_guiding_block,guiding_block_condition=EXCLUDED.guiding_block_condition,is_operational=TRUE,status='approved',surveyed_at=NULL,metadata=EXCLUDED.metadata,updated_at=NOW()
          RETURNING id`;
        edgeIds.push(row!.id);
      }
      edges.set(branch.key, edgeIds);
    }
    return { nodes: ids, edges };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedSyntheticRouting(process.argv.includes('--cleanup')).then(result => console.log(JSON.stringify({ synthetic: true, nodes: Object.fromEntries([...result.nodes].map(([k,v]) => [k,String(v)])), edges: Object.fromEntries([...result.edges].map(([k,v]) => [k,v.map(String)])) }, null, 2)))
    .catch(err => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
