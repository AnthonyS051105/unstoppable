# Pre-Multimodal Core Integration QA Report & Demo Checklist (`qa/integration-report.md`)

- **Date**: `2026-11-17`
- **Evaluated Commit (`origin/staging-frontend`)**: `57b29f7e46a4443ea145864cb2eaaa67e839f74b`
- **Detailed Core Demo Evidence**: See [`qa/core-demo/report.md`](./core-demo/report.md) and [`qa/core-demo/run-core-demo.mjs`](./core-demo/run-core-demo.mjs)

---

## 1. Integrated Release Candidate Status Matrix (Pre-Multimodal Checkpoint)

| Subsystem | Status on Merged Staging (`57b29f7`) | Verified Scope & Evidence | Remaining Limitations / Dependencies |
|---|---|---|---|
| **Backend Build & DB Integration Tests** | **PASS** | `npm run build` (`0`); `33/33` test files, `202/202` tests pass (`0` skipped), including `routes.synthetic-db.test.ts` (8), `routes.geometry-integrity.test.ts` (8), and `demo-release.test.ts` (6). | None on core backend. |
| **Frontend Build, Typecheck & Unit Tests** | **PASS** | `npm run build` (`0`); `npx tsc --noEmit` (`0`); `125/125` unit tests pass (`0` skipped). | `npm run lint` has 2 pre-existing `react-hooks/set-state-in-effect` errors (`ActiveSessionContext.tsx:165`, `journey.tsx:451`). |
| **Auth, Registration, Dev OTP & `authLimiter`** | **PASS** | `/register` -> dev-log 6-digit OTP -> `/otp` -> `/home`; `/login` accepts phone & email via `input[type="text"]`; 7 valid logins pass (`200`), 6th failed attempt blocked (`429 RATE_LIMITED`). | Production SMS/email OTP delivery not triggered (by safety policy). |
| **Role Navigation & Access Gates (5 Roles)** | **PASS** | `senior_wheelchair`, `senior_blind`, `caregiver`, `volunteer`, and `admin` all hydrate `nav[aria-label="Navigasi utama"]` + `main h1/h2` on allowed routes and block denied routes. | None. |
| **4-Profile Pedestrian Routing & `/compare`** | **PASS** | `[DEMO] Halte Kampus Selatan -> [DEMO] Perpustakaan Ramah Lansia` yields 4 distinct paths (`wheelchair`: `110.1 m` edges `157,158`; `crutches`: `128.9 m` edges `159,160`; `low_vision`: `77.8 m` edges `155,156`; `blind`: `179.9 m` edges `161,162`); all `surveyedAt: null`. | Synthetic `[DEMO]` fixture data; not a physical field survey. |
| **Senior Search -> Preview -> Trip -> Arrive -> Save -> History** | **PASS** | `/preview` renders continuous 5-vertex `#a36a00` gold polyline (`M109 130L136 175L174 190L211 175L239 130`) with **`0` `pageerrors`**; route saved to `/saved`; trip completed through `/trip` -> `/arrived` -> `/feedback` -> `/history`. | Deployed production Vercel frontend still runs pre-R2 code where `/preview` emitted `TypeError`. |
| **AI Planner (Live Gemini + Fallback + Unreachable Guard)** | **PASS** | Live Gemini call (`200 OK`, `7610 ms`) extracted `[DEMO] Perpustakaan Ramah Lansia`, `09:30 WIB`, `"butuh jalur guiding block"`, and confirmed route to `/preview` (`200`). Unreachable destination disables confirm button & recommends companion. Simulated `503` shows manual fallback banner. | Live Gemini latency is ~5–8s; manual picker (`Pilih Tujuan Terdata (Tanpa AI)`) provides instant fallback. |
| **Multimodal Transit Routing** | **PENDING SIBLING** | First-mile (`67.4 m`, `edge 163`) and last-mile (`78.3 m`, `edge 164`) pedestrian connectors return `200`; unbridged 4.3 km transit corridor returns `422 ROUTE_UNREACHABLE` on pedestrian-only `/api/routes/plan`. | **Expected**: sibling worker is implementing multimodal transit leg bridging. |
| **Companion Request -> Offer -> Select -> Check-in** | **PASS** | Request (`201`) -> open list (`true`) -> volunteer offer (`201`) -> senior select (`200 confirmed`) -> `/volunteer-schedule` UI -> bilateral `meet` (`201/201`) & `complete` (`201/201 -> completed`). | Tested with isolated local demo accounts. |
| **Caregiver Linking, Monitoring & Privacy** | **PASS** | `caregiver` sees both dependents (`200`); `during_trip` (`senior_wheelchair`) shows active trip on `/caregiver` & `/monitor`; `sos_only` (`senior_blind`) hides live coordinates. | Tested with isolated local demo accounts. |
| **Road Reports, Mapper Graph & Admin Verification** | **PASS** | Report (`201`) + corroboration (`200`); mapper draft nodes/edge (`201`) + topology validation (`200`); admin `/verification` & `/topology` UI + clean rejection (`200`) leaving demo corridors untouched. | Preserved closure node `38` remains untouched. |
| **Local-Only SOS Lifecycle** | **PASS** | `/sos` has `0` unnamed controls (`F-001` fixed); `trigger (201)` -> volunteer `respond en_route (201)` -> `status (200)` -> `cancel false_alarm (200)`. | External SMS/push/email notifications intentionally stubbed. |
| **Voice Wake Phrase, Stop Command & TTS** | **PASS (Mock / Unit)** | `/voice-settings` hydrated with opt-in `"Halo Unstoppable"` toggle; unit tests verify wake/stop/TTS pause-resume. | Physical microphone acoustic wake-phrase capture and hardware speaker output are **UNVERIFIED**. |
| **Responsive Viewport Matrix (320–1280px), 200% Text & `axe-core`** | **PASS WITH MINOR NOTES** | `0` horizontal overflow, `0` clipped controls, and `0` unnamed controls across all 42 route-viewport checks (`320`–`1280px`) and `200%` root font / `large-text` mode. `0` critical `axe-core` violations. | `CSS zoom: 2` at `390px` (effective `195px` width) overflows horizontally on `/login` and `/home`; `axe-core` flags `label-content-name-mismatch` on `.brand`. |

---

## 2. Reproducible Demo Checklist (Local Staging R2)

1. **Pre-Flight Check**:
   - Confirm local backend (`http://localhost:4000/health` -> `200 OK`) and local frontend (`http://localhost:3000` -> `200 OK`) are running against disposable local PostGIS (`127.0.0.1:55439/routing_demo`).
2. **Step 1 — Four-Profile Contrast (`/compare` & `/preview`)**:
   - Log in at `http://localhost:3000/login` as `[DEMO] Lansia Kursi Roda` (`081900110001`).
   - Expand `"Perluas panel beranda"` -> `"Titik asal, perbandingan & opsi rute"`, select origin **`[DEMO] Halte Kampus Selatan`**, and open **`Bandingkan rute`** (`/compare`).
   - Select destination **`[DEMO] Perpustakaan Ramah Lansia`** and compare:
     - `wheelchair` (`110 m`, ramp branch `157 -> 158`) vs `blind` (`180 m`, tactile guiding-block branch `161 -> 162`).
     - `crutches` (`129 m`, covered branch `159 -> 160`) vs `low_vision` (`78 m`, direct stairs shortcut `155 -> 156`).
3. **Step 2 — Senior Search -> Gold 5-Vertex Preview -> Active Trip -> Arrival**:
   - From `/home` (origin `[DEMO] Halte Kampus Selatan`), click **`Cari tujuan perjalanan`** (`/search`), search `"Perpustakaan"`, select **`[DEMO] Perpustakaan Ramah Lansia`**, and click **`Cari rute ke sini`**.
   - On `/preview`, point out the continuous 5-vertex gold route line (`#a36a00`) and honest synthetic data freshness label, click **`Simpan rute`**, then click **`Mulai perjalanan`** (`/trip`) -> **`Berikutnya`** -> **`Selesai`** (`/arrived`).
4. **Step 3 — AI Planner (Live Gemini + Manual Fallback + Unreachable Guard)**:
   - Open **`Bantu rencanakan`** (`/ai-planner`).
   - Type `"Saya ingin pergi ke Perpustakaan Ramah Lansia jam 09:30 pagi, butuh jalur guiding block"` and click **`Kirim`** (or use **`Pilih Tujuan Terdata (Tanpa AI)`** for zero-latency offline/manual selection).
   - Show the extracted destination, `09.30 WIB` planned time, verified route summary, and verified volunteer **`[DEMO] Relawan Pendamping & Pemeta`**.
   - In the manual picker, select **`[DEMO] Paviliun Tangga Lama (Terisolasi)`** to demonstrate the unreachable guard: `"Rute pejalan kaki tidak terjangkau"`, `"Konfirmasi & Mulai Perjalanan"` disabled, and companion badge switched to **`"Disarankan"`**.
5. **Step 4 — Voice Accessibility & Companion / Caregiver Views**:
   - Open **`/voice-settings`** to show the opt-in `"Halo Unstoppable"` wake phrase toggle and speech rate controls.
   - Log in as `[DEMO] Keluarga Pendamping` (`081900110003`) on **`/caregiver`** and **`/monitor`** to show `during_trip` live monitoring vs `sos_only` privacy enforcement.
   - Log in as `[DEMO] Relawan Pendamping & Pemeta` (`081900110004`) on **`/volunteer-schedule`** and **`/mapper`**, or `[DEMO] Admin Verifikator` (`081900110005`) on **`/verification`** and **`/topology`**.

---

## 3. Factual Limitations & Unverified Boundaries

1. **Synthetic Graph & Demo Accounts**: All `[DEMO]` and `[SYNTHETIC routing-v1]` buildings, nodes, edges, and accounts are controlled synthetic fixtures (`surveyedAt: null`, `synthetic: true`, `verifiedSurvey: false`) and must never be represented as field-surveyed campus data.
2. **Multimodal Transit Pending Sibling Merge**: First-mile (`edge 163`) and last-mile (`edge 164`) pedestrian connectors are seeded and verified (`200 OK`), while the transit leg bridging `[DEMO] Terminal Asal Koridor Utara` to `[DEMO] Pusat Layanan Lansia Selatan` is owned by the parallel multimodal transit worker.
3. **Physical Device & Assistive Tech Boundaries**: Automated `axe-core` and Chromium Web Speech API mocks do not replace physical device testing with TalkBack/VoiceOver, real acoustic microphone wake-phrase capture in ambient noise, or OS locked-screen notifications.
4. **Production Deployment Lag**: Deployed production (`https://unstoppable-mu.vercel.app`) has not yet been redeployed with R2 (`57b29f7`); all R2 fixes verified in this report were tested on the local staging build (`http://localhost:3000`).
