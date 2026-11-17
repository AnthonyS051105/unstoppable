# Core Demo & Pre-Multimodal QA Report (`qa/core-demo/report.md`)

- **Date**: `2026-11-17`
- **Target Staging Base**: `origin/staging-frontend` (`57b29f7e46a4443ea145864cb2eaaa67e839f74b`)
- **Merged Release Layers Included**:
  - **R1 Routing & Build Integrity**: PR #114 (`77a66a5`) + PR #115 (`bb42a2d`)
  - **Demo Fixture & Seed Infrastructure**: PR #116 (`b9f8bc1`) + PR #117 (`5cb12f3`) + PR #119 (`57b29f7`)
  - **R2 Mobile Responsiveness, AI Planner & Voice Accessibility**: PR #118 (`fd1f573`)
- **Working Branch**: `test/demo-core-journeys`
- **Local Test Environment**:
  - **Disposable PostGIS + pgRouting DB**: `postgresql://postgres:***@127.0.0.1:55439/routing_demo` (`pgrouting/pgrouting:16-3.4-3.6.1`, container `unstoppable-core-qa-db`)
  - **Local Backend**: `http://localhost:4000` (isolated env `/tmp/unstoppable-qa/core-demo-local-backend.env`, `chmod 600`; local JWT secret; SMTP/SMS/VAPID/Supabase empty; bounded `GEMINI_API_KEY` parsed programmatically for synthetic planner verification)
  - **Local Frontend**: `http://localhost:3000` (`next start -H localhost -p 3000` from production build)
- **Production Safety**: Zero production database mutations, zero production logins/OTP/SOS/bookings triggered during this run.

---

## 1. Executive Summary & Release Readiness Gate

| Verification Layer | Outcome | Key Evidence |
|---|---|---|
| **GitHub Actions CI (`staging-frontend`)** | **PASS** | Run `44010306100` (`57b29f7`, PR #119) & Run `44009445230` (`fd1f573`, PR #118): both `success` (`test-backend` + `test-frontend`). |
| **Backend Build & Test Suite** | **PASS** | `npm run build` (`prisma generate && tsc`) exited `0`. `ROUTING_SYNTHETIC_LOCAL=1 DEMO_RELEASE_TEST_DB=1 npm test`: **33 passed (33) files, 202 passed (202) tests, 0 skipped**. |
| **Frontend Build, Typecheck & Unit Tests** | **PASS** | `npm run build` exited `0`; `npx tsc --noEmit` exited `0`; `npm test`: **125 passed (125), 0 failed, 0 skipped** (`1559.9 ms`). |
| **Frontend ESLint (`npm run lint`)** | **WARN / 2 Pre-Existing Errors** | Exits non-zero (`2 errors, 12 warnings`) due to pre-existing `react-hooks/set-state-in-effect` in `frontend/src/contexts/ActiveSessionContext.tsx:165` and `frontend/src/screens/journey.tsx:451`. |
| **Suite 1: Auth, Registration + Dev-Log OTP, Login & Rate Limit** | **PASS** | UI `/register` -> dev-log 6-digit OTP extraction -> `/otp` -> `/home`; phone & email login via `input[type="text"]`; 7 valid logins pass (`200`), 6th failed login blocked (`429 RATE_LIMITED`). |
| **Suite 2: Role Access Gates & Hydrated Navigation (5 Roles)** | **PASS** | `senior_wheelchair`, `senior_blind`, `caregiver`, `volunteer`, and `admin` all hydrate `nav[aria-label="Navigasi utama"]` + `main h1/h2` on allowed routes and render `"Halaman ini tidak tersedia untuk akun Anda"` on unauthorized routes. |
| **Suite 3: 4-Profile Routing, Compare, Gold 5-Vertex Preview & Trip Journey** | **PASS** | All 4 profiles produce distinct edge pairs on `[DEMO] Halte Kampus Selatan -> [DEMO] Perpustakaan Ramah Lansia` (`110.1 m`, `128.9 m`, `77.8 m`, `179.9 m`); `/preview` renders continuous 5-vertex `#a36a00` gold polyline (`M109 130L136 175L174 190L211 175L239 130`) with **`0` `pageerrors`**. |
| **Suite 4: AI Planner (Live Gemini + Manual Fallback + Unreachable Guard)** | **PASS** | Live Gemini call (`200 OK`, `7610 ms`) extracted `[DEMO] Perpustakaan Ramah Lansia`, `09:30 WIB`, `"butuh jalur guiding block"`, and confirmed route to `/preview` (`200 OK`). Unreachable target disables confirm button & recommends companion. Simulated `503 AI_UNAVAILABLE` renders fallback banner. |
| **Suite 5: Companion Lifecycle (Local Actors)** | **PASS** | Full lifecycle verified: `create (201)` -> `open list (true)` -> `offer (201)` -> `select (200 confirmed)` -> `/volunteer-schedule` UI -> bilateral `meet (201/201)` & `complete (201/201 -> completed)`. |
| **Suite 6: Caregiver Permissions, Linking & Monitoring** | **PASS** | Caregiver sees both linked seniors (`200`, `count: 2`); `senior_wheelchair` (`during_trip`) exposes active session on `/caregiver` & `/monitor`; `senior_blind` (`sos_only`) enforces privacy (`noCoordinatesExposedInDependentsList: true`). |
| **Suite 7: Road Reports, Mapper Graph & Admin Verification** | **PASS** | Hazard report created (`201`) & corroborated (`200`); mapper draft nodes/edge created (`201`) & topology validated (`200`); admin `/verification` & `/topology` UI verified and draft items rejected (`200`) to preserve demo graph. |
| **Suite 8: Local-Only SOS Lifecycle (External Stubbed)** | **PASS** | `/sos` unnamed checkbox (`F-001`) fixed in R2 (`0` unnamed controls); `trigger (201)` -> volunteer `respond en_route (201)` -> `status (200, responders: 1)` -> `cancel false_alarm (200)`. |
| **Suite 9: Voice Settings, Wake Phrase & TTS Hooks** | **PASS (Browser Mock / Unit)** | `/voice-settings` hydrated with opt-in `"Halo Unstoppable"` wake-phrase toggle; 125 unit tests verify wake/stop/TTS pause-resume logic. Physical mic/speaker remain unverified in headless environment. |
| **Suite 10: Responsive Viewport Matrix (6 Viewports), Zoom, Focus & axe-core** | **PASS WITH MINOR NOTES** | **42/42** viewport-route checks (`320`–`1280px`) have **0 horizontal overflow, 0 clipped controls, 0 unnamed controls**. `200%` root font & `large-text` mode have **0 overflow on 7/7 routes** (`CSS zoom: 2` at `390px` overflows on `/login` and `/home`). `axe-core` finds `0` critical issues and `1` recurring `label-content-name-mismatch` on `.brand`. |
| **Pre-Multimodal Transit Boundary** | **EXPECTED PENDING SIBLING** | First-mile (`67.4 m`, `edge 163`) and last-mile (`78.3 m`, `edge 164`) pedestrian connectors return `200`; unbridged 4.3 km transit gap returns `422 ROUTE_UNREACHABLE` until the sibling multimodal transit worker merges. |

> **Honest Release-Readiness Statement**: Core single-modal pedestrian journeys, 4-profile routing differentiation, R2 mobile layout/focus/zoom, AI planner (live Gemini + manual fallback + unreachable guard), companion lifecycle, caregiver monitoring, mapper/admin verification, and local SOS are verified on local staging R2 (`57b29f7`). However, **the whole release is not yet complete**: (1) multimodal transit routing is still in progress on the sibling worker branch, (2) deployed production (`https://unstoppable-mu.vercel.app`) is still running pre-R2 code where `/login` uses `input[type="email"]` and `/preview` emits a `TypeError` pageerror, and (3) physical hardware voice/screen-reader/locked-screen checks require real device execution.

---

## 2. Build, Typecheck, Lint & Automated Test Counts

| Package | Command | Result | Test / File Counts | Skipped | Log Path |
|---|---|---|---|---|---|
| **Backend** | `npm run build` (`prisma generate && tsc`) | **PASS (`0`)** | TypeScript compilation clean | 0 | — |
| **Backend** | `ROUTING_SYNTHETIC_LOCAL=1 DEMO_RELEASE_TEST_DB=1 npm test` | **PASS (`0`)** | **33 passed (33) files / 202 passed (202) tests** (including `routes.synthetic-db.test.ts` 8 tests, `routes.geometry-integrity.test.ts` 8 tests, `demo-release.test.ts` 6 tests, `rate-limit.test.ts` 5 tests, `ai-planner.reliability.test.ts` 14 tests) | **0 skipped** | `/tmp/unstoppable-qa/core-demo-backend-test.log` |
| **Frontend** | `npx tsc --noEmit` | **PASS (`0`)** | TypeScript check clean | 0 | — |
| **Frontend** | `npm test` | **PASS (`0`)** | **125 passed (125) tests** (`duration_ms: 1559.9`) | **0 skipped** | `/tmp/unstoppable-qa/core-demo-frontend-test.log` |
| **Frontend** | `npm run build` | **PASS (`0`)** | 34 static/dynamic Next.js routes built cleanly | 0 | `/tmp/unstoppable-qa/core-demo-frontend-build.log` |
| **Frontend** | `npm run lint` | **FAIL (`1`)** | `2 errors, 12 warnings` (`react-hooks/set-state-in-effect` in `ActiveSessionContext.tsx:165` and `journey.tsx:451`) | — | Pre-existing on `origin/staging-frontend` |

---

## 3. Feature-by-Feature Verification Matrix

### Suite 1: Authentication, Registration + Dev-Log OTP, Login & Rate Limit
- **UI Registration + Dev-Log OTP (`/register` -> `/otp` -> `/home`)**:
  - Registered synthetic user `[QA LOCAL] Pengguna Baru` via `/register`.
  - Extracted 6-digit OTP code from local backend dev log (`/tmp/unstoppable-qa/core-demo-backend.log`), filled `.otp-inputs input`, submitted `/otp`, and verified redirect to `/home` (`otpVerifiedUi: true`, `pageerrors: []`).
- **Phone & Email Login (`/login`)**:
  - Confirmed R2 fix: `/login` renders `input[name="email"][type="text"]` (`autocomplete="username"`), allowing native phone number login (`081900110001`) without HTML5 email validation rejection (`finalPath: "/home"`, `pageerrors: []`).
  - Newly registered email account logged in cleanly (`finalPath: "/onboarding-role"`).
- **`authLimiter` Behavior (`POST /api/auth/login`)**:
  - `skipSuccessfulRequests: true`: **7 consecutive valid logins** from the same IP all returned `200 OK` (`[200, 200, 200, 200, 200, 200, 200]`).
  - Failed login throttling: **5 failed attempts** returned `401 INVALID_CREDENTIALS`, and the **6th failed attempt** returned `429 RATE_LIMITED` with `"Terlalu banyak percobaan masuk. Silakan coba lagi setelah 15 menit."`.
- **Screenshots**:
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite1-register-post-otp-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite1-senior-home-390.png`

### Suite 2: Role Access Gates & Hydrated Navigation Across All 5 Roles
Every allowed check waited for `nav[aria-label="Navigasi utama"]` and a visible `main h1, main h2` heading; every denied check verified that the role gate blocked access with `"Halaman ini tidak tersedia untuk akun Anda"`:

| Role Account | Allowed Routes Verified (`ok: true`, hydrated `nav` + `h1/h2`) | Denied Routes Verified (`blockedProperly: true`) | Page / Console Errors | Screenshot |
|---|---|---|---|---|
| `senior_wheelchair` (`mobility_user`) | `/home`, `/search`, `/ai-planner`, `/saved`, `/history`, `/sos`, `/settings`, `/voice-settings` | `/caregiver`, `/verification`, `/mapper` | `0` / `0` | `suite2-role-senior_wheelchair-390.png` |
| `senior_blind` (`blind_user`) | `/home`, `/search`, `/ai-planner`, `/saved`, `/history`, `/sos`, `/settings`, `/voice-settings` | `/caregiver`, `/verification`, `/mapper` | `0` / `0` | `suite2-role-senior_blind-390.png` |
| `caregiver` (`caregiver`) | `/caregiver`, `/caregiver-link`, `/monitor`, `/settings` | `/verification`, `/mapper`, `/ai-planner` | `0` / `0` | `suite2-role-caregiver-390.png` |
| `volunteer` (`volunteer`) | `/dashboard`, `/volunteer-schedule`, `/volunteer-tasks`, `/mapper`, `/communities`, `/settings` | `/verification`, `/caregiver` | `0` / `0` | `suite2-role-volunteer-390.png` |
| `admin` (`admin`) | `/dashboard`, `/verification`, `/topology`, `/admin-reports`, `/settings` | `/mapper`, `/caregiver` | `0` / `0` | `suite2-role-admin-390.png` |

### Suite 3: Four-Profile Routing Contrast, Unreachable Target & Full Senior Journey
- **Four-Profile Routing Contrast (`POST /api/routes/plan` & `POST /api/routes/compare`)**:
  - Origin: `[DEMO] Halte Kampus Selatan` (`[110.378, -7.77]`, node `160`)
  - Destination: `[DEMO] Perpustakaan Ramah Lansia` (`[110.3787, -7.77]`, node `161`)

| Profile ID | Chosen Branch | Edge IDs | Distance (`m`) | Est. Duration (`min`) | Geometry Vertices | `surveyedAt` |
|---|---|---|---|---|---|---|
| `wheelchair` | Ramp (`[DEMO] Simpang Ramp Taman Demo`) | `["157", "158"]` | `110.1 m` | `2 min` | `5` | `null` (honest synthetic) |
| `crutches` | Covered (`[DEMO] Koridor Teduh Barat Demo`) | `["159", "160"]` | `128.9 m` | `2 min` | `5` | `null` (honest synthetic) |
| `low_vision` | Stairs (`[DEMO] Tangga Pintas Plaza Demo`) | `["155", "156"]` | `77.8 m` | `2 min` | `5` | `null` (honest synthetic) |
| `blind` | Guided (`[DEMO] Jalur Pemandu Taktil Demo`) | `["161", "162"]` | `179.9 m` | `3 min` | `5` | `null` (honest synthetic) |

- **Unreachable Destination (`[DEMO] Paviliun Tangga Lama (Terisolasi)`, `[110.3804, -7.77]`)**:
  - `POST /api/routes/plan` returns `422 ROUTE_UNREACHABLE` with `suggestion: "request_companion"`.
  - UI `/search` -> `/place` -> `"Cari rute ke sini"` redirects to `/unreachable` (`<h1>Tidak terjangkau</h1>`) with visible `"Minta Pendamping"` CTA.
- **Full Senior UI Journey (`/home` -> `/compare` -> `/search` -> `/place` -> `/preview` -> `/trip` -> `/arrived` -> `/feedback` -> `/saved` -> `/history`)**:
  - `/compare` renders side-by-side table comparing `wheelchair` (`110 m`, `3 langkah`) vs `blind` (`180 m`, `3 langkah`).
  - `/preview` renders the **continuous 5-vertex gold SVG polyline** (`stroke="#a36a00"`, `stroke-width="6"`, `d="M109 130L136 175L174 190L211 175L239 130"`) with **`0` `pageerrors`** (confirming the pre-R2 `/preview` `TypeError` is resolved on merged R2).
  - Route saved on `/preview`, verified on `/saved` (`[DEMO] Perpustakaan Ramah Lansia`), trip stepped through `/trip` -> `/arrived` -> `/feedback` (rating `5`), and verified on `/history`.
- **Screenshots**:
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-compare-wheelchair-vs-blind-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-place-perpustakaan-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-preview-gold-5vertex-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-active-trip-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-arrived-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-saved-routes-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-history-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite3-unreachable-390.png`

### Suite 4: AI Planner (Live Gemini + Manual Fallback + Unreachable Guard + Pre-Multimodal Boundary)
- **4A. Live Gemini Extraction (`POST /api/ai-planner/conversations/:id/message`)**:
  - Input: `"Saya ingin pergi ke Perpustakaan Ramah Lansia jam 09:30 pagi, butuh jalur guiding block"` (as `senior_blind`).
  - Live HTTP response: **`200 OK`** (`7610 ms`).
  - Extracted payload:
    - `destinationText`: `"[DEMO] Perpustakaan Ramah Lansia"`
    - `destinationLocation`: `{"type":"Point","coordinates":[110.3787,-7.77]}`
    - `matchSource`: `"building"`
    - `plannedTime`: `"2026-11-17T02:30:00.000Z"` (`09:30 WIB`)
    - `contextNotes`: `"butuh jalur guiding block"`
    - `readyToConfirm`: `true`
  - UI `#review-plan-heading` displayed `[DEMO] Perpustakaan Ramah Lansia`, `Rencana waktu: 09.30 WIB`, `Rute Pejalan Kaki Terverifikasi 180 m · ±3 menit`, and verified volunteer `[DEMO] Relawan Pendamping & Pemeta`.
- **4B. Unreachable Guard in `/ai-planner`**:
  - Selecting `[DEMO] Paviliun Tangga Lama (Terisolasi)` from the manual picker displays `"Rute pejalan kaki tidak terjangkau"`, switches companion badge to `"Disarankan"`, and **disables** `"Konfirmasi & Mulai Perjalanan"` (`confirmBtnDisabledOnUnreachable: true`).
- **4C. Route Confirmation (`POST /api/ai-planner/conversations/:id/confirm`)**:
  - Selecting `[DEMO] Perpustakaan Ramah Lansia` and clicking `"Lihat Pratinjau Rute"` returned `200 OK` and navigated to `/preview`.
- **4D. Simulated `503 AI_UNAVAILABLE` Fallback (Recorded Separately from Live Gemini)**:
  - Intercepting `/message` with `503 AI_UNAVAILABLE` rendered `#ai-fallback-title` (`"Lanjutkan dengan pemilihan tujuan manual"`) and focused the manual destination picker without page errors.
- **4E. Pre-Multimodal Transit Corridor Check (Expected Until Sibling Checkpoint)**:
  - First-mile pedestrian connector (`[110.378, -7.752] -> [110.3786, -7.7521]`): **`200 OK`** (`67.4 m`, `edgeIds: ["163"]`).
  - Last-mile pedestrian connector (`[110.3658, -7.7895] -> [110.3665, -7.7896]`): **`200 OK`** (`78.3 m`, `edgeIds: ["164"]`).
  - Unbridged long corridor (`[110.378, -7.752] -> [110.3665, -7.7896]`): **`422 ROUTE_UNREACHABLE`** (expected on pedestrian-only `/api/routes/plan` until the sibling multimodal transit worker merges).
- **Screenshots**:
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite4-ai-planner-live-gemini-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite4-ai-planner-unreachable-guard-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite4-ai-planner-503-fallback-390.png`

### Suite 5: Companion Lifecycle with Local Actors
- `senior_wheelchair` created request `46f2d22c-55ae-4b7c-9213-082b3f38bd2c` for `[DEMO] Perpustakaan Ramah Lansia` (`POST /api/companions/requests` -> `201`, `status: "open"`).
- `volunteer` queried `GET /api/companions/open?lat=-7.77&lng=110.378` (`openRequestsFound: true`) and submitted offer `ecdb57de-4e04-4ab7-a759-640d052d2a5c` (`POST /api/companions/requests/:id/offer` -> `201`).
- `senior_wheelchair` listed offers (`offersCountForSenior: 1`) and selected the offer (`POST /api/companions/requests/:id/select` -> `200`, `requestStatus: "confirmed"`).
- `volunteer` opened `/volunteer-schedule` in Chromium (`volunteerScheduleUiShowsDestination: true`, `pageerrors: []`).
- Both `volunteer` and `senior_wheelchair` completed `meet` check-in (`201` / `201`) and `complete` check-in (`201` / `201`), transitioning the request to `finalRequestStatus: "completed"`.
- **Screenshot**: `/tmp/unstoppable-qa/core-demo/screenshots/suite5-volunteer-schedule-390.png`

### Suite 6: Caregiver Permissions, Linking & Live Monitoring
- Started active travel sessions (`POST /api/sessions/start`) for both `senior_wheelchair` (`locationSharingMode: "during_trip"`) and `senior_blind` (`locationSharingMode: "sos_only"`).
- `GET /api/users/me/dependents` as `caregiver` returned `200 OK` with both linked dependents (`dependentsCount: 2`).
- `senior_wheelchair` (`during_trip`) exposed `activeSession` (`destinationName: "[DEMO] Perpustakaan Ramah Lansia"`), and `/monitor` rendered live trip telemetry (`"Dalam perjalanan ke [DEMO] Perpustakaan Ramah Lansia"`, `"Lokasi terakhir diterima pukul 11.43"`).
- `senior_blind` (`sos_only`) enforced privacy (`sosOnlyModeConfigured: true`, `noCoordinatesExposedInDependentsList: true`).
- Both temporary sessions were cleanly ended (`POST /api/sessions/:id/end` -> `200`).
- **Screenshots**:
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite6-caregiver-dashboard-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite6-caregiver-monitor-390.png`

### Suite 7: Road Hazard Reports, Volunteer Mapper Graph & Admin Verification
- **Road Report & Corroboration**: `senior_wheelchair` created synthetic hazard report `8f4939cb-d26d-421a-a6d0-d73ccf7b4b43` (`POST /api/reports` -> `201`) at `[110.3775, -7.771]` (isolated from the 4 demo corridors); `senior_blind` corroborated it (`POST /api/reports/:id/corroborate` -> `200`).
- **Volunteer Mapper**: `volunteer` created two synthetic draft nodes (`POST /api/graph/nodes` -> `201`, `201`), connected them with a draft edge (`POST /api/graph/edges` -> `201`), and ran topology validation (`POST /api/graph/validate` -> `200`).
- **Admin Verification & Cleanup**: `admin` inspected `/verification` (`verificationUiContainsDraft: true`) and `/topology` (`pageerrors: []`), then rejected the temporary report, draft edge, and draft nodes (`rejectCleanupStatuses: [200, 200, 200, 200]`) so the local demo routing graph remains untouched.
- **Screenshots**:
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite7-admin-verification-390.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite7-admin-topology-390.png`

### Suite 8: Local-Only SOS Lifecycle (External Notifications Stubbed)
- **R2 Accessibility Fix Verified (`F-001`)**: `/sos` has **`0` unnamed controls** (`sosUnnamedControlsCount: 0`, `unnamedCheckboxFixedInR2: true`), confirming the `SosNoResponderToggle` `aria-labelledby` fix in R2.
- **Local SOS API Lifecycle**:
  - `senior_wheelchair` triggered SOS (`POST /api/sos/trigger` with `triggerType: "manual_button"` -> `201`, `sosId: "5e7197c0-4ec4-4ea9-957b-53f5537d6cab"`).
  - `volunteer` responded (`POST /api/sos/:id/respond` with `responseStatus: "en_route"` -> `201`).
  - `senior_wheelchair` read back status (`GET /api/sos/:id/status` -> `200`, `respondersCount: 1`) and cancelled (`POST /api/sos/:id/cancel` with `reason: "false_alarm"` -> `200`).
- **Screenshot**: `/tmp/unstoppable-qa/core-demo/screenshots/suite8-sos-screen-390.png`

### Suite 9: Voice Settings, Wake Phrase & TTS Hooks
- `/voice-settings` hydrated cleanly (`voiceSettingsHydrated: true`, `wakePhraseControlPresent: true`, `pageerrors: []`).
- Unit tests (`frontend/src/lib/voice/wake-phrase.test.ts` and `speech.test.ts`, part of the 125 passing frontend tests) verify opt-in wake phrase matching (`"Halo Unstoppable"`), `"Berhenti"` stop command cancellation, and recognition pause/resume during active TTS utterance.
- **Hardware Boundary**: Browser `SpeechSynthesis` / `SpeechRecognition` hooks are verified via deterministic mocks and unit tests; physical microphone acoustic wake-phrase capture and hardware speaker output remain **UNVERIFIED** in headless Chromium.
- **Screenshot**: `/tmp/unstoppable-qa/core-demo/screenshots/suite9-voice-settings-390.png`

---

## 4. Suite 10: Responsive Viewport Matrix, 200% Zoom/Text, Keyboard Focus & `axe-core`

### 4.1 Six-Viewport Responsive Matrix (`320x640`, `360x800`, `390x844`, `430x932`, `768x1024`, `1280x800`)
Tested across 7 core routes (`/`, `/login`, `/home`, `/search`, `/ai-planner`, `/sos`, `/settings` = **42 route-viewport combinations**):
- **Accidental Horizontal Overflow (`scrollWidth > innerWidth + 1`)**: **0 / 42** (`horizontalOverflow: false` on every route at every viewport from `320px` to `1280px`).
- **Clipped Interactive Controls**: **0 / 42** (`clippedControls: []` on every route at every viewport).
- **Unnamed Interactive Controls**: **0 / 42** (`unnamedControls: []` on every route at every viewport).
- **Screenshots**:
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite10-home-320x640.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite10-home-360x800.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite10-home-390x844.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite10-home-430x932.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite10-home-768x1024.png`
  - `/tmp/unstoppable-qa/core-demo/screenshots/suite10-home-1280x800.png`

### 4.2 200% Text / Zoom Matrix at `390x844`

| Route | Product `large-text` Mode Overflow | `200%` Root Font (`32px`) Overflow | `200%` CSS Zoom (`zoom: 2`) Overflow | `zoom: 2` Clipped Controls |
|---|---|---|---|---|
| `/` | `false` | `false` | `false` | `0` |
| `/login` | `false` | `false` | `true` (effective width `195px`) | `0` |
| `/home` | `false` | `false` | `true` (effective width `195px`) | `0` |
| `/search` | `false` | `false` | `false` | `0` |
| `/ai-planner` | `false` | `false` | `false` | `0` |
| `/sos` | `false` | `false` | `false` | `0` |
| `/settings` | `false` | `false` | `false` | `0` |

- Screenshot: `/tmp/unstoppable-qa/core-demo/screenshots/suite10-home-large-text-390.png`

### 4.3 Keyboard Focus, Skip Link & Mobile Menu (`390x844`)
- Pressing `Tab` on `/` focuses `<a href="#main">Lewati ke konten utama</a>` first (`skipLinkFocusedFirst: true`).
- Mobile navigation menu button (`Menu navigasi`) opens the drawer and closes cleanly on `Escape` (`mobileMenuClosedOnEscape: true`).
- Screenshot: `/tmp/unstoppable-qa/core-demo/screenshots/suite10-landing-mobile-menu-390.png`

### 4.4 Automated `axe-core` Scan (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`)
- **Critical Violations**: **`0`** across all 7 routes (`/`, `/login`, `/home`, `/search`, `/ai-planner`, `/sos`, `/settings`).
- **Remaining Serious Violation (`1` rule)**: `label-content-name-mismatch` on `.brand[aria-label="Unstoppable, halaman awal"][href="/"]` because the link's visible text contains `"UNSTOPPABLE — Navigasi Kampus Inklusif"` while `aria-label` is `"Unstoppable, halaman awal"`.
- **Important Disclaimer**: Automated `axe-core` checks cover only programmatic DOM rules (~30–40% of WCAG success criteria) and **do not constitute full WCAG 2.1 AA certification**. Real assistive technology (TalkBack/VoiceOver) and physical device ergonomics remain unverified.

---

## 5. Suite 11: Read-Only Production Smoke & Pre-R2 vs Local R2 Comparison

| Check | Deployed Production (`unstoppable-mu.vercel.app` / `duckdns.org`) | Local Merged Staging R2 (`localhost:3000` / `localhost:4000`, `57b29f7`) |
|---|---|---|
| `GET /health` | `200 OK` (`{"status":"ok","db":"ok","speech":"ok"}`) | `200 OK` (`{"status":"ok","db":"ok","speech":"ok"}`) |
| `GET /api/buildings` | `200 OK` (`8` buildings, including `[DEMO]` buildings) | `200 OK` (`5` `[DEMO]` buildings) |
| `/login` Identifier Input Type | `input[type="email"]` (**pre-R2**: blocks phone numbers via browser validation) | `input[type="text"]` (**R2 fixed**: accepts phone or email natively) |
| `/preview` Route Polyline & Runtime Errors | Renders 5-vertex gold line (`#a36a00`) but emits `pageerrors: ["TypeError"]` (**pre-R2**) | Renders 5-vertex gold line (`#a36a00`) with **`pageerrors: []` (0 errors)** |
| `/sos` Unnamed Checkbox (`F-001`) | `1` unnamed `input[type="checkbox"]` (**pre-R2**) | **`0` unnamed controls** (`aria-labelledby` added in R2) |
