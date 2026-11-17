# Demo Release Synthetic Dataset (`demo-release-v1`)

This directory contains an audited, idempotent synthetic demo dataset (`demo-release-v1`) and neutral multimodal transit fixture data (`demo-release.transit.json`) designed to make all core UNSTOPPABLE features demonstrable without modifying real field surveys or real user accounts.

> **Honesty & Data Provenance**
> - All `[DEMO]` buildings, nodes, edges, accounts, and `[DEMO] Bus A` stops/frequencies are **synthetic** (`synthetic: true`, `verifiedSurvey: false`, `surveyed_at: null`).
> - Real profile weights in `accessibility_profiles` are never modified.
> - Real users, real surveys, and closed `[DEV]` node `38` (`is_operational = false`) are never modified.
> - `[DEMO] Bus A` is a synthetic frequency fixture, **not** an official TransJogja or GTFS/GTFS-RT feed.

## Files

- `demo-release.fixture.ts` — Pure TypeScript fixture definitions (`DEV_EDGE_REPAIR_SPECS`, `DEMO_BUILDINGS`, `DEMO_NODES`, `DEMO_EDGES`, `DEMO_ACCOUNTS`, `DEMO_CAREGIVER_LINKS`).
- `demo-release.transit.json` — Neutral optional backend demo transit fixture (`[DEMO] Bus A`, `DEMO-STOP-A`, `DEMO-STOP-B`, synthetic 15-minute frequency, accessibility attributes, first/last-mile connector keys).
- `demo-release.seed.ts` — CLI & library supporting read-only `--audit`, default `--dry-run`, guarded `--apply`, private `chmod 600` backup/credentials output, `--restore=<backup.json>`, and `--cleanup`.
- `demo-release.test.ts` — Offline guard/fixture tests plus disposable local PostGIS integration tests (`DEMO_RELEASE_TEST_DB=1`).

## Supported Demo Features & Scenarios

1. **Four-profile routing differentiation** (`[DEMO] Halte Kampus Selatan` -> `[DEMO] Perpustakaan Ramah Lansia`):
   - `wheelchair` -> `ramp` branch (avoids stairs, accepts uncovered ramp)
   - `crutches` -> `covered` branch (avoids 4-step penalty and uncovered penalty)
   - `low_vision` -> `stairs` branch (shortest path beats missing-guiding-block penalty)
   - `blind` -> `guided` branch (tactile guiding block avoids heavy no-guiding-block penalty)
   - Every segment uses multi-point static bends (`5` vertices per route) and endpoint-exact PostGIS `geography(LineString, 4326)`.
2. **Unreachable destination handling**:
   - `[DEMO] Paviliun Tangga Lama (Terisolasi)` returns `ROUTE_UNREACHABLE` (`no_path_in_graph`) across all 4 profiles.
3. **Building catalog & AI Planner destination resolution**:
   - All 5 `[DEMO]` buildings are searchable via `GET /api/buildings` and Gemini `resolveDestinationLocation`, with honest `accessibilityScore: null` (`surveyed_at: null`).
4. **Long-distance multimodal corridor (`[DEMO] Bus A`)**:
   - Isolated northern origin (`[DEMO] Terminal Asal Koridor Utara`) -> first-mile accessible connector -> `[DEMO] Halte A - Koridor Utara` (`DEMO-STOP-A`) -> synthetic `[DEMO] Bus A` -> `[DEMO] Halte B - Alun-Alun Selatan Demo` (`DEMO-STOP-B`) -> last-mile accessible connector -> `[DEMO] Pusat Layanan Lansia Selatan`.
   - Pedestrian-only routing across the ~4.4 km gap remains `no_path_in_graph`, while first-mile and last-mile legs are solved via real `pgr_dijkstra`.
5. **Dedicated `[DEMO]` accounts & relationships** (passwords stored only in private `chmod 600` file outside git):
   - `[DEMO] Lansia Kursi Roda` (`mobility_user`, `wheelchair`) + `[DEMO] Lansia Tunanetra` (`blind_user`, `blind`)
   - `[DEMO] Keluarga Pendamping` (`caregiver`, linked only to the two `[DEMO]` senior accounts)
   - `[DEMO] Relawan Pendamping & Pemeta` (`volunteer`, `verified`, `canCompanion: true`, `canMapData: true`, `5000 m` active availability covering all demo zones)
   - `[DEMO] Admin Verifikator` (`admin`)

## Safety Guards & Usage

Default execution is **read-only dry-run**:

```bash
cd backend
DATABASE_URL='postgresql://postgres:demo-local-only@127.0.0.1:55459/routing_demo' \
  npx tsx prisma/demo-release.seed.ts
```

Read-only audit:

```bash
npx tsx prisma/demo-release.seed.ts --audit --env-file=/path/to/backend/.env
```

Apply (requires `--apply`, `--ack-fixture=demo-release-v1`, and for non-local hosts `--ack-target=<db-hostname>`):

```bash
npx tsx prisma/demo-release.seed.ts \
  --apply \
  --ack-fixture=demo-release-v1 \
  --ack-target=<db-hostname> \
  --env-file=/path/to/backend/.env
```

Rollback from backup:

```bash
npx tsx prisma/demo-release.seed.ts \
  --restore=/tmp/unstoppable-qa/demo-backup-<timestamp>.json \
  --apply \
  --ack-fixture=demo-release-v1 \
  --ack-target=<db-hostname> \
  --env-file=/path/to/backend/.env
```

## Local Disposable Verification

```bash
docker run --name unstoppable-demo-release-qa \
  -e POSTGRES_PASSWORD=demo-local-only -e POSTGRES_DB=routing_demo \
  -p 127.0.0.1:55459:5432 -d pgrouting/pgrouting:16-3.4-3.6.1
cd backend
export DATABASE_URL='postgresql://postgres:demo-local-only@127.0.0.1:55459/routing_demo'
npx prisma migrate deploy
npx tsx prisma/accessibility-profiles.seed.ts
DEMO_RELEASE_TEST_DB=1 npx vitest run prisma/demo-release.test.ts
```
