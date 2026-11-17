# Synthetic routing demonstration (local only)

This fixture is generated test data, **not a verified field survey**, not actual surveyed roads, and not safe travel guidance. It never seeds the production database. The names start with `[SYNTHETIC routing-v1]`, nodes say synthetic in `operational_note`, edges carry `synthetic: true`, `verifiedSurvey: false`, and `syntheticFixture: routing-synthetic-v1` in metadata, and every `surveyed_at` is NULL. Approval is used only to exercise the real routing algorithm in an isolated local database.

The fixture reuses the existing `accessibility-profiles.seed.ts` system weights without changing them. It has one shared origin `[110.4,-7.8]`, one destination `[110.4005,-7.8]`, four distinct two-edge branches, and a disconnected destination `[110.401,-7.8]`. Each line is explicit synthetic geometry; no road-service connector is invented. The guided branch is descriptively illuminated in metadata, but lighting is not a weighted attribute in the existing model: guiding blocks drive the preference.

## Exact setup and execution

Run from the repository root. Docker must be running, and port 55439 must be free. This creates a new disposable container, not the existing project database.

```bash
docker run --name unstoppable-routing-synthetic-qa \
  -e POSTGRES_PASSWORD=synthetic-local-only -e POSTGRES_DB=routing_demo \
  -p 127.0.0.1:55439:5432 -d pgrouting/pgrouting:16-3.4-3.6.1
cd backend
npm ci --ignore-scripts
export DATABASE_URL='postgresql://postgres:synthetic-local-only@127.0.0.1:55439/routing_demo'
export ROUTING_SYNTHETIC_LOCAL=1
docker exec unstoppable-routing-synthetic-qa pg_isready -U postgres -d routing_demo
# Run the following only after pg_isready says accepting connections:
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/accessibility-profiles.seed.ts
npx tsx prisma/routing-synthetic.dev.seed.ts
npx tsx prisma/routing-synthetic.demo.ts
npx vitest run src/modules/routes/routes.synthetic-db.test.ts src/modules/routes/routes.geometry-integrity.test.ts
```

`routing-synthetic.demo.ts` prints actual Route Service results and SQL-evaluated costs as JSON, including four unreachable comparison entries for the isolated destination. No account, OTP, external API key or backend HTTP server is needed for this harness. The integration tests call the production Route Service against actual PostGIS and pgRouting, without mocking the profile weights or the graph search. Without `ROUTING_SYNTHETIC_LOCAL=1`, those database tests are explicitly skipped; ordinary unit tests remain database-free.

This is a backend fixture/harness, not a production demo mode or switch. To browse these synthetic facilities in a locally configured app, point that local backend at this disposable database and use a local test account. Do not point the production frontend or production backend at it.

## Expected results

Costs are generalized routing cost, not metres. Path lengths come from PostGIS geography and are rounded to 0.1 m in route responses.

| Profile | Chosen branch | Distance | Cost | Why the existing weights choose it |
| --- | --- | ---: | ---: | --- |
| wheelchair | ramp | 89.7 m | 99.72 | Steps blocked; uncovered penalty is 5 per edge, less than the longer covered path |
| crutches | covered | 104.3 m | 104.26 | Stairs cost 25 per step; uncovered ramp costs 10 per edge |
| low_vision | stairs | 59.4 m | 101.42 | Short distance wins despite 4 × 3 step penalty and 2 × 15 missing-guidance penalty |
| blind | guided | 137.6 m | 137.62 | No missing-guidance penalty; alternatives pay 40 per edge without guiding blocks |

All four profiles are unreachable at the isolated destination. The fixture tests also prove reverse traversal, fixed IDs/counts on repeated seed, exclusion of corrupted endpoint geometry, closed/draft intermediate nodes, proper floor-transition handling and honest survey-date aggregation.

## Idempotence and cleanup

Repeated seeds update only this fixture's named nodes and metadata-tagged edges. IDs remain stable, edge geometry and lengths are regenerated from the fixture, and no broad `[DEV]` deletion occurs. Cleanup removes only tagged edges and fixture nodes that have no remaining foreign edges. If a foreign edge refers to a fixture node, cleanup leaves that node instead of cascading into unrelated data.

With the same two exported environment variables from setup:

```bash
npx tsx prisma/routing-synthetic.dev.seed.ts --cleanup
unset DATABASE_URL ROUTING_SYNTHETIC_LOCAL
cd ..
docker rm -f -v unstoppable-routing-synthetic-qa
```

The cleanup command is optional if the entire disposable container is removed. The seed itself refuses non-localhost hosts, databases other than `routing_demo`, or a missing explicit `ROUTING_SYNTHETIC_LOCAL=1`; never circumvent that guard to seed a shared or production database. No production data was written during this audit.
