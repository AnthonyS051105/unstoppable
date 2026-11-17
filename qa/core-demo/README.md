# Core Demo & Pre-Multimodal QA Harness (`qa/core-demo`)

Automated end-to-end Playwright + API verification harness for the UNSTOPPABLE core release candidate journeys on merged staging R2 (`origin/staging-frontend`).

## Safety & Isolation Rules

1. **Zero Production Mutations**: All write operations (registration, OTP verification, route saving, navigation sessions, AI planner conversations, companion requests/offers/check-ins, caregiver monitoring, hazard reports, mapper draft nodes/edges, admin verification, and SOS triggers) execute strictly against a disposable local PostGIS + pgRouting instance (`127.0.0.1:55439/routing_demo`).
2. **Scoped Gemini Key Usage**: Only `GEMINI_API_KEY` (and optional `GEMINI_MODEL`) is read into an isolated local `.env` file (`/tmp/unstoppable-qa/core-demo-local-backend.env`, `chmod 600`) to verify a bounded live Gemini extraction call on synthetic campus data. All external notification transports (`SMTP`, `SMS`, `VAPID`, `Supabase Storage`) remain empty/stubbed.
3. **Hydrated Role-Gate Verification**: Blank screens, `SessionGate` loading states, `/login` redirects, and role-denial banners (`"Halaman ini tidak tersedia untuk akun Anda"`) are never treated as passing allowed-role UI checks. Every allowed route must hydrate `nav[aria-label="Navigasi utama"]` and a visible `main h1, main h2` heading.

## Suites Covered (`run-core-demo.mjs`)

- **Suite 1 (`suite1_auth`)**: UI registration (`/register`), dev-log 6-digit OTP extraction and verification (`/otp`), phone and email login (`/login` with `input[type="text"]`), and `authLimiter` verification (7 consecutive valid logins succeed with `200`; 5 failed attempts return `401` and the 6th returns `429 RATE_LIMITED` in Indonesian).
- **Suite 2 (`suite2_roles`)**: Hydrated navigation and role-access gate enforcement across all 5 demo roles (`senior_wheelchair`, `senior_blind`, `caregiver`, `volunteer`, `admin`).
- **Suite 3 (`suite3_routing_journey`)**: Four-profile routing differentiation (`wheelchair`, `crutches`, `low_vision`, `blind`) on `[DEMO] Halte Kampus Selatan` (`[110.378, -7.77]`) -> `[DEMO] Perpustakaan Ramah Lansia` (`[110.3787, -7.77]`), `/compare` side-by-side table, `/search` -> `/place` -> `/preview` (continuous 5-vertex `#a36a00` gold polyline) -> route save -> `/trip` -> `/arrived` -> `/feedback` -> `/saved` -> `/history`, and `/unreachable` (`422 ROUTE_UNREACHABLE`) on `[DEMO] Paviliun Tangga Lama (Terisolasi)` (`[110.3804, -7.77]`).
- **Suite 4 (`suite4_ai_planner`)**: Live Gemini extraction (`POST /api/ai-planner/conversations/:id/message`), route confirmation (`POST /api/ai-planner/conversations/:id/confirm` -> `/preview`), unreachable destination guard (disabled confirm button + companion recommendation), manual destination picker (`Pilih Tujuan Terdata (Tanpa AI)`), simulated `503 AI_UNAVAILABLE` fallback banner, and pre-multimodal transit corridor check.
- **Suite 5 (`suite5_companion`)**: Full companion lifecycle (`POST /api/companions/requests` -> `GET /api/companions/open` -> `POST /api/companions/requests/:id/offer` -> `GET /api/companions/requests/:id/offers` -> `POST /api/companions/requests/:id/select` -> `/volunteer-schedule` UI -> bilateral `meet` and `complete` check-ins).
- **Suite 6 (`suite6_caregiver`)**: Caregiver linked dependents (`GET /api/users/me/dependents`), live trip monitoring (`during_trip` on `/caregiver` and `/monitor`), and `sos_only` privacy enforcement.
- **Suite 7 (`suite7_mapper_admin_reports`)**: Road hazard report submission (`POST /api/reports`) + second-user corroboration (`POST /api/reports/:id/corroborate`), volunteer mapper draft node/edge creation + topology validation (`POST /api/graph/validate`), and admin verification queue (`/verification`, `/topology`) + draft rejection cleanup so demo corridors remain untouched.
- **Suite 8 (`suite8_sos`)**: Local-only SOS trigger (`POST /api/sos/trigger`), accessible `/sos` control verification (`0` unnamed controls), volunteer `en_route` response (`POST /api/sos/:id/respond`), status readback (`GET /api/sos/:id/status`), and cancellation (`POST /api/sos/:id/cancel`) with external notifications stubbed.
- **Suite 9 (`suite9_voice`)**: `/voice-settings` hydration, opt-in wake phrase (`"Halo Unstoppable"`) control verification, and deterministic browser `SpeechSynthesis` / `SpeechRecognition` mock state checks.
- **Suite 10 (`suite10_responsive_a11y`)**: Responsive viewport matrix (`320x640`, `360x800`, `390x844`, `430x932`, `768x1024`, `1280x800`) across 7 routes, `200%` CSS zoom, `200%` root font size (`32px`), product `large-text` mode, keyboard `Tab` skip-link focus + mobile menu `Escape` close, and automated `axe-core` WCAG 2.x A/AA scan.
- **Suite 11 (`suite11_production_smoke`)**: Strictly read-only production health and buildings check plus pre-R2 vs local R2 comparison without creating production sessions or alerts.

## Running the Harness

Ensure the local disposable PostGIS container (`127.0.0.1:55439/routing_demo`), local backend (`http://localhost:4000`), and local Next.js server (`http://localhost:3000`) are running, then execute:

```bash
node qa/core-demo/run-core-demo.mjs
```

Artifacts are written outside the repository to `/tmp/unstoppable-qa/core-demo/`:
- Summary JSON: `/tmp/unstoppable-qa/core-demo/results/core-demo-summary.json`
- Screenshots: `/tmp/unstoppable-qa/core-demo/screenshots/*.png`
