# UNSTOPPABLE

Platform navigasi dan pendampingan aksesibilitas untuk penyandang tunanetra, low vision, dan disabilitas mobilitas.

## Daftar Isi

1. [Deskripsi Aplikasi](#1-deskripsi-aplikasi)
2. [Nama Kelompok dan Anggota](#2-nama-kelompok-dan-anggota)
3. [Struktur Folder dan File](#3-struktur-folder-dan-file)
4. [Teknologi yang Digunakan](#4-teknologi-yang-digunakan)
5. [Cara Menjalankan Backend](#5-cara-menjalankan-backend)
6. [URL GDrive Laporan](#6-url-gdrive-laporan)

---

## 1. Deskripsi Aplikasi

UNSTOPPABLE adalah aplikasi web yang membantu penyandang tunanetra, low vision, dan disabilitas mobilitas (pengguna kursi roda dan kruk) berpindah dari satu tempat ke tempat lain dengan aman. Area pilot aplikasi ini adalah Fakultas Teknik dan FMIPA Universitas Gadjah Mada.

Pembeda utama aplikasi ini adalah satu graf jalur hasil survei lapangan yang dihitung dengan bobot berbeda untuk setiap profil kebutuhan. Titik asal dan titik tujuan yang sama dapat menghasilkan rute yang berbeda untuk pengguna kursi roda dan pengguna tunanetra. Aplikasi seperti Google Maps tidak menyimpan lokasi guiding block, ramp, kelandaian trotoar, maupun status lift, dan tidak merutekan di dalam gedung per lantai. Data tersebut tersedia di UNSTOPPABLE karena dikumpulkan sendiri melalui survei lapangan.

Backend pada repository ini menyediakan seluruh layanan sisi server, dengan fitur utama sebagai berikut.

- **Autentikasi.** Registrasi dan login memakai nomor telepon dengan verifikasi OTP, serta access token dan refresh token berbasis JWT. Akses dibatasi berdasarkan role, yaitu `blind_user`, `mobility_user`, `caregiver`, `volunteer`, dan `admin`.
- **Profil aksesibilitas.** Setiap pengguna memiliki profil kebutuhan yang menentukan bobot graf saat rute dihitung.
- **Routing multi profil.** Rute dihitung dengan `pgr_dijkstra` dari pgRouting pada PostgreSQL dengan ekspresi biaya dinamis sesuai profil pengguna. Tersedia juga endpoint pembanding rute dan penyimpanan rute favorit.
- **Narasi rute.** Instruksi rute disusun dari fakta di database seperti jarak, arah, dan jumlah anak tangga. Fakta fisik tidak dikarang oleh AI.
- **Speech.** Backend meneruskan permintaan text to speech dan speech to text ke voice microservice yang terpisah.
- **Peta Editor dan verifikasi.** Pengelolaan node dan edge graf jalur, pengecekan cakupan area, validasi graf, dan antrean verifikasi data.
- **Laporan komunitas.** Pengguna dapat melaporkan kondisi jalan lengkap dengan foto, dan pengguna lain dapat mengonfirmasi laporan tersebut. Laporan yang kedaluwarsa dibersihkan otomatis.
- **Gedung dan skor aksesibilitas.** Informasi gedung, daftar hambatan, dan skor aksesibilitas gedung.
- **Relawan dan pendampingan.** Relawan mendaftar dan mengatur ketersediaan. Pengguna membuat permintaan pendampingan, relawan mengajukan diri, lalu pengguna yang memilih relawan. Relawan tidak pernah ditugaskan otomatis.
- **Travel session dan caregiver monitoring.** Lokasi pengguna dapat dibagikan secara realtime kepada caregiver, dan sesi yang tidak aktif akan terdeteksi oleh scheduler.
- **SOS.** Pengguna dapat memicu SOS, lalu caregiver dan relawan di sekitar menerima notifikasi realtime. Insiden yang tidak direspons akan dieskalasi otomatis.
- **AI Planner.** Percakapan terstruktur berbasis Gemini untuk membantu merencanakan perjalanan.
- **WebSocket.** Komunikasi realtime memakai Socket.io dengan autentikasi token pada handshake.
- **Keamanan.** Header keamanan dengan Helmet, pembatasan CORS, rate limiter per endpoint, validasi input dengan Zod, dan audit log.

Total endpoint HTTP yang tersedia adalah 56 endpoint, ditambah event WebSocket. Dokumentasi lengkap setiap endpoint ada di [API_DOCS.md](API_DOCS.md).

---

## 2. Nama Kelompok dan Anggota

**Nama kelompok:** apaya (K1)

**Anggota kelompok:**

1. Yohanes Anthony Saputra: Project Manager dan Frontend Engineer.
2. Shafiyah Nuril Hayya: Frontend Engineer.
3. Muhammad Nafal Zakin Rustanto: Backend Engineer.
4. Nathanael Satya Saputra: Backend Engineer.

---

## 3. Struktur Folder dan File

Repository ini berbentuk monorepo dengan tiga unit utama, yaitu `backend`, `frontend`, dan `voice-microservices`.

```
unstoppable
├── README.md
├── API_DOCS.md                      Dokumentasi seluruh endpoint HTTP dan WebSocket
├── PRD-UNSTOPPABLE-v1.3.md          Product Requirements Document
├── ERD_UNSTOPPABLE.png              Entity Relationship Diagram
│
├── backend                          Server utama Node.js dan Express
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── prisma.config.ts
│   ├── .env.example                 Contoh variabel lingkungan
│   ├── prisma
│   │   ├── schema.prisma            Skema database
│   │   ├── migrations               Riwayat migrasi database
│   │   ├── accessibility-profiles.seed.ts
│   │   ├── graph.dev.seed.ts        Seed graf khusus development
│   │   ├── road-reports.dev.seed.ts Seed laporan khusus development
│   │   └── smoke.ts                 Smoke test koneksi dan ekstensi database
│   ├── scripts
│   │   └── manual-tests             Skrip uji manual untuk Socket.io dan SOS
│   └── src
│       ├── index.ts                 Entry point, mounting router, Socket.io, dan cron
│       ├── config
│       │   └── prisma.ts            Inisialisasi Prisma Client
│       ├── middleware
│       │   ├── auth.ts              Verifikasi JWT
│       │   ├── rbac.ts              Pembatasan akses berdasarkan role
│       │   ├── rate-limit.ts        Konfigurasi rate limiter
│       │   ├── validate.ts          Validasi request dengan Zod
│       │   └── error-handler.ts     Penanganan error terpusat
│       ├── modules                  Satu folder untuk setiap domain
│       │   ├── auth
│       │   ├── users
│       │   ├── accessibility-profiles
│       │   ├── routes               Perencanaan rute, pembobotan, dan pembuatan langkah
│       │   ├── narration
│       │   ├── speech
│       │   ├── graph
│       │   ├── verification
│       │   ├── reports
│       │   ├── buildings
│       │   ├── volunteers
│       │   ├── companions
│       │   ├── sessions
│       │   ├── sos
│       │   ├── ai-planner
│       │   └── health
│       ├── realtime                 Handler Socket.io untuk sesi, lokasi, SOS, dan alert
│       ├── jobs                     Scheduler node-cron
│       ├── shared                   Utilitas bersama seperti response, error, dan audit log
│       └── tests                    Smoke test rate limiter dan RBAC
│
├── voice-microservices              Microservice Python untuk STT dan TTS
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── app
│   │   ├── main.py                  Aplikasi FastAPI
│   │   ├── auth.py                  Verifikasi header X-Internal-Key
│   │   ├── config.py                Konfigurasi
│   │   ├── stt.py                   Speech to text dengan Whisper
│   │   └── tts.py                   Text to speech dengan Piper
│   └── tests
│       └── test_health.py
│
└── frontend                         Aplikasi Next.js
    ├── package.json
    └── app
```

Setiap folder di dalam `backend/src/modules` mengikuti pola file yang sama.

- `*.routes.ts` mendefinisikan route beserta middleware yang dipakai.
- `*.controller.ts` menangani request dan response.
- `*.schema.ts` berisi skema validasi Zod.
- `*.service.ts` berisi logika bisnis dan akses database.
- `*.test.ts` berisi unit test, sedangkan `*.smoke.test.ts` berisi skrip uji manual yang membutuhkan database sungguhan.

Scheduler pada folder `backend/src/jobs` menjalankan tugas berikut.

- `escalate-sos.job.ts` dan `check-stale-sessions.job.ts` berjalan setiap menit.
- `expire-reports.job.ts` berjalan setiap hari pukul 03.00.
- `cleanup.job.ts` membersihkan data ping lokasi setiap hari pukul 03.10 dan audit log setiap hari Minggu.
- `companion-reminders.job.ts` mengirim pengingat dan menutup permintaan pendampingan yang kedaluwarsa setiap jam.

---

## 4. Teknologi yang Digunakan

### Backend

| Kategori           | Teknologi                                                                           |
| ------------------ | ----------------------------------------------------------------------------------- |
| Runtime dan bahasa | Node.js 22 atau lebih baru, TypeScript                                              |
| Web framework      | Express 5                                                                           |
| Database           | PostgreSQL dengan ekstensi PostGIS dan pgRouting, di-host di Supabase               |
| ORM                | Prisma 7 dengan `@prisma/adapter-pg`, serta raw SQL untuk query geospasial          |
| Realtime           | Socket.io                                                                           |
| Scheduler          | node-cron                                                                           |
| Autentikasi        | jsonwebtoken (JWT), bcrypt, dan OTP                                                 |
| Validasi           | Zod                                                                                 |
| Keamanan           | Helmet, CORS, dan express-rate-limit                                                |
| Upload file        | multer, dengan penyimpanan foto di Supabase Storage melalui `@supabase/supabase-js` |
| AI                 | Google Gemini melalui `@google/genai` untuk AI Planner dan narasi rute              |
| Testing            | Vitest                                                                              |
| Tooling            | tsx dan dotenv                                                                      |

### Voice Microservice

| Kategori             | Teknologi                                             |
| -------------------- | ----------------------------------------------------- |
| Bahasa dan framework | Python 3.11 dan FastAPI                               |
| Speech to text       | faster-whisper (model Whisper)                        |
| Text to speech       | Piper                                                 |
| Server               | Uvicorn                                               |
| Packaging            | Docker, dengan ffmpeg untuk decode audio dari browser |

### Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, React Aria Components, Leaflet dan React Leaflet, serta socket.io-client.

### Deployment

Supabase untuk database dan storage, Railway untuk backend dan voice microservice, serta Vercel untuk frontend.

---

## 5. Cara Menjalankan Backend

Semua perintah berikut dijalankan di dalam folder `backend`. Penjelasan yang lebih lengkap tersedia di bagian 19 pada [API_DOCS.md](API_DOCS.md).

1. Pastikan Node.js versi 22 atau lebih baru sudah terpasang, dan database Supabase sudah mengaktifkan ekstensi PostGIS dan pgRouting.
2. Salin `.env.example` menjadi `.env`, lalu isi variabel berikut.
   - `DATABASE_URL` berisi connection string Postgres dari Supabase.
   - `JWT_SECRET` berisi secret acak untuk penandatanganan token.
   - `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` untuk penyimpanan foto laporan.
   - `SPEECH_SERVICE_URL` dan `SPEECH_SERVICE_API_KEY` untuk menghubungi voice microservice. Nilai API key harus sama dengan `INTERNAL_API_KEY` pada voice microservice.
   - `GEMINI_API_KEY` untuk AI Planner dan narasi rute.
   - `PORT` dan `FRONTEND_URL` bersifat opsional, dengan nilai bawaan `4000` dan `http://localhost:3000`.
3. Jalankan perintah berikut secara berurutan.

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Untuk build produksi, jalankan `npm run build` lalu `npm start`. Untuk unit test, jalankan `npm test`. Untuk mengecek server, buka `GET http://localhost:4000/health`.

Voice microservice dijalankan secara terpisah dari folder `voice-microservices`.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Jika voice microservice tidak aktif, endpoint `/api/speech` akan membalas `503 SPEECH_UNAVAILABLE`, dan frontend menggunakan Web Speech API sebagai cadangan.

---

## 6. URL GDrive Laporan

Laporan Milestone 1 yang sudah diunggah dapat diakses melalui tautan berikut:
https://drive.google.com/file/d/1xi7_pm9osMQzxb75LrBSDJqf4o0nID53/view?usp=sharing
