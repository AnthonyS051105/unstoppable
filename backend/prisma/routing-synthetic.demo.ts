/** Local executable evidence: real Route Service + PostGIS/pgRouting, no mocked costs. */
import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { planRoute, compareRoutes } from '../src/modules/routes/routes.service.js';
import { buildCostExpression } from '../src/modules/routes/weight-builder.js';
import type { GeoJsonPoint, WeightConfig } from '../src/modules/routes/routes.types.js';
import { seedSyntheticRouting } from './routing-synthetic.dev.seed.js';
import { SYNTHETIC_TAG, syntheticNodes } from './routing-synthetic.fixture.js';
const point = (key: string): GeoJsonPoint => ({ type: 'Point', coordinates: [...syntheticNodes.find(n=>n.key===key)!.coord] });
async function main() {
  await seedSyntheticRouting();
  const profiles = ['wheelchair','crutches','low_vision','blind'];
  // Explicit requested profile reads system weights; this UUID has no user overrides.
  const userId = '00000000-0000-0000-0000-000000000001';
  const results = [];
  for (const profile of profiles) {
    const route = await planRoute(userId, point('origin'), point('destination'), profile);
    const config = (await prisma.accessibilityProfile.findUniqueOrThrow({where:{id:profile}})).weightConfig as unknown as WeightConfig;
    const costs = await prisma.$queryRaw<{branch:string;cost:number|null}[]>(Prisma.sql`
      SELECT e.metadata->>'branch' AS branch,
        CASE WHEN BOOL_OR(c.cost < 0) THEN NULL ELSE SUM(c.cost)::float END AS cost
      FROM path_edges e CROSS JOIN LATERAL (SELECT 0 AS penalty, '' AS max_effect) r
      CROSS JOIN LATERAL (SELECT ${Prisma.raw(buildCostExpression(config, {}))} AS cost) c
      WHERE e.metadata->>'syntheticFixture'=${SYNTHETIC_TAG} GROUP BY e.metadata->>'branch' ORDER BY cost NULLS LAST`);
    results.push({profile,route,costs});
  }
  const unreachable = await compareRoutes(userId,point('origin'),point('isolated'),profiles);
  console.log(JSON.stringify({synthetic:true,verifiedSurvey:false,scope:'Local disposable demonstration only; not verified real roads or safe travel advice',origin:point('origin'),destination:point('destination'),results,unreachable},null,2));
}
main().catch(err => {console.error(err);process.exitCode=1;}).finally(()=>prisma.$disconnect());
