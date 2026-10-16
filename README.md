# UNSTOPPABLE

**Platform navigasi dan pendampingan agar lansia dapat sampai ke layanan kesehatan dan aktivitas sehari-hari dengan selamat, dan agar keluarga yang merawatnya tidak perlu selalu ikut menemani.**

UNSTOPPABLE adalah aplikasi web sumber terbuka. Aplikasi ini merencanakan rute berdasarkan kondisi fisik setiap lansia, bukan berdasarkan jarak terpendek. Rute dihitung dari satu graf jalur yang dikumpulkan lewat survei lapangan langsung, lengkap dengan data kelandaian, lebar jalur, anak tangga, ramp, lift, dan guiding block.

Area uji metode saat ini adalah Fakultas Teknik dan FMIPA Universitas Gadjah Mada. Metode yang sama dapat diterapkan di area lain, misalnya sekitar puskesmas atau rumah sakit, selama survei lapangannya dilakukan.

---

## Daftar Isi

1. [Mengapa UNSTOPPABLE dibuat](#1-mengapa-unstoppable-dibuat)
2. [Apa yang membedakannya](#2-apa-yang-membedakannya)
3. [Empat profil kondisi lansia](#3-empat-profil-kondisi-lansia)
4. [Fitur utama](#4-fitur-utama)
5. [Siapa saja penggunanya](#5-siapa-saja-penggunanya)
6. [Alur penggunaan](#6-alur-penggunaan)
7. [Cara kerja perutean](#7-cara-kerja-perutean)
8. [Batas klaim produk](#8-batas-klaim-produk)
9. [Arsitektur sistem](#9-arsitektur-sistem)
10. [Teknologi yang digunakan](#10-teknologi-yang-digunakan)
11. [Struktur repository](#11-struktur-repository)
12. [Cara menjalankan di komputer lokal](#12-cara-menjalankan-di-komputer-lokal)
13. [Variabel lingkungan](#13-variabel-lingkungan)
14. [Menjalankan pengujian](#14-menjalankan-pengujian)
15. [Deployment ke produksi](#15-deployment-ke-produksi)
16. [API dan WebSocket](#16-api-dan-websocket)
17. [Aksesibilitas, keamanan, dan privasi](#17-aksesibilitas-keamanan-dan-privasi)
18. [Prinsip data survei](#18-prinsip-data-survei)
19. [Berkontribusi](#19-berkontribusi)
20. [Tim pengembang](#20-tim-pengembang)
21. [Peta jalan](#21-peta-jalan)
22. [Tautan penting](#22-tautan-penting)
23. [Lisensi](#23-lisensi)

---

## 1. Mengapa UNSTOPPABLE dibuat

Layanan kesehatan yang tersedia tidak otomatis berarti terjangkau. Sebuah puskesmas bisa berjarak dua kilometer dari rumah seorang lansia, tetapi menjadi tidak terjangkau karena ada tiga anak tangga di pintu masuk, trotoar terlalu sempit untuk walker, atau lift yang sudah sebulan rusak. Hambatan seperti ini jarang tercatat di mana pun, sehingga tidak pernah muncul dalam perencanaan perjalanan siapa pun.

Peta digital yang ada menjawab pertanyaan tentang lokasi dan jarak. Peta tersebut tidak menjawab pertanyaan yang sebenarnya menentukan bagi seorang lansia, yaitu apakah ibu atau bapak saya bisa sampai ke sana sendiri. OpenStreetMap maupun Google Maps tidak menyimpan kelandaian trotoar, lebar jalur, keberadaan ramp, kondisi guiding block, atau status lift di Indonesia. Rute tercepat yang mereka tawarkan bisa jadi rute yang sama sekali tidak bisa dilalui.

Persoalan ini diperberat oleh satu hal yang sering terlewat, yaitu lansia bukan kelompok yang seragam. Lansia pengguna kursi roda terhenti oleh satu anak tangga, tetapi tidak terganggu oleh jalur yang gelap. Lansia dengan penglihatan menurun bisa menaiki tangga, tetapi tersesat di persimpangan yang tidak memiliki guiding block. Rute yang aman bagi yang satu bisa berbahaya bagi yang lain.

Akibatnya ditanggung oleh dua pihak sekaligus. Lansia menunda atau membatalkan kunjungan kesehatan, bukan karena tidak mau, melainkan karena tidak ada kepastian bahwa perjalanannya bisa diselesaikan. Keluarga yang merawat kehilangan visibilitas. Mereka tidak tahu apakah perjalanan berjalan lancar dan tidak tahu jika terjadi sesuatu di tengah jalan. Satu-satunya cara memastikan adalah ikut menemani, padahal itu tidak selalu mungkin bagi keluarga yang bekerja.

UNSTOPPABLE dibuat untuk mengubah aksesibilitas fisik dari sesuatu yang harus ditebak menjadi sesuatu yang dapat diketahui sebelum berangkat.

## 2. Apa yang membedakannya

Pembeda utama UNSTOPPABLE dapat dirangkum dalam satu kalimat. Aplikasi ini memakai satu graf jalur hasil survei lapangan sendiri, lalu menghitungnya dengan bobot yang berbeda untuk setiap kondisi lansia, sehingga titik asal dan tujuan yang sama menghasilkan rute yang berbeda bagi lansia pengguna kursi roda dan lansia dengan penglihatan menurun.

Beberapa hal yang tidak dilakukan oleh aplikasi peta umum, tetapi dilakukan oleh UNSTOPPABLE, adalah sebagai berikut.

- Menyimpan lokasi guiding block, ramp, kelandaian trotoar, lebar jalur, dan status lift.
- Merutekan di dalam gedung per lantai.
- Menjelaskan secara jujur ketika sebuah tujuan tidak terjangkau secara mandiri, lengkap dengan alasan yang spesifik, lalu menawarkan pendampingan relawan.
- Menyusun narasi rute dari fakta di database, sehingga jumlah anak tangga, arah, jarak, dan status lift tidak pernah dikarang oleh model bahasa.
- Memberi keluarga yang merawat visibilitas perjalanan sesuai izin yang diberikan oleh lansia itu sendiri.

## 3. Empat profil kondisi lansia

Setiap pengguna memilih satu atau lebih profil. Profil inilah yang menentukan bobot graf saat rute dihitung.

| Identitas teknis | Nama yang dilihat pengguna               | Kebutuhan utama                                                                           |
| ---------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `wheelchair`     | Lansia pengguna kursi roda               | Jalur tanpa tangga, ramp yang landai, dan lebar jalur yang memadai                        |
| `crutches`       | Lansia dengan walker atau tongkat        | Masih dapat menaiki beberapa anak tangga, tetapi membutuhkan pegangan dan jalur yang rata |
| `low_vision`     | Lansia dengan penglihatan menurun        | Jalur yang terang, kontras yang jelas, dan panduan suara                                  |
| `blind`          | Lansia dengan gangguan penglihatan berat | Panduan suara dan guiding block sepenuhnya                                                |

Identitas teknis pada kolom pertama sengaja tidak diubah karena dipakai sebagai kunci konfigurasi bobot dan ekspresi biaya di database. Yang berubah dan dibaca pengguna hanyalah nama tampilannya.

## 4. Fitur utama

### Untuk lansia

- **Rute sesuai kondisi.** Perencanaan rute memakai bobot dari profil pengguna, bukan jarak terpendek.
- **Pembanding rute.** Layar pembanding menampilkan dua profil pada titik asal dan tujuan yang sama, disertai panel yang menjelaskan mengapa rutenya berbeda.
- **Panduan suara.** Instruksi rute dibacakan lewat text to speech, dan pengguna dapat mencari tempat dengan suara melalui speech to text.
- **Peta dengan data aksesibilitas.** Peta menampilkan hambatan, laporan komunitas terbaru, dan skor aksesibilitas gedung.
- **Jawaban jujur untuk tujuan yang tidak terjangkau.** Sistem menyebut alasannya, misalnya gedung tidak memiliki lift ke lantai dua, lalu menawarkan pendampingan.
- **Rencana perjalanan dan AI Planner.** Percakapan terstruktur membantu menyusun rencana perjalanan, dan rencana dapat dijadwalkan agar pengingat terkirim.
- **Rute tersimpan dan riwayat.** Tempat dan rute yang sering dipakai dapat disimpan.
- **Tombol SOS.** Satu tombol memberi tahu keluarga dan relawan terdekat secara bersamaan.

### Untuk keluarga yang merawat

- **Pemantauan perjalanan sesuai izin.** Keluarga dapat melihat perjalanan lansia hanya jika lansia memberikan izin.
- **Notifikasi tiga kejadian.** Keluarga menerima pemberitahuan ketika perjalanan dimulai, selesai, atau terhenti tanpa penjelasan.
- **Notifikasi push.** Notifikasi dapat sampai walaupun aplikasi sedang tidak dibuka, melalui Web Push.
- **Satu keluarga, beberapa lansia.** Satu akun keluarga dapat tertaut dengan beberapa lansia melalui undangan.

### Untuk relawan

- **Pendampingan terjadwal.** Lansia membuat permintaan, relawan mengajukan diri, dan lansia sendirilah yang memilih relawan. Relawan tidak pernah ditugaskan otomatis.
- **Check-in dua arah.** Setiap pendampingan memiliki check-in yang harus dikonfirmasi oleh kedua pihak.
- **Respons SOS.** Relawan di sekitar lokasi menerima peringatan secara realtime dan dapat menyatakan kesediaan membantu.
- **Penilaian.** Lansia dapat menilai relawan setelah pendampingan selesai.

### Untuk pemeta dan verifikator

- **Peta Editor.** Pengelolaan node dan edge graf jalur beserta seluruh atributnya.
- **Pengecekan cakupan dan validasi graf.** Memastikan graf terhubung dan tidak memiliki jalur terputus.
- **Antrean verifikasi.** Data baru dan laporan komunitas masuk ke antrean sebelum dipakai oleh sistem perutean.
- **Peninjauan relawan.** Verifikator memeriksa pendaftaran relawan sebelum relawan dapat menerima permintaan.

### Untuk komunitas

- **Laporan hambatan.** Pengguna melaporkan kondisi jalan lengkap dengan foto, lalu pengguna lain dapat mengonfirmasi laporan tersebut.
- **Masa berlaku laporan.** Laporan yang sudah kedaluwarsa dibersihkan otomatis agar peta tidak penuh data lama.
- **Komunitas.** Pengguna dapat bergabung dengan komunitas untuk berbagi informasi jalur.

## 5. Siapa saja penggunanya

Aplikasi memiliki dua sisi antarmuka. Keduanya wajib memenuhi WCAG 2.1 AA, tetapi kanal utamanya berbeda.

|             | Sisi A                       | Sisi B                                                  |
| ----------- | ---------------------------- | ------------------------------------------------------- |
| Pengguna    | Lansia                       | Keluarga yang merawat, relawan, pemeta, dan verifikator |
| Kanal utama | Audio, sentuhan, dan getaran | Visual berupa peta, dasbor, dan tabel                   |
| Prioritas   | Aksesibilitas mutlak         | Kepadatan informasi dan efisiensi kerja                 |

Peran akun di sistem adalah `blind_user`, `mobility_user`, `caregiver`, `volunteer`, dan `admin`. Peran `volunteer` memiliki dua kemampuan yang berdiri sendiri, yaitu mendampingi dan mengumpulkan data peta. Peran `admin` bertindak sebagai verifikator data graf, tetapi tidak berhak melihat lokasi pengguna.

## 6. Alur penggunaan

### 6.1 Alur lansia

1. Lansia mendaftar dengan nomor telepon, lalu memasukkan kode OTP yang diterima.
2. Lansia memilih peran dan satu atau lebih profil kondisi pada layar orientasi.
3. Lansia mencari tujuan, baik dengan mengetik maupun dengan suara.
4. Sistem menghitung rute sesuai profil. Lansia dapat membandingkannya dengan rute untuk profil lain agar memahami perbedaannya.
5. Jika tujuan tidak terjangkau secara mandiri, sistem menjelaskan alasannya dan menawarkan pendampingan.
6. Lansia memulai perjalanan. Panduan suara dibacakan langkah demi langkah, dan lokasi dibagikan kepada keluarga jika lansia memberikan izin.
7. Jika terjadi masalah di jalan, lansia menekan tombol SOS. Jika semuanya lancar, perjalanan ditutup dengan layar tiba dan lansia dapat memberi masukan atau melaporkan hambatan yang ditemui.

### 6.2 Alur keluarga yang merawat

1. Keluarga mendaftar sebagai pendamping, lalu menautkan akunnya dengan akun lansia melalui undangan.
2. Lansia menyetujui tautan tersebut dan menentukan izin berbagi lokasi.
3. Saat lansia memulai perjalanan, keluarga menerima notifikasi dan dapat membuka layar pemantauan.
4. Jika perjalanan terhenti terlalu lama tanpa penjelasan, sistem mengirim peringatan kepada keluarga.
5. Jika SOS dipicu, keluarga menerima peringatan secara realtime beserta status penanganannya.

### 6.3 Alur pendampingan relawan

1. Lansia membuat permintaan pendampingan dengan menyebut tujuan, waktu, dan kebutuhan.
2. Relawan yang tersedia di sekitar area melihat permintaan tersebut dan mengajukan diri.
3. Lansia melihat daftar penawaran, lalu memilih satu relawan.
4. Menjelang hari pendampingan, kedua pihak menerima pengingat.
5. Pada saat pendampingan, kedua pihak melakukan check-in.
6. Setelah selesai, lansia memberi penilaian kepada relawan.

### 6.4 Alur SOS

1. Lansia menekan tombol SOS. Pengguna harus selalu diberi tahu hasil pengiriman, dan SOS tidak boleh gagal tanpa pemberitahuan.
2. Keluarga dan relawan di sekitar menerima peringatan.
3. Relawan yang bersedia membantu menyatakan responsnya.
4. Jika tidak ada yang merespons dalam batas waktu tertentu, sistem mengeskalasi insiden secara otomatis.
5. Lansia dapat membatalkan SOS jika ternyata tidak diperlukan.

### 6.5 Alur data survei dan verifikasi

1. Pemeta melakukan survei lapangan dan memasukkan node serta edge ke Peta Editor beserta atributnya.
2. Data yang baru dibuat berstatus draf dan masuk ke antrean verifikasi.
3. Verifikator meninjau data, lalu menyetujui atau menolaknya.
4. Hanya data yang sudah disetujui yang dipakai oleh sistem perutean.
5. Laporan komunitas melewati proses verifikasi yang sama sebelum memengaruhi rute.

## 7. Cara kerja perutean

Rute dihitung di dalam database memakai `pgr_dijkstra` dari pgRouting. Setiap edge pada graf memiliki atribut fisik. Saat sebuah permintaan rute datang, biaya setiap edge dihitung secara dinamis dari atribut tersebut dan bobot milik profil pengguna.

Sebagai contoh, untuk profil kursi roda, edge yang memiliki anak tangga diberi biaya sangat tinggi atau ditutup sama sekali, sedangkan kondisi pencahayaan hampir tidak berpengaruh. Untuk profil penglihatan menurun, anak tangga tidak menjadi masalah besar, tetapi persimpangan tanpa guiding block dan jalur yang gelap diberi biaya tinggi. Karena bobot dihitung saat permintaan datang, satu graf yang sama melayani semua profil tanpa menyimpan salinan graf per profil.

Setelah jalur ditemukan, langkah-langkah rute disusun dari fakta yang tersimpan di database. Model bahasa hanya boleh membantu merangkai kalimat. Fakta seperti jumlah anak tangga, arah, jarak, dan status lift harus berasal dari database, dan model bahasa tidak boleh mengarang atau menyimpulkan kondisi fisik.

## 8. Batas klaim produk

UNSTOPPABLE sengaja memperdalam satu hal sampai benar-benar berfungsi, yaitu akses fisik lansia ke layanan kesehatan dan aktivitas sehari-hari. Karena itu, batas klaimnya perlu dinyatakan dengan jelas.

| Yang dilakukan produk ini                                                                                          | Yang tidak dilakukan produk ini                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Membantu lansia menjangkau bantuan dan layanan sehari-hari melalui rute yang sesuai kondisi, pendampingan, dan SOS | Memantau tanda vital seperti tekanan darah atau detak jantung |
| Mendeteksi kejadian di perjalanan, yaitu perjalanan yang terhenti tanpa penjelasan dan SOS                         | Mendeteksi perburukan penyakit                                |
| Memberi keluarga visibilitas atas perjalanan sesuai izin lansia                                                    | Mengelola kepatuhan minum obat                                |
|                                                                                                                    | Menggantikan pemeriksaan oleh tenaga kesehatan                |

Pemantauan kepatuhan pengobatan berada di luar cakupan versi ini dan tercatat pada [peta jalan](#21-peta-jalan).

## 9. Arsitektur sistem

```text
                    +--------------------------------------+
                    |   Frontend (Next.js, dihosting       |
                    |   di Vercel, PWA minimal untuk push) |
                    +----------+---------------+-----------+
                               |               |
                        HTTP REST          Socket.io
                               |               |
                    +----------v---------------v-----------+
                    |   Backend (Node.js, Express 5)       |
                    |   modul domain, middleware, cron     |
                    +----+---------+-----------+-------+---+
                         |         |           |       |
                  Prisma dan     HTTP       Gemini   Supabase
                   raw SQL    internal       API     Storage
                         |         |
              +----------v--+  +---v--------------------+
              | PostgreSQL  |  | Voice microservice     |
              | PostGIS     |  | FastAPI, Whisper, Piper|
              | pgRouting   |  +------------------------+
              +-------------+
```

Beberapa keputusan arsitektur yang penting adalah sebagai berikut.

- **Satu graf, banyak profil.** Bobot dihitung saat permintaan, bukan disimpan per profil.
- **Voice microservice terpisah.** Layanan speech ditulis dengan Python karena ekosistem Whisper dan Piper ada di sana. Layanan ini tidak dibuka ke publik dan hanya backend yang dapat memanggilnya melalui header `X-Internal-Key`.
- **Cadangan suara di browser.** Jika voice microservice tidak aktif, backend membalas `503 SPEECH_UNAVAILABLE` dan frontend beralih ke Web Speech API milik browser.
- **PWA seminimal mungkin.** Manifest dan service worker hanya dipakai untuk Web Push, tanpa caching offline.
- **Zona waktu.** Semua waktu disimpan sebagai `TIMESTAMPTZ`, dikirim dalam format ISO 8601, dan ditampilkan dalam WIB.
- **Koordinat.** API dan PostGIS memakai urutan `[longitude, latitude]`. Leaflet memakai `[latitude, longitude]`, sehingga konversi selalu dilakukan di frontend.

Skema database yang lengkap dapat dilihat pada [backend/prisma/schema.prisma](backend/prisma/schema.prisma) dan diagram relasinya pada [ERD_UNSTOPPABLE.png](ERD_UNSTOPPABLE.png).

## 10. Teknologi yang digunakan

| Lapisan            | Teknologi                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend           | Next.js 16 dengan App Router, React 19, TypeScript, Tailwind CSS 4, React Aria Components, Leaflet, React Leaflet, dan socket.io-client |
| Backend            | Node.js 22 atau lebih baru, Express 5, TypeScript, Socket.io, node-cron, Zod, Helmet, dan express-rate-limit                            |
| Autentikasi        | OTP nomor telepon, JWT access token dan refresh token, serta bcrypt                                                                     |
| Database           | PostgreSQL dengan PostGIS dan pgRouting, diakses melalui Prisma 7 dan raw SQL untuk kueri geospasial                                    |
| Penyimpanan berkas | Supabase Storage untuk foto laporan                                                                                                     |
| Notifikasi         | Web Push dengan kunci VAPID                                                                                                             |
| Speech             | Python 3.11, FastAPI, faster-whisper untuk speech to text, dan Piper untuk text to speech                                               |
| AI                 | Google Gemini melalui `@google/genai`, hanya untuk merangkai kalimat dan percakapan perencanaan                                         |
| Geocoding          | Photon berbasis OpenStreetMap                                                                                                           |
| Pengujian          | Vitest di backend dan pytest di voice microservice                                                                                      |
| Deployment         | Supabase, Railway, dan Vercel                                                                                                           |

## 11. Struktur repository

```text
unstoppable
├── README.md
├── API_DOCS.md                  Dokumentasi seluruh endpoint HTTP dan WebSocket
├── PRD-UNSTOPPABLE-v1.4.md      Product Requirements Document
├── ERD_UNSTOPPABLE.png          Entity Relationship Diagram
├── scripts                      Skrip bantu untuk pengujian manual
│
├── backend                      Server Node.js dan Express
│   ├── prisma                   Skema, migrasi, dan seed
│   ├── scripts/manual-tests     Skrip uji manual untuk Socket.io dan SOS
│   └── src
│       ├── modules              Satu folder untuk setiap domain
│       ├── realtime             Handler Socket.io
│       ├── jobs                 Penjadwal node-cron
│       ├── middleware           Autentikasi, RBAC, rate limit, validasi, dan error
│       └── shared               Utilitas bersama
│
├── frontend                     Aplikasi Next.js
│   └── src
│       ├── app                  Rute App Router dengan grup auth, user, caregiver, volunteer, mapper, dan account
│       ├── components           Komponen antarmuka, peta, perjalanan, dan shell aplikasi
│       ├── contexts             State global berbasis React Context
│       ├── lib/api              Klien API ke backend
│       └── hooks, types         Hook dan tipe bersama
│
└── voice-microservices          Layanan Python untuk speech to text dan text to speech
```

Modul backend yang tersedia adalah `auth`, `users`, `accessibility-profiles`, `routes`, `narration`, `speech`, `graph`, `verification`, `reports`, `buildings`, `volunteers`, `companions`, `sessions`, `sos`, `ai-planner`, `trips`, `notifications`, `geocode`, `communities`, dan `health`. Setiap modul mengikuti pola berkas yang sama, yaitu `*.routes.ts`, `*.controller.ts`, `*.schema.ts`, dan `*.service.ts`.

Penjadwal di `backend/src/jobs` menjalankan tugas berikut.

- Eskalasi SOS yang tidak direspons dan pendeteksian sesi perjalanan yang tidak aktif, keduanya setiap menit.
- Pengingat dan penutupan permintaan pendampingan yang kedaluwarsa, setiap jam.
- Pengingat rencana perjalanan yang dijadwalkan.
- Kedaluwarsa laporan komunitas setiap hari pukul 03.00.
- Pembersihan data ping lokasi setiap hari pukul 03.10 dan pembersihan audit log setiap hari Minggu.

## 12. Cara menjalankan di komputer lokal

### 12.1 Prasyarat

Pastikan perangkat Anda sudah memiliki hal-hal berikut.

- Node.js versi 22 atau lebih baru beserta npm.
- Git.
- Sebuah database PostgreSQL yang mendukung ekstensi `postgis`, `pgrouting`, dan `pgcrypto`. Cara termudah adalah membuat proyek di [Supabase](https://supabase.com) lalu mengaktifkan ketiga ekstensi tersebut dari menu Database, Extensions.
- Python 3.11 jika Anda ingin menjalankan voice microservice. Langkah ini bersifat opsional untuk pengembangan.
- Kunci API Google Gemini dari Google AI Studio jika Anda ingin mencoba AI Planner dan narasi rute.

### 12.2 Mengambil kode

```bash
git clone https://github.com/AnthonyS051105/unstoppable.git
cd unstoppable
```

### 12.3 Menjalankan backend

Semua perintah di bagian ini dijalankan dari folder `backend`.

```bash
cd backend
cp .env.example .env
```

Buka berkas `.env`, lalu isi nilainya. Penjelasan setiap variabel ada di [bagian 13](#13-variabel-lingkungan). Untuk menjalankan inti aplikasi, Anda minimal perlu mengisi `DATABASE_URL`, `JWT_SECRET`, serta `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.

Setelah itu, pasang dependensi, siapkan database, dan jalankan server.

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:smoke
npm run dev
```

Penjelasan setiap perintah.

- `npm run prisma:migrate` menerapkan seluruh migrasi ke database Anda.
- `npm run db:smoke` memeriksa bahwa koneksi database dan ekstensi PostGIS berfungsi.
- `npm run dev` menjalankan server dengan mode pantau perubahan pada port 4000.

Setelah server berjalan, isi tabel profil aksesibilitas. Langkah ini wajib karena empat profil adalah data acuan yang dibutuhkan oleh pendaftaran dan perutean.

```bash
npx tsx prisma/accessibility-profiles.seed.ts
```

Periksa bahwa server sehat dengan membuka alamat berikut.

```bash
curl http://localhost:4000/health
```

Respons yang benar berisi `"status":"ok"` dan `"db":"ok"`.

### 12.4 Menjalankan frontend

Buka terminal baru dan jalankan perintah berikut dari folder `frontend`.

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend dapat dibuka di `http://localhost:3000`. Pastikan berkas `.env.local` menunjuk ke backend Anda.

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

Untuk membangun versi produksi, jalankan `npm run build` lalu `npm start`. Untuk memeriksa gaya penulisan kode, jalankan `npm run lint`.

### 12.5 Menjalankan voice microservice (opsional)

Voice microservice menyediakan suara asli untuk panduan rute dan pencarian dengan suara. Tanpa layanan ini, aplikasi tetap berjalan dan memakai Web Speech API milik browser.

```bash
cd voice-microservices
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Isi `INTERNAL_API_KEY` di berkas `.env` dengan string acak. Anda dapat membuatnya dengan perintah `openssl rand -base64 32`. Setelah itu, jalankan layanan.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Jika Anda lebih suka memakai Docker, jalankan perintah berikut.

```bash
docker build -t unstoppable-voice .
docker run --rm -p 8080:8080 --env-file .env unstoppable-voice
```

Terakhir, isi `SPEECH_SERVICE_URL` dan `SPEECH_SERVICE_API_KEY` pada `backend/.env`. Nilai `SPEECH_SERVICE_API_KEY` harus sama persis dengan `INTERNAL_API_KEY` milik voice microservice. Setelah backend dijalankan ulang, kolom `speech` pada `/health` akan bernilai `ok`.

### 12.6 Mencoba tanpa data survei asli

Repository ini tidak menyertakan data survei asli. Untuk keperluan pengembangan, tersedia seed khusus yang diberi tanda jelas sebagai data dev, yaitu graf contoh, laporan jalan contoh, dan komunitas contoh.

```bash
cd backend
npx tsx prisma/graph.dev.seed.ts
npx tsx prisma/road-reports.dev.seed.ts
npx tsx prisma/communities.dev.seed.ts
```

Seed ini hanya untuk mencoba alur aplikasi. Nama gedungnya diberi awalan `[DEV]`, dan kolom `surveyedAt` diisi `null` agar tidak pernah tampak seperti hasil survei lapangan. Jangan pernah memakainya di lingkungan produksi.

### 12.7 Masuk ke aplikasi saat pengembangan

Provider SMS belum dikonfigurasi pada lingkungan lokal. Ketika Anda mendaftar atau masuk, kode OTP tidak dikirim lewat SMS, tetapi dicetak di log server backend. Salin kode tersebut dari terminal tempat `npm run dev` berjalan, lalu masukkan di layar OTP.

### 12.8 Mengaktifkan notifikasi push (opsional)

Buat sepasang kunci VAPID, lalu isi ketiga variabel `VAPID_*` pada `backend/.env`.

```bash
npx web-push generate-vapid-keys
```

## 13. Variabel lingkungan

### Backend (`backend/.env`)

| Variabel                                                 | Wajib | Fungsi                                                                                                            |
| -------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | Ya    | Connection string PostgreSQL. Gunakan `sslmode=require` dan tambahkan `uselibpqcompat=true` untuk Supabase pooler |
| `JWT_SECRET`                                             | Ya    | Rahasia acak untuk menandatangani token                                                                           |
| `SUPABASE_URL`                                           | Ya    | Alamat proyek Supabase untuk penyimpanan foto laporan                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`                              | Ya    | Kunci layanan Supabase Storage. Jangan pernah dikirim ke frontend                                                 |
| `SPEECH_SERVICE_URL`                                     | Tidak | Alamat voice microservice. Bawaannya `http://localhost:8080`                                                      |
| `SPEECH_SERVICE_API_KEY`                                 | Tidak | Harus sama dengan `INTERNAL_API_KEY` milik voice microservice                                                     |
| `GEMINI_API_KEY`                                         | Tidak | Diperlukan untuk AI Planner dan narasi rute yang memakai model bahasa                                             |
| `GEOCODER_URL`                                           | Tidak | Alamat Photon. Bawaannya `https://photon.komoot.io`                                                               |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Tidak | Kunci Web Push                                                                                                    |
| `SMS_PROVIDER_API_KEY`                                   | Tidak | Jika kosong, OTP dicetak di log server. Jangan dikosongkan di produksi                                            |
| `PORT`                                                   | Tidak | Port server. Bawaannya `4000`                                                                                     |
| `FRONTEND_URL`                                           | Tidak | Origin untuk CORS dan Socket.io. Bawaannya `http://localhost:3000`                                                |

### Frontend (`frontend/.env.local`)

| Variabel                   | Wajib | Fungsi                                                     |
| -------------------------- | ----- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Ya    | Alamat API backend termasuk awalan `/api`                  |
| `NEXT_PUBLIC_SOCKET_URL`   | Ya    | Alamat server Socket.io, yaitu server backend tanpa `/api` |
| `NEXT_PUBLIC_MAP_TILE_URL` | Tidak | Sumber tile peta. Bawaannya tile OpenStreetMap             |

### Voice microservice (`voice-microservices/.env`)

| Variabel               | Fungsi                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `INTERNAL_API_KEY`     | Kunci yang wajib dikirim backend pada header `X-Internal-Key`                                          |
| `WHISPER_MODEL_SIZE`   | Ukuran model Whisper. Pilih `tiny`, `base`, atau `small`. Jangan memakai `large` pada server tanpa GPU |
| `WHISPER_COMPUTE_TYPE` | Tipe komputasi. Bawaannya `int8`                                                                       |
| `WHISPER_LANGUAGE`     | Bahasa pengenalan suara. Bawaannya `id`                                                                |
| `MAX_AUDIO_BYTES`      | Batas ukuran audio yang diunggah. Bawaannya 10 MB                                                      |

Berkas `.env` dan `.env.local` sudah masuk `.gitignore`. Jangan pernah mengunggah rahasia ke repository.

## 14. Menjalankan pengujian

Pengujian backend memakai Vitest.

```bash
cd backend
npm test
```

Pengujian voice microservice dijalankan dari folder `voice-microservices` setelah lingkungan virtual aktif.

```bash
pip install pytest httpx
python -m pytest tests
```

Beberapa skrip uji manual yang membutuhkan database sungguhan tersedia di `backend/scripts/manual-tests` untuk memeriksa Socket.io dan siaran SOS. Untuk pemeriksaan frontend, jalankan `npm run lint` dan `npm run build` di folder `frontend`.

Selain pengujian otomatis, setiap perubahan sebaiknya diuji secara manual. Endpoint dipanggil sungguhan dan halaman dibuka sungguhan, termasuk dioperasikan hanya dengan keyboard.

## 15. Deployment ke produksi

| Komponen             | Platform | Catatan                                                                                                                                                                    |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database dan storage | Supabase | Aktifkan ekstensi PostGIS, pgRouting, dan pgcrypto                                                                                                                         |
| Backend              | Railway  | Konfigurasi ada di `backend/railway.json`. Saat deploy, migrasi dijalankan dengan `prisma migrate deploy`, lalu server dinyalakan. Pemeriksaan kesehatan memakai `/health` |
| Voice microservice   | Railway  | Dibangun dari `Dockerfile`. Jangan buka ke publik, cukup dapat dijangkau oleh backend                                                                                      |
| Frontend             | Vercel   | Atur `NEXT_PUBLIC_API_BASE_URL` dan `NEXT_PUBLIC_SOCKET_URL` ke alamat backend produksi                                                                                    |

Sebelum meluncurkan ke pengguna sungguhan, pastikan hal-hal berikut sudah dilakukan.

1. `JWT_SECRET` dan `INTERNAL_API_KEY` diisi dengan nilai acak yang kuat.
2. Provider SMS dikonfigurasi, karena tanpanya kode OTP hanya tercetak di log.
3. `FRONTEND_URL` diisi persis dengan alamat frontend produksi agar CORS dan Socket.io benar.
4. Kunci VAPID dibuat dan diisi agar notifikasi push berfungsi.
5. Seed dev tidak dijalankan di database produksi.
6. Data graf yang dipakai adalah hasil survei lapangan yang nyata.

## 16. API dan WebSocket

Backend menyediakan 56 endpoint HTTP di bawah awalan `/api`, ditambah endpoint `/health` di luar awalan tersebut, dan 19 event WebSocket. Kelompok utamanya adalah sebagai berikut.

| Kelompok                                                 | Awalan                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Autentikasi                                              | `/api/auth`                                                                             |
| Pengguna dan relasi keluarga                             | `/api/users`                                                                            |
| Profil aksesibilitas                                     | `/api/profiles` dan `/api/users/me/accessibility`                                       |
| Perutean                                                 | `/api/routes`                                                                           |
| Narasi dan speech                                        | `/api/narration` dan `/api/speech`                                                      |
| Graf dan verifikasi                                      | `/api/graph` dan `/api/verification`                                                    |
| Laporan komunitas                                        | `/api/reports`                                                                          |
| Gedung dan skor aksesibilitas                            | `/api/buildings`                                                                        |
| Relawan dan pendampingan                                 | `/api/volunteers` dan `/api/companions`                                                 |
| Sesi perjalanan dan SOS                                  | `/api/sessions` dan `/api/sos`                                                          |
| AI Planner                                               | `/api/ai-planner`                                                                       |
| Rencana perjalanan, notifikasi, geocoding, dan komunitas | `/api/trips`, `/api/notifications`, `/api/push`, `/api/geocode`, dan `/api/communities` |

Seluruh respons memakai bentuk yang seragam, dan seluruh koordinat memakai urutan `[longitude, latitude]`. Koneksi WebSocket diautentikasi dengan token pada saat handshake.

Daftar lengkap, contoh permintaan, dan kode galat ada di [API_DOCS.md](API_DOCS.md).

## 17. Aksesibilitas, keamanan, dan privasi

### Aksesibilitas

Karena produk ini ditujukan bagi lansia, aksesibilitas adalah syarat dasar dan bukan fitur tambahan.

- Semua elemen interaktif memiliki nama yang dapat dibaca oleh pembaca layar.
- Semua fungsi dapat dioperasikan hanya dengan keyboard.
- Informasi tidak pernah disampaikan hanya lewat warna. Selalu ada ikon, bentuk, atau teks pendamping.
- Target sentuh pada antarmuka lansia berukuran minimal 44 kali 44 piksel.
- Kedua sisi antarmuka memenuhi WCAG 2.1 AA.

### Keamanan

- Header keamanan dipasang dengan Helmet dan CORS dibatasi ke origin frontend.
- Setiap endpoint memiliki pembatasan laju permintaan, dan pengiriman ulang OTP dibatasi per nomor per jam.
- Semua masukan divalidasi dengan Zod sebelum diproses.
- Akses dibatasi berdasarkan peran melalui middleware RBAC.
- Tindakan penting dicatat pada audit log, yang dibersihkan secara berkala.
- Voice microservice hanya menerima permintaan dengan kunci internal yang benar.

### Privasi

- Lokasi lansia hanya dibagikan kepada keluarga yang diberi izin oleh lansia itu sendiri.
- Verifikator dan admin tidak berhak melihat lokasi pengguna.
- Data ping lokasi dihapus otomatis setiap hari oleh penjadwal.

### Keselamatan fitur pendampingan

- SOS tidak boleh gagal tanpa pemberitahuan. Jika pengiriman gagal, pengguna harus diberi tahu dan ditawari jalur alternatif.
- Relawan tidak pernah ditugaskan otomatis kepada pengguna.
- Check-in pendampingan selalu berlangsung dua arah.

## 18. Prinsip data survei

Data aksesibilitas yang keliru dapat mencelakakan pengguna, sehingga repository ini memegang beberapa aturan berikut.

- Data graf berasal dari survei lapangan yang nyata.
- Data karangan tidak boleh tampak seperti hasil survei. Seed untuk pengembangan harus diberi tanda jelas, memakai nama berkas berakhiran `.dev.seed.ts`, dan memiliki `surveyedAt` bernilai `null`.
- Fakta fisik pada narasi rute selalu berasal dari database dan tidak dibangkitkan oleh model bahasa.
- Data baru dan laporan komunitas harus melewati verifikasi sebelum dipakai oleh sistem perutean.

## 19. Berkontribusi

Kontribusi dari siapa pun sangat disambut, baik berupa kode, dokumentasi, terjemahan, maupun data survei dari area lain.

1. Fork repository ini, lalu buat cabang dari `dev` dengan awalan yang sesuai, misalnya `feat/`, `fix/`, atau `docs/`.
2. Tulis pesan commit yang singkat dan jelas dalam satu baris.
3. Jika perubahan Anda menyentuh kontrak API atau skema database, usulkan perubahan itu lebih dahulu, karena dampaknya mengenai seluruh pengembang.
4. Jangan menambah dependensi baru tanpa alasan yang kuat, karena tumpukan teknologi sudah ditetapkan.
5. Uji perubahan Anda secara manual, termasuk dengan keyboard saja, lalu buka pull request ke cabang `dev`.

Jika Anda menemukan kerentanan keamanan, mohon jangan membukanya sebagai isu publik. Hubungi tim pengembang secara langsung terlebih dahulu.

## 20. Tim pengembang

Tim apaya (K1) mengembangkan UNSTOPPABLE untuk Hackathon JOINTS UGM 2026 pada subtema Healthcare.

| Nama                          | Peran                                 |
| ----------------------------- | ------------------------------------- |
| Yohanes Anthony Saputra       | Project Manager dan Frontend Engineer |
| Shafiyah Nuril Hayya          | Frontend Engineer                     |
| Muhammad Nafal Zakin Rustanto | Backend Engineer                      |
| Nathanael Satya Saputra       | Backend Engineer                      |

## 21. Peta jalan

Fitur berikut belum tersedia pada versi ini dan menjadi arah pengembangan selanjutnya.

- Pemantauan kepatuhan pengobatan, dengan struktur keluarga yang sudah ada sebagai fondasinya.
- Perluasan survei ke area lain, terutama sekitar puskesmas dan rumah sakit.
- Deteksi jatuh.
- Rekaman audio saat SOS dan cadangan pengiriman melalui SMS.
- Mode untuk area yang belum dikenal.
- Ekspor laporan perjalanan.

## 22. Tautan penting

| Tautan                        | Alamat                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Video produk                  | [youtu.be/w62FXJ5yehc](https://youtu.be/w62FXJ5yehc)                                                               |
| Desain di Figma               | [Buka desain Figma](https://www.figma.com/design/BER7jSpsxrUDjA5DPtY4Le/Untitled?node-id=1-3&t=tXmqbTNQcliSgr1K-1) |
| Website yang sudah dideploy   | ISI_URL_DEPLOYMENT_WEBSITE                                                                                         |
| Dokumentasi endpoint          | [API_DOCS.md](API_DOCS.md)                                                                                         |
| Product Requirements Document | [PRD-UNSTOPPABLE-v1.4.md](PRD-UNSTOPPABLE-v1.4.md)                                                                 |
| Skema database                | [backend/prisma/schema.prisma](backend/prisma/schema.prisma)                                                       |
| Diagram relasi entitas        | [ERD_UNSTOPPABLE.png](ERD_UNSTOPPABLE.png)                                                                         |

## 23. Lisensi

Proyek ini dirilis sebagai perangkat lunak sumber terbuka di bawah Lisensi MIT. Anda bebas menggunakan, mempelajari, mengubah, dan menyebarkannya, selama pemberitahuan hak cipta tetap disertakan.

Data survei lapangan yang dikumpulkan oleh tim bersifat terpisah dari kode dan hanya berlaku untuk area yang disurvei. Mohon jangan menggunakan data aksesibilitas yang tidak diverifikasi untuk keputusan keselamatan.
