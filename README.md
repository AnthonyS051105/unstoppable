# UNSTOPPABLE

**Platform navigasi dan pendampingan agar lansia dapat sampai ke layanan kesehatan dan aktivitas sehari-hari dengan selamat, dan agar keluarga yang merawatnya tidak perlu selalu ikut menemani.**

UNSTOPPABLE adalah aplikasi web sumber terbuka. Aplikasi ini merencanakan rute berdasarkan kondisi fisik setiap lansia, bukan berdasarkan jarak terpendek. Rute dirancang untuk dihitung dari satu graf jalur hasil survei lapangan, lengkap dengan data kelandaian, lebar jalur, anak tangga, ramp, lift, dan guiding block.

**Coba aplikasinya:** [unstoppable-mu.vercel.app](https://unstoppable-mu.vercel.app)
**Video demonya:** [video demo UNSTOPPABLE](https://drive.google.com/drive/folders/1TuSwUV9gQTv8qZs0kHb0vCI8kptTXZTj?usp=sharing)

## Tim apaya

| Nama                          | Peran                                 |
| ----------------------------- | ------------------------------------- |
| Yohanes Anthony Saputra       | Project Manager dan Frontend Engineer |
| Shafiyah Nuril Hayya          | Frontend Engineer                     |
| Muhammad Nafal Zakin Rustanto | Backend Engineer                      |
| Nathanael Satya Saputra       | Backend Engineer                      |

---

## Daftar Isi

**Tentang aplikasi**

1. [Aplikasi ini untuk apa](#1-aplikasi-ini-untuk-apa)
2. [Empat profil kondisi lansia](#2-empat-profil-kondisi-lansia)
3. [Fitur menurut peran](#3-fitur-menurut-peran)
4. [Skenario penggunaan dan rute halaman](#4-skenario-penggunaan-dan-rute-halaman)
5. [Perintah suara](#5-perintah-suara)
6. [Rancangan aksesibilitas](#6-rancangan-aksesibilitas)
7. [Batas klaim produk](#7-batas-klaim-produk)
8. [Akun demo](#8-akun-demo)

**Untuk pengembang**

9. [Arsitektur dan teknologi](#9-arsitektur-dan-teknologi)
10. [Struktur repository](#10-struktur-repository)
11. [Menjalankan di komputer lokal](#11-menjalankan-di-komputer-lokal)
12. [Variabel lingkungan](#12-variabel-lingkungan)
13. [Pengujian dan deployment](#13-pengujian-dan-deployment)
14. [API, keamanan, dan prinsip data](#14-api-keamanan-dan-prinsip-data)
15. [Berkontribusi, peta jalan, dan lisensi](#15-berkontribusi-peta-jalan-dan-lisensi)

---

# Tentang aplikasi

## 1. Aplikasi ini untuk apa

Layanan kesehatan yang tersedia tidak otomatis berarti terjangkau. Sebuah puskesmas bisa berjarak dua kilometer dari rumah seorang lansia, tetapi menjadi tidak terjangkau karena ada tiga anak tangga di pintu masuk, trotoar terlalu sempit untuk walker, atau lift yang sudah sebulan rusak. Hambatan seperti ini jarang tercatat di mana pun, dan peta umum seperti Google Maps tidak menyimpannya.

Lansia juga bukan kelompok yang seragam. Pengguna kursi roda terhenti oleh satu anak tangga. Lansia dengan penglihatan menurun bisa menaiki tangga, tetapi tersesat di persimpangan tanpa guiding block. Rute yang aman bagi yang satu bisa berbahaya bagi yang lain.

**Pembeda utama.** UNSTOPPABLE memakai satu graf jalur, lalu menghitungnya dengan bobot berbeda untuk setiap kondisi lansia. Titik asal dan tujuan yang sama menghasilkan rute yang berbeda bagi pengguna kursi roda dan pengguna tunanetra.

Hal lain yang tidak dilakukan aplikasi peta umum:

- Menyimpan lokasi guiding block, ramp, kelandaian, lebar jalur, dan status lift.
- Menjawab jujur ketika tujuan tidak terjangkau secara mandiri, lengkap dengan alasan, lalu menawarkan pendampingan relawan.
- Menyusun narasi rute dari fakta di database. Jumlah anak tangga, arah, jarak, dan status lift tidak pernah dikarang oleh model bahasa.
- Memberi keluarga visibilitas perjalanan hanya sesuai izin yang diberikan lansia.

## 2. Empat profil kondisi lansia

Pengguna memilih satu atau lebih profil. Profil inilah yang menentukan bobot graf saat rute dihitung.

| Identitas teknis | Nama yang dilihat pengguna               | Kebutuhan utama                                                |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `wheelchair`     | Lansia pengguna kursi roda               | Jalur tanpa tangga, ramp landai, lebar jalur memadai           |
| `crutches`       | Lansia dengan walker atau tongkat        | Sedikit anak tangga dengan pegangan, jalur rata                |
| `low_vision`     | Lansia dengan penglihatan menurun        | Jalur terang, kontras jelas, panduan suara                     |
| `blind`          | Lansia dengan gangguan penglihatan berat | Panduan suara dan guiding block sepenuhnya                     |

Selain profil, lansia dapat mengatur toleransi pribadi, yaitu jumlah anak tangga yang masih sanggup dilalui dan tingkat kemiringan yang nyaman.

## 3. Fitur menurut peran

### Lansia (kursi roda, walker, penglihatan menurun, tunanetra)

- **Rute sesuai kondisi** dan **pembanding rute** dua profil pada asal dan tujuan yang sama, dengan penjelasan mengapa rutenya berbeda.
- **Panduan suara selama perjalanan**: instruksi dibacakan, dapat diulang, dijeda, dan dilanjutkan.
- **Kendali suara untuk seluruh aplikasi**: mencari tujuan, membuka halaman, membaca rute, memulai perjalanan, dan membuka SOS tanpa menyentuh layar. Ada dua mode, yaitu kendali langsung dan kata pemicu "Halo Unstoppable".
- **Jawaban jujur untuk tujuan yang tidak terjangkau**, dengan alasan dan tawaran pendampingan.
- **Data kesegaran survei** pada setiap rute, misalnya "Disurvei 5 September 2026", atau penanda jelas bila belum disurvei.
- **SOS**: tombol ditahan 1,5 detik, lalu keluarga dan relawan di sekitar diberi tahu.
- **Lapor hambatan** lengkap dengan foto, dan **minta pendamping** relawan.
- **AI Planner**: percakapan terstruktur untuk menyusun rencana perjalanan, termasuk rekomendasi multimoda contoh.
- **Rute tersimpan**, riwayat perjalanan, dan perjalanan terjadwal dengan pengingat.

### Keluarga yang merawat

- Menautkan akun ke satu atau beberapa lansia lewat undangan, dengan izin berbagi yang ditentukan lansia: `selama perjalanan` atau `hanya saat SOS`.
- Memantau perjalanan aktif dan menerima peringatan SOS secara realtime.
- Notifikasi perjalanan dimulai, selesai, atau terhenti tanpa penjelasan, termasuk Web Push.

### Relawan

- **Pendampingan terjadwal**: lansia membuat permintaan, relawan mengajukan diri, lansia memilih. Relawan tidak pernah ditugaskan otomatis.
- **Check-in dua arah** dan penilaian setelah selesai.
- **Respons SOS**: relawan dalam wilayah layanan menerima peringatan realtime dan menyatakan kesediaan membantu.
- Relawan terverifikasi dapat juga **memetakan** lewat Peta Editor.

### Pemeta dan verifikator (admin)

- **Peta Editor** untuk node dan edge graf beserta atributnya, serta pengecekan topologi.
- **Antrean verifikasi** untuk data baru dan laporan komunitas. Hanya data yang disetujui yang dipakai perutean.
- **Peninjauan pendaftaran relawan**.
- Admin tidak berhak melihat lokasi pengguna dan tidak menerima SOS otomatis.

## 4. Skenario penggunaan dan rute halaman

Setiap skenario di bawah berurutan: tindakan pengguna, halaman yang terbuka (rute), dan hasilnya. Rute ditulis relatif terhadap alamat aplikasi, misalnya `/home`.

### Skenario 1. Mendaftar dan menyiapkan profil lansia

| Langkah | Tindakan pengguna | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Membuka aplikasi | `/` | Halaman landing menjelaskan produk |
| 2 | Memilih daftar, mengisi email dan kata sandi | `/register` | Server mengirim kode OTP 6 digit ke email |
| 3 | Memasukkan kode OTP (berlaku 5 menit) | `/otp` | Akun terverifikasi dan pengguna otomatis masuk. Kode dapat ditempel atau diucapkan ("isi kode ...") |
| 4 | Memilih peran: lansia, keluarga, atau relawan | `/role` | Peran menentukan beranda dan menu |
| 5 | Mengikuti onboarding lima langkah | `/onboarding` | Pengenalan, pilihan kondisi (minimal satu), toleransi tangga dan kemiringan (bisa dilewati), izin lokasi dan suara, kontak darurat atau penautan keluarga (bisa dilewati) |
| 6 | Selesai | `/home` | Profil tersimpan ke server dan beranda terbuka |

Pengguna yang sudah punya akun masuk lewat `/login` dengan nomor telepon atau email. Setiap peran diarahkan ke beranda masing-masing: lansia ke `/home`, keluarga ke `/caregiver`, relawan ke `/dashboard`, admin ke `/verification`.

### Skenario 2. Mencari tujuan dan melihat rute (lansia)

Pak Budi, pengguna kursi roda, ingin ke Teknik Geologi.

| Langkah | Tindakan | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Mengucapkan "Cari teknik geologi" atau mengetik di kolom pencarian | `/home` lalu `/search` | Pencarian suara atau teks. Bila hanya satu hasil, detail tempat langsung terbuka dan dibacakan |
| 2 | Membuka detail tempat | `/place` | Menampilkan skor aksesibilitas gedung dan tanggal survei. Tombol "Cari rute ke sini" tetap diketuk, perintah suara tidak menyetujuinya otomatis |
| 3 | Menunggu | `/loading` | Server menghitung rute dengan bobot profil pengguna |
| 4 | Memeriksa pratinjau | `/preview` | Ringkasan jarak, durasi, hambatan, daftar langkah, peta, dan kesegaran data. Tersedia "Baca rute", "Mulai perjalanan", "Jadwalkan", dan "Simpan rute" |
| 5 | (Opsional) Membandingkan dengan profil lain | `/compare` | Dua rute pada asal dan tujuan yang sama, dengan panel penjelasan perbedaannya |
| 5 alt | Tujuan tidak punya jalur yang memenuhi profil | `/unreachable` | Alasan spesifik, misalnya tanpa lift ke lantai atas, lalu tombol "Ajukan pendampingan". Ini jawaban yang benar, bukan layar galat |

### Skenario 3. Melakukan perjalanan dengan panduan suara (lansia)

Inilah inti pengalaman bagi pengguna tunanetra dan penglihatan menurun.

| Langkah | Tindakan | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Mengucapkan atau mengetuk "Mulai perjalanan" | `/preview` lalu `/trip` | Sesi perjalanan dimulai di server, layar dijaga tetap menyala (Wake Lock), dan lokasi dibagikan ke keluarga sesuai izin |
| 2 | Mendengar instruksi pertama | `/trip` | Narasi dibacakan dari fakta database: arah, jarak, jumlah anak tangga, status lift, dan peringatan seperti guiding block rusak |
| 3 | "Ulangi petunjuk" | `/trip` | Instruksi saat ini dibacakan ulang tanpa membaca layar |
| 4 | "Langkah berikutnya" | `/trip` | Pindah ke instruksi berikut. Kemajuan ditampilkan dan diumumkan ke pembaca layar |
| 5 | "Jeda perjalanan" lalu "Lanjutkan perjalanan" | `/trip` | Perjalanan dijeda dan dilanjutkan |
| 6 | Tiba di tujuan | `/arrived` | Layar tiba dengan ringkasan |
| 7 | Menjawab "Bagaimana perjalanan Anda?" dengan satu pilihan, tanpa mengetik | `/feedback` | Masukan tersimpan. Bila ada hambatan, pengguna dapat langsung melapor |

Selama perjalanan, tombol SOS selalu berada di posisi yang sama. Suara dibacakan lewat Piper di server. Bila layanan suara tidak aktif, aplikasi beralih otomatis ke suara bawaan browser, sehingga narasi tidak pernah gagal total.

### Skenario 4. SOS saat dalam masalah

| Langkah | Tindakan | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Mengucapkan "SOS" atau mengetuk tombol SOS | `/sos` | Layar SOS terbuka. Suara hanya membuka layar, tidak mengirim darurat |
| 2 | **Menahan tombol SOS selama 1,5 detik** | `/sos` | Getar dan hitung mundur. Dilepas sebelum selesai berarti batal |
| 3 | Menunggu respons | `/sos-active` | Jumlah penerima, daftar relawan yang merespons beserta status "Menuju Anda", dan tombol "Batalkan SOS" |
| 3 alt | Tidak ada penerima di sekitar | `/sos-empty` | Pengguna diberi tahu terus terang dan ditawari jalur alternatif seperti nomor darurat. SOS tidak boleh gagal senyap |

Di sisi lain: keluarga tertaut menerima peringatan beserta tautan lokasi (sesuai izin berbagi), relawan terverifikasi di wilayah layanan menerima kartu SOS baru di `/dashboard` lalu menekan "Bantu". Bila tidak ada yang merespons dalam batas waktu, server mengeskalasi insiden. Pengiriman berjalan lewat koneksi realtime. SOS tidak mengirim SMS dan tidak menghubungi 112 secara otomatis.

### Skenario 5. Melaporkan hambatan di jalan

| Langkah | Tindakan | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Memilih kategori lewat ikon besar: ramp terhalang, lift rusak, guiding block rusak, dan lainnya | `/report` | Tanpa mengetik |
| 2 | Memeriksa titik di peta, memilih tingkat keparahan, menambah foto dan deskripsi | `/report-confirm` | Lokasi terisi dari GPS dan dapat digeser |
| 3 | Mengirim | `/report-sent` | Konfirmasi dari server |
| 4 | Memantau laporan sendiri | `/my-reports` | Status laporan |

Pengguna lain dengan perjalanan aktif dalam radius 500 m menerima peringatan. Laporan masuk antrean verifikasi. Setelah admin menyetujui dengan dampak "blokir", rute yang bergantung pada jalur itu menjadi tidak terjangkau pada perhitungan berikutnya.

### Skenario 6. Meminta pendamping relawan

| Pihak | Tindakan | Rute |
| --- | --- | --- |
| Lansia | Membuat permintaan: tujuan, titik temu, waktu, kebutuhan | `/assistance` lalu `/assistance-form` |
| Relawan | Melihat permintaan di area layanannya, lalu menawarkan bantuan | `/volunteer-requests` lalu `/volunteer-request` |
| Lansia | Melihat daftar penawaran dan memilih satu relawan | `/volunteer-offers` dan `/volunteers` |
| Kedua pihak | Memantau status, check-in bertemu, dan konfirmasi selesai | `/assistance-status`, `/assistance-detail`, `/volunteer-schedule` |
| Lansia | Menilai relawan | `/assistance-rating` |

Pendampingan dari layar "tidak terjangkau" mengisi tujuan secara otomatis.

### Skenario 7. Keluarga memantau

| Langkah | Tindakan | Rute |
| --- | --- | --- |
| 1 | Lansia menautkan keluarga (saat onboarding atau kapan saja) dan memilih izin berbagi | `/caregiver-link` |
| 2 | Keluarga melihat daftar lansia yang ditautkan | `/caregiver` |
| 3 | Saat lansia berjalan, keluarga membuka peta dan status perjalanan | `/monitor` |
| 4 | Saat SOS, keluarga menerima peringatan dan membuka titik kejadian | notifikasi di `/notifications` dan halaman lokasi SOS |

### Skenario 8. Memetakan dan memverifikasi data

| Peran | Tindakan | Rute |
| --- | --- | --- |
| Relawan mendaftar | Mengajukan diri sebagai relawan dan menunggu peninjauan | `/volunteer-register`, `/volunteer-pending` |
| Admin | Meninjau pendaftaran relawan | `/volunteer-review` |
| Relawan atau pemeta | Mengatur wilayah layanan | `/service-area` |
| Pemeta | Menambah node dan edge beserta atribut. Data baru berstatus draf | `/editor` |
| Admin | Memeriksa konektivitas graf | `/topology` |
| Admin | Menyetujui atau menolak draf dan laporan komunitas | `/verification`, `/review` |

### Skenario 9. Merencanakan perjalanan dengan AI Planner

Lansia membuka `/ai-planner`, menyampaikan tujuan dan waktu lewat percakapan terstruktur, lalu memperoleh rekomendasi rute. Fakta fisik tetap berasal dari database, dan model bahasa hanya merangkai kalimat. Rencana dapat dijadwalkan, dan pengingat terkirim lewat notifikasi.

### Menu pendukung

| Rute | Isi |
| --- | --- |
| `/settings`, `/account`, `/profile` | Menu, akun, dan kondisi pengguna. Mengubah kondisi menghitung ulang rute |
| `/voice-settings` | Narasi, kecepatan suara, dan mode kendali suara |
| `/saved`, `/history` | Rute tersimpan dan riwayat perjalanan |
| `/notifications`, `/notification-settings` | Kotak masuk dan pengaturan notifikasi |
| `/communities`, `/community` | Komunitas berbagi informasi jalur |
| `/privacy`, `/exports`, `/help` | Privasi, ekspor, dan bantuan |

## 5. Perintah suara

Tekan ikon mikrofon di bilah atas lalu pilih **Izinkan & mulai**. Dalam mode **kendali langsung**, ucapkan perintah tanpa awalan. Dalam mode **Halo Unstoppable**, awali setiap perintah dengan "Halo Unstoppable", atau ucapkan frasa itu lalu satu perintah dalam delapan detik.

| Kelompok | Contoh ucapan |
| --- | --- |
| Navigasi | "Buka beranda", "Buka pengaturan", "Rute tersimpan", "Riwayat perjalanan", "Notifikasi", "AI planner", "Lapor hambatan", "Minta pendamping" |
| Pencarian | "Cari puskesmas", "Tujuan teknik geologi" |
| Rute | "Baca rute", "Mulai perjalanan", "Simpan rute", "Perbesar peta", "Perkecil peta" |
| Perjalanan | "Ulangi petunjuk", "Langkah berikutnya", "Jeda perjalanan", "Lanjutkan perjalanan", "Akhiri perjalanan" |
| Halaman | "Baca halaman", "Gulir ke bawah", "Buka panel", "Teks lebih besar" |
| Formulir | "Pilih kondisi kursi roda", "Isi kode empat satu ...", "Pilih peran lansia", "Isi titik temu ..." |
| Darurat | "SOS" (hanya membuka layar SOS) |
| Berhenti | "Berhenti mendengarkan", "Matikan mikrofon", "Stop" |

**Tindakan sensitif tidak dijalankan lewat suara.** Mengirim formulir, mengirim SOS, memesan relawan, dan menghapus data selalu butuh ketukan tombol. Ini disengaja agar salah dengar tidak berakibat fatal.

## 6. Rancangan aksesibilitas

Karena produk ini untuk lansia dan penyandang disabilitas, aksesibilitas adalah syarat dasar, bukan fitur tambahan.

- Semua elemen interaktif punya nama yang dapat dibaca pembaca layar, dan semua fungsi dapat dioperasikan dengan keyboard.
- Informasi tidak pernah disampaikan hanya lewat warna. Selalu ada ikon, pola, atau teks pendamping.
- Target sentuh pada antarmuka lansia minimal 44 × 44 piksel, dengan satu keputusan per layar.
- Perubahan langkah dan status diumumkan lewat `aria-live`. Urutan pembacaan menaruh daftar langkah sebelum peta.
- Setiap fungsi bersuara punya jalur teks yang setara. Bila suara gagal, teks tetap tampil.
- Ukuran teks dapat diperbesar, bahkan lewat suara.
- Kedua sisi antarmuka memenuhi WCAG 2.1 AA. Yang berbeda hanya kanal utamanya: Sisi A (lansia) mengutamakan audio, sentuh, dan getar. Sisi B (keluarga, relawan, pemeta, admin) mengutamakan tampilan visual yang padat.

## 7. Batas klaim produk

UNSTOPPABLE sengaja memperdalam satu hal, yaitu akses fisik lansia ke layanan kesehatan dan aktivitas sehari-hari.

| Yang dilakukan | Yang tidak dilakukan |
| --- | --- |
| Rute sesuai kondisi, pendampingan, dan SOS | Memantau tanda vital atau mendeteksi perburukan penyakit |
| Memberi keluarga visibilitas perjalanan sesuai izin lansia | Mengelola kepatuhan minum obat |
| Mendeteksi perjalanan yang terhenti tanpa penjelasan | Menggantikan pemeriksaan tenaga kesehatan |

Batas teknis yang perlu diketahui saat demo:

- Pergantian instruksi perjalanan dilakukan lewat tombol "Berikutnya" atau perintah "Langkah berikutnya". GPS memperbarui lokasi, tetapi belum otomatis memajukan instruksi saat mendekati belokan.
- Mikrofon berhenti mendengarkan ketika tab tersembunyi atau layar terkunci dan perlu diaktifkan ulang.
- SOS dikirim lewat koneksi realtime ke penerima yang sedang terhubung. Tidak ada SMS atau panggilan otomatis ke layanan darurat.
- **Data graf di demo bersifat sintetis.** Repository ini tidak memuat hasil survei lapangan asli. Gedung bertanda `[DEV]`, `[DEMO]`, atau `[DEMO FT]` memakai atribut contoh dengan `surveyedAt = null`. Jangan menjadikannya panduan berjalan di lapangan.

## 8. Akun demo

> **Akun ini khusus demo dan datanya adalah data contoh, bukan hasil survei lapangan.** Nomor telepon di bawah fiktif dan tidak terhubung ke orang sungguhan. Jangan memasukkan data pribadi ke akun ini. Pendaftaran akun baru memakai OTP email sehingga membutuhkan alamat email yang dapat menerima kode. Untuk masuk, buka [halaman masuk](https://unstoppable-mu.vercel.app/login).

| Peran                             | Nama                      | Nomor telepon | Kata sandi        | Keterangan                                                                      |
| --------------------------------- | ------------------------- | ------------- | ----------------- | ------------------------------------------------------------------------------- |
| Lansia pengguna kursi roda        | Bu Sari (Demo Kursi Roda) | `08000000001` | `Demo-a3jagEcuqR` | Profil `wheelchair`. Tertaut ke akun keluarga dengan mode berbagi `during_trip` |
| Lansia dengan penglihatan menurun | Pak Budi (Demo Tunanetra) | `08000000002` | `Demo-Lb57FRSfXG` | Profil `blind`. Antarmuka berbasis audio                                        |
| Keluarga yang merawat             | Rina (Demo Keluarga)      | `08000000003` | `Demo-T6sk5wMJ6Y` | Memantau perjalanan Bu Sari                                                     |
| Relawan pendamping                | Dimas (Demo Relawan)      | `08000000004` | `Demo-6JYCgQA4SB` | Mengajukan diri dan menawarkan pendampingan                                     |

Skrip demo lengkap dengan lima peran, rute TETI ke Geologi, SOS, dan laporan ramp ada di [qa/ft-ugm-demo/README.md](qa/ft-ugm-demo/README.md). Dataset demo sintetis dijelaskan di [backend/prisma/demo-release.README.md](backend/prisma/demo-release.README.md).

---

# Untuk pengembang

## 9. Arsitektur dan teknologi

```text
        Frontend (Next.js, Vercel)
           |             |
       HTTP REST      Socket.io
           |             |
        Backend (Node.js, Express 5, node-cron)
        |        |          |           |
   Prisma/SQL   HTTP     Gemini API   Supabase Storage
        |      internal
 PostgreSQL         Voice microservice
 PostGIS + pgRouting  (FastAPI, Whisper, Piper)
```

| Lapisan     | Teknologi                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Frontend    | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, React Aria, Leaflet, socket.io-client |
| Backend     | Node.js 22+, Express 5, TypeScript, Socket.io, node-cron, Zod, Helmet                              |
| Autentikasi | OTP email (Nodemailer), JWT access dan refresh token                                               |
| Database    | PostgreSQL dengan PostGIS dan pgRouting, lewat Prisma 7 dan raw SQL untuk kueri geospasial         |
| Penyimpanan | Supabase Storage (foto laporan)                                                                    |
| Suara       | Python 3.11, FastAPI, faster-whisper (STT), Piper (TTS)                                            |
| AI          | Google Gemini, hanya untuk merangkai kalimat dan percakapan perencanaan                            |
| Lainnya     | Photon (geocoding OSM), Web Push (VAPID)                                                           |

Keputusan penting:

- **Satu graf, banyak profil.** Rute dihitung dengan `pgr_dijkstra` di database, dan biaya tiap edge dihitung saat permintaan dari atribut edge dan bobot profil.
- **Voice microservice terpisah** dan hanya dapat dipanggil backend lewat header `X-Internal-Key`. Bila tidak aktif, backend membalas `503 SPEECH_UNAVAILABLE` dan frontend beralih ke Web Speech API.
- **Koordinat** di API dan PostGIS berurutan `[longitude, latitude]`. Leaflet memakai `[latitude, longitude]`, dan konversinya hanya dilakukan di frontend.
- **Waktu** disimpan sebagai `TIMESTAMPTZ`, dikirim ISO 8601, ditampilkan dalam WIB.

Skema database: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) dan [ERD_UNSTOPPABLE.png](ERD_UNSTOPPABLE.png). Penjelasan lebih lengkap: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 10. Struktur repository

```text
unstoppable
├── backend/               Server Node.js + Express (src/modules per domain, realtime, jobs, middleware)
│   └── prisma/            Skema, migrasi, seed, dan fixture demo
├── frontend/              Aplikasi Next.js (src/app, src/screens, src/components, src/contexts, src/lib)
├── voice-microservices/   Layanan Python untuk STT dan TTS
├── deploy/gce/            Docker Compose, nginx, dan skrip deploy untuk VM
├── qa/                    Skrip demo dan verifikasi (core-demo, ft-ugm-demo)
├── docs/                  Arsitektur, model data, kontrak API, panduan survei, kontribusi
├── API_DOCS.md            Dokumentasi endpoint HTTP dan WebSocket
└── PRD-UNSTOPPABLE-v1.4.md
```

Modul backend: `auth`, `users`, `accessibility-profiles`, `routes`, `narration`, `speech`, `graph`, `verification`, `reports`, `buildings`, `volunteers`, `companions`, `sessions`, `sos`, `ai-planner`, `trips`, `notifications`, `geocode`, `communities`, `transit-demo`, dan `health`.

Penjadwal di `backend/src/jobs` menangani eskalasi SOS, deteksi sesi perjalanan yang tidak aktif, pengingat pendampingan dan rencana perjalanan, kedaluwarsa laporan, serta pembersihan data ping lokasi dan audit log.

## 11. Menjalankan di komputer lokal

**Prasyarat:** Node.js 22+, Git, dan PostgreSQL dengan ekstensi `postgis`, `pgrouting`, dan `pgcrypto` (termudah lewat [Supabase](https://supabase.com)). Python 3.11 dan kunci Gemini bersifat opsional.

```bash
git clone https://github.com/AnthonyS051105/unstoppable.git
cd unstoppable
```

**Backend** (dari folder `backend`):

```bash
cp .env.example .env        # isi minimal DATABASE_URL, JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run prisma:generate
npm run prisma:migrate
npx tsx prisma/accessibility-profiles.seed.ts   # wajib: empat profil acuan
npm run dev                                     # http://localhost:4000
curl http://localhost:4000/health               # harus berisi "status":"ok" dan "db":"ok"
```

**Frontend** (dari folder `frontend`):

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api, NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
npm install
npm run dev                  # http://localhost:3000
```

**Voice microservice (opsional)**: tanpa layanan ini aplikasi tetap berjalan dengan suara bawaan browser.

```bash
cd voice-microservices
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # isi INTERNAL_API_KEY dengan string acak
uvicorn app.main:app --port 8080
```

Lalu isi `SPEECH_SERVICE_URL` dan `SPEECH_SERVICE_API_KEY` (harus sama dengan `INTERNAL_API_KEY`) di `backend/.env`.

**Data contoh untuk pengembangan.** Gunakan seed bertanda dev, jangan di produksi.

```bash
cd backend
npx tsx prisma/graph.dev.seed.ts
npx tsx prisma/road-reports.dev.seed.ts
npx tsx prisma/communities.dev.seed.ts
```

Untuk dataset demo yang lebih lengkap (akun lima peran, rute FT UGM), ikuti [qa/ft-ugm-demo/README.md](qa/ft-ugm-demo/README.md). Seeder demo berjalan dry-run secara bawaan dan butuh flag `--apply` beserta `--ack-fixture`.

**OTP saat pengembangan.** Bila `SMTP_USER` dan `SMTP_PASS` kosong, kode OTP dicetak di log server backend, lalu masukkan di layar OTP.

## 12. Variabel lingkungan

**Backend** (`backend/.env`)

| Variabel | Wajib | Fungsi |
| --- | --- | --- |
| `DATABASE_URL` | Ya | Connection string PostgreSQL. Untuk Supabase pooler gunakan `sslmode=require` dan `uselibpqcompat=true` |
| `JWT_SECRET` | Ya | Rahasia penanda tangan token |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Ya | Penyimpanan foto laporan. Kunci jangan pernah dikirim ke frontend |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Tidak | Pengiriman OTP email (Gmail SMTP). Bila kosong, OTP dicetak di log. Wajib diisi di produksi |
| `SPEECH_SERVICE_URL`, `SPEECH_SERVICE_API_KEY` | Tidak | Alamat dan kunci voice microservice |
| `GEMINI_API_KEY` | Tidak | AI Planner dan narasi berbantuan model bahasa |
| `GEOCODER_URL` | Tidak | Alamat Photon |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Tidak | Web Push. Buat dengan `npx web-push generate-vapid-keys` |
| `PORT`, `FRONTEND_URL` | Tidak | Port (bawaan 4000) dan origin untuk CORS dan Socket.io |

**Frontend** (`frontend/.env.local`): `NEXT_PUBLIC_API_BASE_URL` (termasuk `/api`), `NEXT_PUBLIC_SOCKET_URL` (tanpa `/api`), dan opsional `NEXT_PUBLIC_MAP_TILE_URL`.

**Voice microservice** (`voice-microservices/.env`): `INTERNAL_API_KEY`, `WHISPER_MODEL_SIZE` (`tiny`, `base`, atau `small`), `WHISPER_COMPUTE_TYPE`, `WHISPER_LANGUAGE`, `MAX_AUDIO_BYTES`.

File `.env` dan `.env.local` sudah masuk `.gitignore`. Jangan pernah mengunggah rahasia.

## 13. Pengujian dan deployment

```bash
cd backend && npm test                                  # Vitest
cd frontend && npm test && npm run lint && npm run build
cd voice-microservices && pip install pytest httpx && python -m pytest tests
```

Skrip uji manual untuk Socket.io dan SOS ada di `backend/scripts/manual-tests`. Setiap perubahan sebaiknya juga diuji manual, termasuk dioperasikan hanya dengan keyboard.

| Komponen | Platform | Catatan |
| --- | --- | --- |
| Database dan storage | Supabase | Aktifkan PostGIS, pgRouting, dan pgcrypto |
| Backend dan voice | VM Google Compute Engine | Docker Compose dengan nginx di depan. Pembaruan lewat `git pull` dan GitHub Action saat push ke `main`. Backend harus **satu replika** karena cron dan room Socket.io hidup di dalam proses. Panduan: [docs/DEPLOY_GCE.md](docs/DEPLOY_GCE.md) |
| Frontend | Vercel | Atur `NEXT_PUBLIC_API_BASE_URL` dan `NEXT_PUBLIC_SOCKET_URL` ke alamat backend produksi |

Sebelum meluncurkan ke pengguna sungguhan: isi `JWT_SECRET` dan `INTERNAL_API_KEY` dengan nilai acak kuat, konfigurasikan SMTP, isi `FRONTEND_URL` persis dengan alamat frontend, isi kunci VAPID, jangan jalankan seed dev atau demo di database produksi, dan pastikan data graf berasal dari survei nyata.

## 14. API, keamanan, dan prinsip data

**API.** Seluruh endpoint HTTP berada di bawah `/api` (ditambah `/health`), dan event WebSocket diautentikasi dengan token saat handshake. Respons memakai amplop seragam dan koordinat `[longitude, latitude]`. Daftar lengkap, contoh permintaan, dan kode galat ada di [API_DOCS.md](API_DOCS.md). Kontrak bersama BE dan FE ada di [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

**Keamanan.** Helmet dan CORS terbatas ke origin frontend, pembatasan laju per endpoint (termasuk pengiriman ulang OTP), validasi Zod, akses berbasis peran (RBAC), audit log untuk tindakan penting, dan voice microservice yang menolak permintaan tanpa kunci internal.

**Privasi.** Lokasi lansia hanya dibagikan ke keluarga yang diberi izin oleh lansia itu sendiri. Admin dan verifikator tidak berhak melihat lokasi pengguna. Data ping lokasi dihapus otomatis setiap hari.

**Prinsip data survei.**

- Data graf berasal dari survei lapangan nyata. Data karangan tidak boleh tampak seperti hasil survei, jadi seed dev memakai nama berkas `*.dev.seed.ts` dan `surveyedAt = null`.
- Fakta fisik dalam narasi rute selalu berasal dari database, bukan dikarang model bahasa.
- Data baru dan laporan komunitas harus lolos verifikasi sebelum dipakai perutean.

**Keselamatan pendampingan.** SOS tidak boleh gagal senyap, relawan tidak pernah ditugaskan otomatis, dan check-in selalu dua arah.

## 15. Berkontribusi, peta jalan, dan lisensi

**Berkontribusi.** Fork repository, buat cabang dari `dev` (`feat/`, `fix/`, `docs/`), tulis pesan commit singkat satu baris, dan buka pull request ke `dev`. Perubahan pada kontrak API atau skema database diusulkan lebih dahulu karena berdampak ke seluruh pengembang. Jangan menambah dependensi baru tanpa alasan kuat. Detail ada di [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). Kerentanan keamanan jangan dibuka sebagai isu publik. Hubungi tim secara langsung.

**Peta jalan.** Pemantauan kepatuhan pengobatan, perluasan survei ke area sekitar puskesmas dan rumah sakit, deteksi jatuh, rekaman audio SOS dan cadangan SMS, mode area asing, serta ekspor laporan perjalanan.

**Tautan.**

| Tautan | Alamat |
| --- | --- |
| Video produk | [youtu.be/w62FXJ5yehc](https://youtu.be/w62FXJ5yehc) |
| Desain di Figma | [Buka desain Figma](https://www.figma.com/design/BER7jSpsxrUDjA5DPtY4Le/Untitled?node-id=1-3&t=tXmqbTNQcliSgr1K-1) |
| Website | [unstoppable-mu.vercel.app](https://unstoppable-mu.vercel.app) |
| PRD | [PRD-UNSTOPPABLE-v1.4.md](PRD-UNSTOPPABLE-v1.4.md) |

Tim apaya (K1) mengembangkan UNSTOPPABLE untuk Hackathon JOINTS UGM 2026 pada subtema Healthcare.

**Lisensi.** Dirilis sebagai perangkat lunak sumber terbuka di bawah Lisensi MIT. Data survei lapangan bersifat terpisah dari kode dan hanya berlaku untuk area yang disurvei. Mohon jangan memakai data aksesibilitas yang tidak diverifikasi untuk keputusan keselamatan.
