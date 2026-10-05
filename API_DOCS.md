# API_DOCS.md — UNSTOPPABLE Backend

---

## Daftar Isi

1. [Konvensi Global](#1-konvensi-global)
2. [Auth](#2-auth-apiauth)
3. [User & Relationship](#3-user--relationship-apiusers)
4. [Accessibility Profile](#4-accessibility-profile)
5. [Route](#5-route-apiroutes)
6. [Narration](#6-narration-apinarration)
7. [Speech](#7-speech-apispeech)
8. [Graph / Mapping](#8-graph--mapping-apigraph)
9. [Verification](#9-verification-apiverification)
10. [Road Report](#10-road-report-apireports)
11. [Building & Score](#11-building--score-apibuildings)
12. [Volunteer](#12-volunteer-apivolunteers)
13. [Companion](#13-companion-apicompanions)
14. [Travel Session](#14-travel-session-apisessions)
15. [SOS](#15-sos-apisos)
16. [AI Planner](#16-ai-planner-apiai-planner)
17. [WebSocket (Socket.io)](#17-websocket-socketio)
18. [Health](#18-health-health)
19. [Tutorial Menjalankan Backend End-to-End](#19-tutorial-menjalankan-backend-end-to-end)
20. [Inventaris Endpoint Lengkap](#20-inventaris-endpoint-lengkap)
21. [Catatan Perbedaan Implementasi ↔ Kontrak](#catatan-perbedaan-implementasi--kontrak)

---

## 1. Konvensi Global

**Base URL:** `{NEXT_PUBLIC_API_BASE_URL}/api` — semua route di-mount di prefix
`/api` **kecuali** `GET /health` (di luar `/api`, di luar rate limiter).

**Content-Type:** `application/json` kecuali upload file
(`multipart/form-data`: reports & `POST /speech/transcribe`) dan audio biner
(`POST /speech/synthesize`).

### 1.1 Bentuk response (amplop standar)

Semua endpoint JSON memakai amplop `ok()/created()/noContent()` dari
`shared/response.ts`:

**Sukses**
```json
{ "success": true, "data": { } }
```

**Gagal** (dari `middleware/error-handler.ts` + `AppError`)
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { } } }
```

> **Pengecualian penting:** `GET /health` **TIDAK** memakai amplop ini —
> ia mengembalikan objek datar `{ status, db, speech, uptimeSec, version }`
> (lihat §18). Ini sesuai kontrak §16.

`error.message` **selalu Bahasa Indonesia** dan layak ditampilkan ke pengguna.
`error.code` untuk logika program FE.

### 1.2 Koordinat

Selalu `[longitude, latitude]` (urutan GeoJSON), di API **dan** di PostGIS
(`ST_MakePoint(lng, lat)`).

```json
{ "type": "Point", "coordinates": [110.3759, -7.7653] }
```

> **Leaflet memakai `[lat, lng]`.** Konversi dilakukan **di frontend**, tidak
> pernah di backend. Ini sumber bug klasik — jangan membalik urutan di backend.

### 1.3 Waktu

ISO 8601 (`TIMESTAMPTZ` di DB), ditampilkan FE dalam WIB (Asia/Jakarta).

### 1.4 Autentikasi

Header: `Authorization: Bearer <accessToken>`. Access token ±15 menit, refresh
7 hari. Pada `401 TOKEN_EXPIRED`, FE memanggil `POST /auth/refresh` lalu
mengulang request; jika refresh gagal → logout.

Socket.io: token dikirim via `auth: { token }` saat handshake (§17).

### 1.5 Role & kapabilitas

- **Role:** `blind_user` | `low_vision`-tidak-ada-sebagai-role (itu profil) |
  `mobility_user` | `caregiver` | `volunteer` | `admin`.
- **Traveler** (`requireTraveler`): `blind_user` | `mobility_user` | `admin`.
- **Mapper** (`requireMapper`): `canMapData = true` **atau** `admin`.
- **Capability** (`requireCapability("canCompanion")`): relawan terverifikasi.
- `admin` umumnya diperlakukan sebagai superuser.

### 1.6 Kode error standar

| HTTP | `code` | Arti |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input tidak valid; `details.fieldErrors` per-field |
| 401 | `UNAUTHENTICATED` | Token tidak ada/tidak valid |
| 401 | `TOKEN_EXPIRED` | Perlu refresh |
| 403 | `FORBIDDEN` | Terautentik tapi tidak berhak |
| 403 | `NOT_VERIFIED` | Relawan belum terverifikasi |
| 404 | `NOT_FOUND` | Resource tidak ada / bukan milik pemanggil |
| 409 | `CONFLICT` | Bentrok (jadwal relawan, offer ganda, corroborate ulang) |
| 422 | `ROUTE_UNREACHABLE` | Rute tak ditemukan untuk profil tsb (**bukan error sistem**) |
| 429 | `RATE_LIMITED` | Terlalu sering; `details.retryAfterSec` |
| 500 | `INTERNAL_ERROR` | Kesalahan server |
| 503 | `SPEECH_UNAVAILABLE` | Microservice STT/TTS tidak merespons |

### 1.7 Rate limiting

Semua `/api/*` lewat `apiLimiter`. Limiter spesifik:
- `verify-otp` → maks 5/nomor/15 menit; `resend-otp` → maks 3/nomor/jam; `login` → `authLimiter`.
- `POST /routes/plan` & `/compare` → `routePlanLimiter`.
- `POST /sessions/:id/location` → `locationPingLimiter` (±1/detik).
- `POST /sos/trigger` → `sosLimiter`.
- `GET /health` di luar `/api` → **tidak** kena rate limit.

---

## 2. Auth (`/api/auth`)

Semua tanpa auth header (ini pintu masuk). PIC: Anthon.

### `POST /auth/register`
- **Auth:** tidak perlu.
- **Request** (`registerSchema`): `{ phoneNumber, name, role, password }`.
  `role` ∈ `blind_user` | `mobility_user` | `caregiver` | `volunteer`.
- **Response 201:**
```json
{ "success": true, "data": { "userId": "uuid", "otpSentTo": "0812****7890", "expiresInSec": 300 } }
```
- **Error:** `400 VALIDATION_ERROR`.
- **FE:** setelah ini arahkan ke layar input OTP; tampilkan `otpSentTo` yang sudah ter-mask.

### `POST /auth/verify-otp`
- **Auth:** tidak perlu. Rate limit ketat (5/nomor/15 menit).
- **Request** (`verifyOtpSchema`): `{ phoneNumber, otp }`.
- **Response 200:**
```json
{ "success": true, "data": { "accessToken": "…", "refreshToken": "…",
  "user": { "id": "uuid", "name": "Budi", "role": "mobility_user", "phoneVerified": true } } }
```
- **FE:** simpan kedua token; `user` dipakai untuk routing awal.

### `POST /auth/resend-otp`
- **Auth:** tidak perlu. Rate limit 3/nomor/jam.
- **Request** (`resendOtpSchema`): `{ phoneNumber }`.
- **Response 200:** amplop sukses (OTP baru dikirim).

### `POST /auth/login`
- **Auth:** tidak perlu. Lewat `authLimiter`.
- **Request** (`loginSchema`): `{ phoneNumber, password }`.
- **Response 200:** sama bentuknya dengan `verify-otp` (token + user).

### `POST /auth/refresh`
- **Request** (`refreshSchema`): `{ refreshToken }`.
- **Response 200:** `{ "success": true, "data": { "accessToken": "…", "refreshToken": "…" } }`.
- **FE:** panggil otomatis saat `TOKEN_EXPIRED`, lalu ulang request asal.

### `POST /auth/logout`
- **Request** (`logoutSchema`): `{ refreshToken }`.
- **Response 204** (tanpa body). Membatalkan refresh token.

---

## 3. User & Relationship (`/api/users`)

Semua endpoint **wajib login** (`usersRouter.use(requireAuth)`). PIC: Sofi.

### `GET /users/me`
- **Response 200** — nomor telepon & nomor darurat ter-mask:
```json
{
  "success": true,
  "data": {
    "id": "uuid", "name": "Budi", "phoneNumber": "0812****7890",
    "role": "mobility_user", "profilePhotoUrl": null,
    "accessibilityProfiles": [
      { "profileId": "wheelchair", "label": "Pengguna kursi roda",
        "isPrimary": true, "toleranceOverrides": { "max_steps": 0 } }
    ],
    "volunteerProfile": null,
    "blindProfile": null
  }
}
```
- **FE:** `accessibilityProfiles[].label` sudah datar (bukan objek bersarang);
  `emergencyContactPhone` (bila ada di `blindProfile`) dikirim ter-mask.

### `PATCH /users/me`
- **Request** (`patchMeSchema`): hanya `name`, `profilePhotoUrl`, `blindProfile.*`.
  `role`/`canMapData`/`canCompanion` **tidak** bisa diubah di sini.
- **Response 200:** bentuk sama dengan `GET /users/me`.
- **Error:** `400 VALIDATION_ERROR`.

### `POST /users/me/caregivers`
- **Request** (`addCaregiverSchema`):
```json
{ "caregiverPhone": "08…", "relationshipType": "primary", "locationSharingMode": "sos_only" }
```
  `relationshipType` ∈ `primary` | `secondary`;
  `locationSharingMode` ∈ `always` | `sos_only` | `off` (default `sos_only`).
- **Response 201:** relasi caregiver yang dibuat.

### `GET /users/me/caregivers`
- **Response 200:** daftar caregiver tertaut milik user.

### `DELETE /users/me/caregivers/:id`
- **Response 204.** Hanya relasi milik pemanggil.

### `GET /users/me/dependents`
- **Auth tambahan:** `requireRole(["caregiver", "admin"])`.
- **Response 200:**
```json
{ "success": true, "data": [
  { "userId": "uuid", "name": "Budi", "relationshipType": "primary",
    "locationSharingMode": "sos_only", "activeSession": { "id": "uuid", "status": "active" } } ] }
```
- **Error:** `403 FORBIDDEN` untuk role selain caregiver/admin.

---

## 4. Accessibility Profile

Dua router: `GET /api/profiles` (publik) + `/api/users/me/accessibility` (ber-auth). PIC: Anthon.

### `GET /profiles`
- **Auth:** **tidak perlu** (dipakai saat onboarding).
- **Response 200:**
```json
{ "success": true, "data": [
  { "id": "blind", "label": "Tunanetra", "primaryChannel": "audio", "displayOrder": 1 },
  { "id": "low_vision", "label": "Low vision", "primaryChannel": "audio", "displayOrder": 2 },
  { "id": "wheelchair", "label": "Pengguna kursi roda", "primaryChannel": "visual", "displayOrder": 3 },
  { "id": "crutches", "label": "Pengguna kruk/walker", "primaryChannel": "visual", "displayOrder": 4 } ] }
```
- **Catatan:** `weightConfig` **tidak** dikirim ke FE (detail internal routing).

### `GET /users/me/accessibility`
- **Auth:** wajib. **Response 200:** profil aksesibilitas user saat ini.

### `PUT /users/me/accessibility`
- **Auth:** wajib.
- **Request** (`putAccessibilitySchema`):
```json
{ "profiles": [ { "profileId": "wheelchair", "isPrimary": true,
  "toleranceOverrides": { "max_steps": 3, "max_slope_percent": 10 } } ] }
```
  `toleranceOverrides` dikenali (**snake_case**, sesuai kontrak §4):
  `max_steps` (int 0–30), `max_slope_percent` (number 0–15),
  `min_width_cm` (int 0–200), `avoid_uncovered` (boolean).
- **Error:** nilai di luar rentang → `400 VALIDATION_ERROR`.
- **FE:** kirim `toleranceOverrides` dalam snake_case — ini berlaku end-to-end di
  routing (weight-builder). camelCase tidak dikenali.

---

## 5. Route (`/api/routes`)

Semua **wajib login + traveler** (`requireAuth` + `requireTraveler`). PIC: Nafal.
`/plan` & `/compare` lewat `routePlanLimiter`.

### `POST /routes/plan` ⭐
- **Request:**
```json
{
  "origin":      { "type": "Point", "coordinates": [110.3759, -7.7653] },
  "destination": { "type": "Point", "coordinates": [110.3772, -7.7661] },
  "profileId": "wheelchair",   // opsional; default = profil primer user
  "includeNarration": true     // opsional; default false
}
```
- **Response 200 (reachable):** objek rute lengkap — `reachable`, `profileId`,
  `totalDistanceM`, `estimatedDurationMin`, `edgeIds[]`, `geometry` (LineString
  `[lng,lat]`), `steps[]` (order, edgeId, instruction, distanceM, attributes,
  warnings), `barriers[]`, `dataFreshness`. Field `narration` **hanya** ada bila
  `includeNarration: true` (Route Service memanggil Narration template builder;
  fakta tetap dari data).
- **Response 422 `ROUTE_UNREACHABLE`** (bukan error sistem):
```json
{ "success": false, "error": { "code": "ROUTE_UNREACHABLE",
  "message": "Tujuan ini belum bisa dijangkau secara mandiri dengan kursi roda.",
  "details": { "profileId": "wheelchair", "reasons": [ … ],
    "nearestReachablePoint": { "type": "Point", "coordinates": [110.3770,-7.7660] },
    "suggestion": "request_companion" } } }
```
- **FE:** tangani 422 sebagai layar khusus (tampilkan alasan + tombol "Ajukan
  pendampingan"), **bukan** layar error. Konversi geometry ke `[lat,lng]` untuk Leaflet.

### `POST /routes/compare`
- **Request:** `{ origin, destination, profileIds: ["wheelchair", "blind"] }`.
- **Response 200:** `{ data: { results: [...], differences: [...] } }`.
  `differences[].type` ∈ `avoided_edge` | `extra_distance` | `different_entrance` | `unreachable`.
- **FE:** `differences` dipakai untuk kalimat penjelas di layar pembanding.

### `GET /routes/saved`
- **Auth:** wajib + traveler + terikat kepemilikan (`userId` dari token).
- **Response 200:** daftar rute favorit user, terbaru dulu (lihat kontrak §5
  untuk bentuk item: `id, name, origin, destination, edgeIds, profileId, createdAt`).

### `POST /routes/saved`
- **Request:** `{ name (1–120), origin, destination, edgeIds? (default []), profileId? }`.
- **Response 201:** rute tersimpan lengkap.
- **Error:** `400 VALIDATION_ERROR` (name wajib, GeoJSON Point, edgeIds string angka,
  profileId harus dikenal).

### `DELETE /routes/saved/:id`
- **Response 200:** `{ "success": true, "data": { "deleted": true, "id": "uuid" } }`.
- **Error:** rute tak ada / bukan milik pemanggil → `404 NOT_FOUND` (tidak membocorkan rute orang lain).

> **Catatan status:** Task 8 refaktor sempat mengusulkan menghapus `/routes/saved`
> dari kontrak, tetapi keputusan akhir **dipertahankan** — endpoint ini tetap
> ada di implementasi dan di kontrak §5.

---

## 6. Narration (`/api/narration`)

PIC: Nafal.

### `POST /narration/route`
- **Auth:** wajib + traveler (`requireAuth` + `requireTraveler`).
- **Request** (`narrateRouteSchema`): `{ steps: [ /* steps dari /routes/plan */ ], profileId }`.
- **Response 200:**
```json
{ "success": true, "data": { "narration": "Jalan lurus sekitar 40 meter…", "generatedBy": "template" } }
```
  `generatedBy` ∈ `template` | `llm`. Bila LLM gagal/timeout → fallback ke
  template, tetap `200` (narasi tidak boleh gagal total).
- **Catatan:** fakta (jarak, jumlah anak tangga, arah) selalu dari data; LLM
  hanya merangkai kalimat.

---

## 7. Speech (`/api/speech`)

PIC: Nafal. Keduanya **wajib login + traveler**.

### `POST /speech/synthesize` → audio
- **Request** (`synthesizeSchema`): `{ text, speedPercent?: 100, lang?: "id-ID" }`.
- **Response:** `audio/mpeg` (biner) atau `{ "audioUrl": "…" }`.
- **Error:** `503 SPEECH_UNAVAILABLE` bila microservice mati.
- **FE:** wajib punya fallback ke Web Speech API browser saat `503`.

### `POST /speech/transcribe` → teks
- **Request:** `multipart/form-data` field `audio` (maks 10 MB; MulterError → `400 VALIDATION_ERROR`).
- **Response 200:** `{ "data": { "text": "saya mau ke perpustakaan", "confidence": 0.92 } }`.
- **Error:** `503 SPEECH_UNAVAILABLE`.

---

## 8. Graph / Mapping (`/api/graph`)

PIC: Nael. `GET` publik untuk data `approved`; mutasi butuh `requireMapper`
(`canMapData` atau `admin`). Perilaku berbeda relawan vs admin: lihat kontrak §7.

| Method & Path | Auth | Catatan |
|---|---|---|
| `GET /graph/nodes?bbox=&floorLevel=&status=` | publik | default `status=approved`; mapper boleh `draft` |
| `POST /graph/nodes` | mapper | relawan → `status: draft`; admin → `approved` + audit |
| `PATCH /graph/nodes/:id` | mapper | ubah `approved` → usulan verifikasi; `isOperational` berlaku langsung |
| `DELETE /graph/nodes/:id` | mapper | relawan: hanya draft miliknya; admin: apa pun |
| `GET /graph/edges?bbox=&floorLevel=&status=` | publik | — |
| `POST /graph/edges` | mapper | sama pola node |
| `PATCH /graph/edges/:id` | mapper | sama pola node |
| `DELETE /graph/edges/:id` | mapper | relawan: hanya draft miliknya |
| `GET /graph/coverage` | publik | ringkasan cakupan per gedung |
| `POST /graph/validate` | mapper | validasi topologi sebelum submit |

Bentuk response node/edge/coverage/validate: lihat kontrak §7 (field `attributes`
edge: `surfaceType, widthCm, hasStairs, stepCount, slopePercent, hasGuidingBlock,
guidingBlockCondition, hasHandrail, isCovered, isIndoor, isOneWay`).
Jenis `issues` pada `/validate`: `orphan_node` | `floor_gap` | `zero_length_edge`
| `duplicate_edge` | `disconnected_component` | `missing_attribute`.

> **Jangan pernah mengarang data aksesibilitas.** Node/edge survei asli punya
> `surveyedAt` terisi; seed dev `surveyedAt = null`.

---

## 9. Verification (`/api/verification`)

PIC: Nael. **Seluruh router** `requireAuth + requireRole(["admin"])`.

### `GET /verification/queue?type=&page=`
- **Response 200:** daftar item antrean + `meta` paginasi:
```json
{ "data": [ { "id": "uuid", "itemType": "edge", "itemId": "101", "changeType": "create",
  "submittedBy": { "id": "uuid", "name": "Rina" }, "submittedAt": "…",
  "preview": { … }, "currentValue": null } ], "meta": { "page": 1, "total": 12 } }
```
  `itemType` ∈ `node` | `edge` | `report_effect`; `changeType` ∈ `create` | `update`.

### `POST /verification/:id/approve`
- **`:id` ber-prefix:** `"node:<id>"`, `"edge:<id>"`, atau `"report_effect:<id>"`
  — satu bentuk route tunggal (route ganda `/:type/:id/...` lama **dihapus**).
- **Response 200:** amplop sukses.

### `POST /verification/:id/reject`
- **Request:** `{ "reason": "…" }` (**wajib** untuk reject).
- **Response 200:** amplop sukses.

---

## 10. Road Report (`/api/reports`)

PIC: Anthon.

### `POST /reports`
- **Auth:** wajib (`requireAuth`).
- **Request:** `multipart/form-data` → field `data` (JSON **string**) + `photos[]` (maks 3, 5 MB/foto).
  Isi `data`:
```json
{ "location": { "type": "Point", "coordinates": [110.3765,-7.7658] },
  "category": "guiding_block_rusak", "severity": "high",
  "description": "Guiding block pecah ±5 meter.", "edgeId": "117" }
```
  `category` ∈ `guiding_block_rusak` | `guiding_block_hilang` | `terhalang` |
  `konstruksi` | `lift_rusak` | `ramp_terhalang` | `permukaan_rusak` |
  `genangan` | `tanpa_penyeberangan` | `lainnya`.
  `severity` ∈ `low` | `medium` | `high`.
- **Response 201:** laporan yang dibuat. Bila `edgeId` kosong, backend coba
  kaitkan otomatis ke edge terdekat dalam 15 m (`ST_DWithin`).
- **Error:** foto > 5 MB atau > 3 file → `400 VALIDATION_ERROR` (field `photos`).
- **Efek realtime:** memicu `report:nearby` ke pengguna aktif di sekitar (§17).

### `GET /reports/nearby?lng=&lat=&radiusM=1000&status=active`
- **Auth:** tidak diwajibkan di route (publik). Validasi query `nearbyQuerySchema`.
- **Response 200:** laporan dalam radius.

### `GET /reports/along-route?edgeIds=101,102,117`
- **Response 200:** hambatan di sepanjang rute aktif (dipakai FE untuk overlay).

### `POST /reports/:id/corroborate`
- **Auth:** wajib (`requireAuth`).
- **Response:** amplop sukses. Satu user satu kali per laporan.
- **Error:** corroborate ulang → `409 CONFLICT`; menguatkan laporan sendiri → `403 FORBIDDEN`.

---

## 11. Building & Score (`/api/buildings`)

PIC: Anthon. Publik.

### `GET /buildings?faculty=`
- **Response 200:** daftar gedung (filter opsional `faculty`).

### `GET /buildings/:id`
- **Response 200:** detail gedung + `scoreBreakdown` (`entrance`, `verticalAccess`,
  `paths`, `facilities`), `accessibilityScore`, `hasLift`, `hasAccessibleToilet`,
  `floorCount`, `location`, `surveyedAt`.

### `GET /buildings/:id/barriers`
- **Response 200:** daftar hambatan terdata di gedung (halaman advokasi/ekspor).

---

## 12. Volunteer (`/api/volunteers`)

PIC: Sofi. **Seluruh router** `requireAuth`.

### `POST /volunteers/apply`
- **Auth tambahan:** `requireRole(["blind_user", "mobility_user"])` (hanya
  pengguna disabilitas yang boleh mendaftar relawan; admin sengaja tidak diikutkan).
- **Request** (`applySchema`): `{ motivation, idCardUrl, serviceAreaNote }`.
- **Response:** membuat `VolunteerProfile` `verificationStatus: "pending"`;
  `canCompanion`/`canMapData` tetap `false` sampai diverifikasi admin.

### `GET /volunteers/me`
- **Response 200:** `{ data: { verificationStatus, canCompanion, canMapData,
  ratingAvg, totalHelps, isActive } }`.

### `PATCH /volunteers/me`
- **Request** (`patchMeSchema`): hanya `isActive`.

### `POST /volunteers/availability` · `GET /volunteers/availability` · `DELETE /volunteers/availability/:id`
- **Request POST** (`createAvailabilitySchema`): `{ centerPoint, radiusMeters, dayOfWeek, startTime, endTime }`.

### `GET /volunteers/nearby?lng=&lat=&radiusM=`
- **Internal, dipakai alur SOS.** `radiusM` default 1000, maks 5000. Relawan
  `verified` + aktif yang area layanannya mencakup titik, urut jarak, maks 50.
- **Response 200:** `{ data: [ { id, name, ratingAvg, totalHelps, distanceM } ] }`.
- **Bentuk ini DIBEKUKAN** (dipakai handler SOS) — jangan diubah.

### `POST /volunteers/:id/rate`
- **Request** (`rateSchema`): `{ requestId, rating }`. Hanya requester dari request
  `completed`, sekali per request.
- **Response:** `{ data: { ratingAvg } }`.

### `PATCH /volunteers/:id/verification`
- **Auth tambahan:** `requireRole(["admin"])`.
- **Request** (`reviewVolunteerSchema`): `{ verificationStatus, canCompanion, canMapData }`.
  `verificationStatus` ∈ `verified` | `rejected`; kapabilitas dipaksa `false` bila `rejected`.
- **Response:** profil relawan (bentuk sama `GET /volunteers/me`). Dicatat ke audit log.

---

## 13. Companion (`/api/companions`)

PIC: Sofi. **Seluruh router** `requireAuth`. `GET /open` & `POST .../offer`
butuh `requireCapability("canCompanion")`.

### `POST /companions/requests`
- **Request** (`createRequestSchema`): `destinationName`, `destinationLocation`,
  `meetingPointLocation`, `meetingPointNote`, `scheduledStart`,
  `estimatedDurationMin`, `assistanceTypes[]`, `notes`.
  `assistanceTypes` ∈ `memandu_jalan` | `bantu_kursi_roda` | `bacakan_informasi` | `dampingi_acara`.
- **Response 201:** request yang dibuat.

### `GET /companions/requests`
- **Response 200:** request milik user sendiri (dengan `offerCount`,
  `selectedVolunteer`, `checkins`).

### `GET /companions/open?lng=&lat=&radiusM=`
- **Auth tambahan:** `canCompanion`. Hanya request `open`, dalam area layanan
  relawan, tidak bentrok jadwal terkonfirmasi.

### `POST /companions/requests/:id/offer`
- **Auth tambahan:** `canCompanion`.
- **Request** (`offerSchema`): `{ message }`.
- **Error:** sudah pernah menawar / jadwal bentrok → `409 CONFLICT`.
- **Efek realtime:** emit `companion:offer` ke pemilik request (§17).

### `GET /companions/requests/:id/offers`
- **Response 200:** daftar offer (hanya pemilik request).

### `POST /companions/requests/:id/select`
- **Request** (`selectSchema`): `{ offerId }`.
- **Response 200:**
```json
{ "data": { "requestId": "uuid", "status": "confirmed",
  "selectedVolunteer": { "id": "uuid", "name": "Rina" } } }
```
- **Efek:** status → `confirmed`; offer terpilih → `selected`, lain → `not_selected`;
  reminder H-1 dijadwalkan.
- **Efek realtime (§17):**
  - `companion:confirmed` → relawan terpilih + requester + **caregiver tertaut**;
  - `companion:selected` → relawan terpilih;
  - `companion:not_selected` → tiap relawan yang tidak terpilih.
- **Error:** bukan pemilik → `403 FORBIDDEN`; request bukan `open` atau relawan
  terpilih sudah terkonfirmasi di slot bentrok → `409 CONFLICT` (atomic:
  transaksi + penguncian baris + constraint DB; dua requester tidak bisa dua-duanya berhasil).

### `POST /companions/requests/:id/checkin`
- **Request** (`checkinSchema`): `{ checkinType, location }`. `completed` hanya
  tercapai kalau **kedua pihak** check-in `complete`.

### `POST /companions/requests/:id/cancel`
- **Request** (`cancelSchema`): `{ reason }`.

---

## 14. Travel Session (`/api/sessions`)

PIC: Nael. **Seluruh router** `requireAuth`; `userId` **selalu** dari
`req.user!.id` (tak ada lagi fallback `req.body.userId`/header `x-user-id`).

### `POST /sessions/start`
- **Request:** `{ origin, destination, destinationName, edgeIds, profileId, estimatedArrival }`.
  `origin`/`destination` menerima GeoJSON Point `[lng,lat]` **atau** `{lat,lng}`.
- **Response 201:** sesi yang dibuat.
- **Error:** origin/destination tidak valid → `400 VALIDATION_ERROR`.

### `POST /sessions/:id/location` · `PATCH /sessions/:id/location`
- **Keduanya tersedia** (POST & PATCH memetakan ke handler yang sama).
  Lewat `locationPingLimiter` (±1/detik). Fallback saat WebSocket putus.
- **Request:** `{ location: { type:"Point", coordinates:[lng,lat] }, accuracyM }`
  (menerima juga `{lat,lng}`).
- **Response 201:** ping yang tercatat.
- **Error:** sesi bukan milik user → `404 NOT_FOUND`; lokasi invalid → `400`.

### `POST /sessions/:id/end`
- **Request:** `{ status?: "completed"|"cancelled", destinationName? }`.
- **Response 200:** hasil akhir sesi.
- **Error:** status selain completed/cancelled → `400`; sesi bukan milik user → `404`.

### `GET /sessions/:id/summary`
- **Izin:** pemilik sesi, atau caregiver yang berhak (`assertCanViewLocation`).
- **Response 200:**
```json
{ "data": { "durationMin": 11, "distanceM": 420, "reportsSubmitted": 1,
  "sosTriggered": false, "completedAt": "…" } }
```
- **Error:** `404 NOT_FOUND`; caregiver tak berhak → `403 FORBIDDEN`.

---

## 15. SOS (`/api/sos`)

PIC: Nafal. **Jangan pernah gagal senyap.**

### `POST /sos/trigger`
- **Auth:** `requireAuth` + `requireTraveler` + `sosLimiter`.
- **Request** (`triggerSosSchema`): `{ sessionId: "uuid"|null, triggerType, location }`.
- **Response 201:**
```json
{ "data": { "sosId": "uuid", "notifiedVolunteers": 4, "notifiedCaregivers": 1, "status": "active" } }
```
- **Catatan kritis:** bila tak ada relawan/caregiver, tetap `201` dengan
  `notifiedVolunteers: 0` — FE **wajib** memberi tahu pengguna eksplisit +
  menampilkan nomor darurat. Jangan gagal senyap.
- **Efek realtime (§17):** `sos:new` ke relawan dalam radius (`distanceM`
  per-relawan), `sos:triggered` ke caregiver tertaut.

### `POST /sos/:id/cancel`
- **Auth:** `requireAuth` + `requireTraveler`.
- **Request** (`cancelSosSchema`): `{ reason }` (mis. `"false_alarm"`).
- **Response 200:** `{ "data": { "status": "cancelled" } }`. Memicu `sos:resolved` (§17).

### `POST /sos/:id/respond`
- **Auth:** `requireAuth` + `requireVolunteer`.
- **Request** (`respondSosSchema`): `{ responseStatus }` ∈ `accepted` | `en_route` | `arrived` | `declined`.
- **Response 201:** respons tercatat. Memicu `sos:update` ke pemilik insiden (§17).

### `GET /sos/:id/status`
- **Izin:** pemilik insiden, caregiver berhak, atau relawan yang sudah merespons.
- **Response 200:**
```json
{ "data": { "status": "responded", "escalationLevel": 1,
  "responders": [ { "id": "uuid", "name": "Rina", "status": "accepted",
    "etaMin": 4, "distanceM": 320 } ], "createdAt": "…" } }
```
  `responders[].distanceM` terisi; `etaMin` dapat `null` bila tak ada basis estimasi.
- **Error:** `404 NOT_FOUND`; tak berhak → `403 FORBIDDEN`.

---

## 16. AI Planner (`/api/ai-planner`)

PIC: Nafal. **Seluruh router** `requireAuth`; identitas dari token, kepemilikan
percakapan dicek per request. Prasyarat server: `GEMINI_API_KEY` (model
`gemini-3.5-flash-lite`). Tanpa key, endpoint pemanggil LLM → `500 INTERNAL_ERROR`
dengan pesan AI Planner belum dikonfigurasi.

### `POST /ai-planner/conversations`
- **Request:** tanpa body.
- **Response 201:** `{ data: { id, userId, status: "active", createdAt, completedAt: null } }`.
  `status` ∈ `active` | `completed` | `abandoned`.

### `POST /ai-planner/conversations/:id/message`
- **Request:** `{ content (string non-kosong), inputMode?: "text"|"voice" (default text) }`.
- **Response 200:** `{ data: { userMessage, assistantMessage, extraction, readyToConfirm } }`.
  `extraction.matchSource` ∈ `preference` | `building` | `node` | `null`;
  `destinationLocation` GeoJSON Point `[lng,lat]` atau `null`;
  `readyToConfirm` true hanya bila lokasi tercocokkan.
- **Error:** `404 NOT_FOUND`, `403 FORBIDDEN`, `409 CONFLICT` (status bukan `active`), `400 VALIDATION_ERROR`.

### `GET /ai-planner/conversations/:id`
- **Response 200:** percakapan + `messages[]` (urut createdAt naik) + `extractions[]`.
- **Error:** `404 NOT_FOUND`, `403 FORBIDDEN`.

### `POST /ai-planner/conversations/:id/confirm`
- **Request (semua opsional):** `{ destinationText, destinationLocation, plannedTime, resultingSessionId }`.
  Nama + lokasi final wajib ada dari body atau ekstraksi terakhir; kalau kosong → `400`.
  `destinationLocation` divalidasi GeoJSON Point (lng −180..180, lat −90..90).
- **Response 200:** `{ data: { conversation (status: "completed"), confirmedDestination } }`.
  Menautkan `resultingSessionId` dan menaikkan `user_place_preferences`.

### `GET /ai-planner/preferences`
- **Response 200:** daftar tempat yang pernah dikonfirmasi, urut `visitCount`
  lalu `lastVisitedAt`, maks 20: `{ id, placeName, placeLocation, visitCount, lastVisitedAt }`.

---

## 17. WebSocket (Socket.io)

PIC: Nafal. **Koneksi:** `{NEXT_PUBLIC_SOCKET_URL}`, auth via `auth: { token }`
saat handshake. Token invalid/absen → koneksi **ditolak** (`UNAUTHENTICATED`,
sebelum handler mana pun terpasang).

### 17.1 Room

| Room | Anggota |
|---|---|
| `user:{userId}` | Pengguna itu sendiri (semua perangkatnya) |
| `session:{sessionId}` | Pengguna + caregiver yang berhak (via `assertCanViewLocation`) |

> Socket **otomatis join `user:{userId}`** segera setelah handshake
> terautentikasi (`realtime/index.ts`) — `userId` dari token, bukan payload
> klien. Klien **tidak perlu** mengirim event apa pun untuk mulai menerima
> `companion:*`, `sos:update`, `report:nearby`, dll.

### 17.2 Event client → server

| Event | Payload | Catatan |
|---|---|---|
| `location:update` | `{ sessionId, coordinates: [lng,lat], accuracyM? }` | Server verifikasi `sessionId` milik pengirim; payload invalid → `location:update:error` |
| `session:join` | `sessionId` (string) | Join room sesi bila pemilik atau caregiver berhak; gagal → `session:join:error` |
| `session:leave` | `sessionId` (string) | Keluar room sesi |
| `session:heartbeat` | `{ sessionId }` | Update `last_ping_at`; invalid/bukan milik → `session:heartbeat:error` |
| `sos:respond` | `{ sosId, responseStatus }` | Alternatif REST; `volunteerId` dari token. Ack: `sos:respond:ack`; gagal: `sos:respond:error` |
| `sos:subscribe` | — | **No-op idempoten** (kompatibilitas klien lama); room `user:{id}` sudah auto-join |

### 17.3 Event server → client

| Event | Payload | Penerima |
|---|---|---|
| `location:shared` | `{ sessionId, userId, coordinates, recordedAt }` | Caregiver yang berhak (per `locationSharingMode`) |
| `session:check` | payload bebas | Pengguna + caregiver di room sesi (dead man's switch) |
| `alert:area` | payload bebas | Room sesi |
| `sos:new` | `{ sosId, user:{id,name}, coordinates, distanceM, triggerType }` | Relawan dalam radius (`distanceM` per-relawan) |
| `sos:triggered` | `{ sosId, userId, user:{id,name}, sessionId, triggerType, coordinates, createdAt }` | Caregiver tertaut (lihat catatan penyimpangan) |
| `sos:update` | `{ sosId, status, escalationLevel, responders }` | Pengguna + caregiver |
| `sos:resolved` | `{ sosId, resolvedAt }` | Pengguna + caregiver |
| `companion:offer` | `{ requestId, offerId, volunteer }` | Pemilik permintaan |
| `companion:confirmed` | `{ requestId, volunteer, scheduledStart }` | Relawan terpilih + requester + caregiver tertaut |
| `companion:selected` | `{ requestId, scheduledStart }` | Relawan terpilih |
| `companion:not_selected` | `{ requestId }` | Relawan yang tidak terpilih |
| `companion:reminder` | `{ requestId, scheduledStart }` | Requester + relawan terpilih (H-1, via job) |
| `report:nearby` | `{ reportId, coordinates, category, severity }` | Pengguna dalam perjalanan di sekitar laporan (pelapor dikecualikan) |

> **Penyimpangan terdokumentasi:** `sos:triggered` **tidak** tercantum di kontrak
> §15.3 — dipertahankan sebagai notifikasi caregiver ringan (lebih ringkas dari
> `sos:update`) untuk kompatibilitas FE yang sudah mengonsumsinya. `sos:update`
> tetap jalur utama. `alert:area` juga helper internal (tidak di §15.3 kontrak).

### 17.4 Aturan wajib

- WebSocket **bukan** satu-satunya jalur. Semua aksi kritis (SOS, lokasi) punya
  padanan REST — jika socket putus, FE jatuh ke REST polling.
- Server memvalidasi `sessionId` benar milik pengirim sebelum memproses `location:update`.

---

## 18. Health (`/health`)

PIC: Nafal. **Di luar `/api`**, publik, tanpa auth, tanpa rate limit.

### `GET /health`
- **Response 200 — objek DATAR (bukan amplop `{success,data}`):**
```json
{ "status": "ok", "db": "ok", "speech": "ok", "uptimeSec": 12345, "version": "1.0.0" }
```
  - `status`: selalu `"ok"` (endpoint sendiri tidak pernah 500).
  - `db`: `"ok"` | `"down"` — probe `SELECT 1` (timeout 2 dtk).
  - `speech`: `"ok"` | `"down"` — ping `SPEECH_SERVICE_URL/healthz` (timeout 2 dtk);
    `"down"` bila env tak diset / tak terjangkau.
  - `uptimeSec`: `process.uptime()` dibulatkan ke bawah.
  - `version`: dari `package.json` (saat ini `1.0.0`), `"unknown"` bila gagal baca.
- **FE/ops:** cek cepat kesiapan sebelum demo. `version` di implementasi = `1.0.0`
  (kontrak §16 memakai contoh `1.1.0`; nilai nyata ikut `package.json`).

---

## 19. Tutorial Menjalankan Backend End-to-End

Monorepo tiga unit: `backend/`, `frontend/`, `voice-microservices/`. Perintah di
bawah dijalankan **di dalam `backend/`** kecuali disebut lain.

### 19.1 Prasyarat

- Node.js **≥ 22** (`npm test`/Vitest butuh Node modern).
- Akses ke database Supabase (PostgreSQL + PostGIS + pgRouting + pgcrypto).
  Lokal opsional via Docker (`npm run db:up`).
- (Opsional) Python 3 untuk `voice-microservices/` kalau butuh STT/TTS asli.

### 19.2 Variabel lingkungan (`backend/.env`)

Salin `backend/.env.example` → `backend/.env`, lalu isi minimal:

| Variabel | Guna |
|---|---|
| `DATABASE_URL` | Connection string Postgres Supabase (`sslmode=require`) |
| `PORT` | Port server (default `4000`) |
| `FRONTEND_URL` | Origin CORS + Socket.io (default `http://localhost:3000`) |
| `JWT_*` / secret token | Access/refresh token |
| `GEMINI_API_KEY` | Wajib untuk endpoint AI Planner yang memanggil LLM (§16) |
| `SUPABASE_URL` / `SUPABASE_*` | Storage (`@supabase/supabase-js`) foto laporan |
| `SPEECH_SERVICE_URL` | Base URL voice microservice (dipakai `/health` & `/api/speech`) |

> Jangan commit `.env`. Nilai rahasia dirujuk per nama, bukan nilai.

### 19.3 Langkah menjalankan (dev)

```bash
# 1. Install dependency
npm install

# 2. (Opsional) Nyalakan Postgres lokal via docker compose
npm run db:up         # hentikan dengan: npm run db:down

# 3. Generate Prisma Client dari schema
npm run prisma:generate

# 4. Terapkan migrasi (prisma migrate dev)
npm run prisma:migrate

# 5. (Opsional) Smoke test koneksi + ekstensi DB
npm run db:smoke

# 6. Jalankan server dev (tsx watch) — long-running
npm run dev
```

`npm run dev` adalah proses **long-running** (watcher) — jalankan di terminal
terpisah / background, jangan menunggu ia selesai. Server listen di `PORT`
(default 4000); log menampilkan `Server running on port 4000` dan
`[cron] Semua job terjadwal terdaftar.`

### 19.4 Build & produksi

```bash
npm run build         # tsc → dist/
npm start             # jalankan dist/index.js
```

### 19.5 Test

```bash
npm test              # Vitest sekali jalan (bukan watch)
```

### 19.6 Verifikasi cepat

```bash
# Health (tanpa auth, di luar /api)
curl http://localhost:4000/health
# → { "status":"ok", "db":"ok", "speech":"...", "uptimeSec":..., "version":"1.0.0" }
```

### 19.7 Voice microservice (opsional, untuk `/api/speech` asli)

Di `voice-microservices/`:

```bash
pip install -r requirements.txt
uvicorn app.main:app        # long-running; atau jalankan via Docker
```

Set `SPEECH_SERVICE_URL` di `backend/.env` ke base URL microservice ini agar
`/health.speech` → `ok` dan `/api/speech/*` meneruskan ke STT/TTS. Jika microservice
mati, `/api/speech/*` membalas `503 SPEECH_UNAVAILABLE` dan FE jatuh ke Web Speech API.

### 19.8 Deployment

Supabase (DB + storage), Railway (backend + voice microservice), Vercel (frontend).

---

## 20. Inventaris Endpoint Lengkap

Hasil enumerasi setiap `*.routes.ts` + mounting di `index.ts` (**55 route HTTP**
+ WebSocket + `/health`). Semua ter-mount pada prefix `/api` kecuali `/health`.

| Modul | Endpoint |
|---|---|
| **auth** (6) | `POST /auth/register`, `POST /auth/verify-otp`, `POST /auth/resend-otp`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| **users** (6) | `GET /users/me`, `PATCH /users/me`, `POST /users/me/caregivers`, `GET /users/me/caregivers`, `DELETE /users/me/caregivers/:id`, `GET /users/me/dependents` |
| **accessibility-profiles** (3) | `GET /profiles`, `GET /users/me/accessibility`, `PUT /users/me/accessibility` |
| **routes** (5) | `POST /routes/plan`, `POST /routes/compare`, `GET /routes/saved`, `POST /routes/saved`, `DELETE /routes/saved/:id` |
| **narration** (1) | `POST /narration/route` |
| **speech** (2) | `POST /speech/synthesize`, `POST /speech/transcribe` |
| **graph** (10) | `GET/POST /graph/nodes`, `PATCH/DELETE /graph/nodes/:id`, `GET/POST /graph/edges`, `PATCH/DELETE /graph/edges/:id`, `GET /graph/coverage`, `POST /graph/validate` |
| **verification** (3) | `GET /verification/queue`, `POST /verification/:id/approve`, `POST /verification/:id/reject` |
| **reports** (4) | `POST /reports`, `GET /reports/nearby`, `GET /reports/along-route`, `POST /reports/:id/corroborate` |
| **buildings** (3) | `GET /buildings`, `GET /buildings/:id`, `GET /buildings/:id/barriers` |
| **volunteers** (9) | `POST /volunteers/apply`, `GET /volunteers/me`, `PATCH /volunteers/me`, `POST/GET /volunteers/availability`, `DELETE /volunteers/availability/:id`, `GET /volunteers/nearby`, `POST /volunteers/:id/rate`, `PATCH /volunteers/:id/verification` |
| **companions** (8) | `POST/GET /companions/requests`, `GET /companions/open`, `POST /companions/requests/:id/offer`, `GET /companions/requests/:id/offers`, `POST /companions/requests/:id/select`, `POST /companions/requests/:id/checkin`, `POST /companions/requests/:id/cancel` |
| **sessions** (5) | `POST /sessions/start`, `POST /sessions/:id/location`, `PATCH /sessions/:id/location`, `POST /sessions/:id/end`, `GET /sessions/:id/summary` |
| **sos** (4) | `POST /sos/trigger`, `POST /sos/:id/cancel`, `POST /sos/:id/respond`, `GET /sos/:id/status` |
| **ai-planner** (5) | `POST /ai-planner/conversations`, `POST /ai-planner/conversations/:id/message`, `GET /ai-planner/conversations/:id`, `POST /ai-planner/conversations/:id/confirm`, `GET /ai-planner/preferences` |
| **health** (1) | `GET /health` (di luar `/api`) |

**WebSocket events** — client→server: `location:update`, `session:join`,
`session:leave`, `session:heartbeat`, `sos:respond`, `sos:subscribe` (no-op).
server→client: `location:shared`, `session:check`, `alert:area`, `sos:new`,
`sos:triggered`, `sos:update`, `sos:resolved`, `companion:offer`,
`companion:confirmed`, `companion:selected`, `companion:not_selected`,
`companion:reminder`, `report:nearby`.


TOTAL: 56 API + 19 WebSocket Events
---

