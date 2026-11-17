# Demo panduan suara di sekitar FT UGM

Durasi rekomendasi: 10–12 menit. Demo utama TETI → Geologi; Tugu Teknik → FMIPA adalah cadangan. Dua profil lansia saja: pengguna kursi roda dan tunanetra. Gunakan dua akun lansia berbeda agar profil dan riwayat tidak tercampur.

## Mulai merekam

1. Buka **http://localhost:3011** pada komputer ini. Backend demo berjalan di http://localhost:4011/api dengan database lokal terpisah `ft_demo`. Akun dan kata sandi ada di berkas privat `/tmp/unstoppable-ft-demo/AKUN-DEMO-FT-UGM.md`. Data ini belum dipasang pada database website publik.
2. Siapkan sesi browser terpisah untuk Budi, Sari, Rina, Andi, dan Admin. Gunakan profil Chrome berbeda atau browser berbeda. Tab biasa dalam satu profil berbagi login. Untuk tampilan lansia gunakan viewport mobile sekitar 390 × 844; keluarga/relawan/admin boleh desktop.
3. Izinkan lokasi dan mikrofon. Aktifkan **Pengaturan → Bahasa & Suara → Narasi**. Tekan mikrofon di navbar, kemudian **Izinkan & mulai**. Dalam mode kendali langsung, ucapkan perintah tanpa awalan.
4. Untuk mendemokan wake voice, pilih mode **Halo Unstoppable** pada pengaturan suara lalu **Izinkan & mulai**. Awali SETIAP perintah dengan “Halo Unstoppable”, misalnya “Halo Unstoppable, ulangi petunjuk”. Bisa juga ucapkan frasa pemicu lalu satu perintah dalam delapan detik. Tunggu narasi selesai sebelum berbicara lagi.
5. Jika tidak berada di FT, gunakan Chrome DevTools → Command Menu → **Show Sensors** → Location → **Other / Custom location**. Masukkan latitude `-7.7655068`, longitude `110.3717538`, akurasi sekitar 5 meter. Terapkan pada jendela lansia yang dipakai. Ini simulasi GPS untuk rekaman; jelaskan kepada penonton. [Dokumentasi Chrome Sensors](https://developer.chrome.com/docs/devtools/sensors/).
6. Biarkan halaman penerima SOS terbuka dan tersambung. Matikan mikrofon di jendela selain lansia agar tidak saling menangkap suara. Jangan aktifkan opsi “Simulasikan tidak ada penerima”.

**Batas yang perlu disampaikan:** pergantian instruksi perjalanan saat ini melalui tombol Berikutnya atau perintah “Langkah berikutnya”. GPS memperbarui lokasi, tetapi belum otomatis memajukan instruksi saat mendekati belokan. Jangan mengklaim navigasi otomatis berdasarkan posisi. Mikrofon juga tidak terus mendengarkan ketika tab tersembunyi atau layar terkunci; aktifkan kembali jika berhenti.

## Akun dan pembagian layar

| Pemeran | Nomor login dummy | Role / profil | Halaman utama |
|---|---|---|---|
| Pak Budi | 089900002001 | `mobility_user` / `wheelchair` | `/home` |
| Bu Sari | 089900002002 | `blind_user` / `blind` | `/home` |
| Rina, keluarga | 089900002003 | `caregiver` | `/caregiver` |
| Andi, relawan sekaligus pemeta | 089900002004 | relawan terverifikasi; pendampingan + pemetaan | `/dashboard`, `/sos-active`, `/editor` |
| Admin verifikator | 089900002005 | `admin` | `/verification` |

Rina sudah tertaut ke Budi dengan izin **selama perjalanan**, dan ke Sari dengan izin **hanya saat SOS**. Andi aktif dan memiliki wilayah layanan radius 1.500 meter di FT. Nomor di atas hanya identitas login latihan; tidak dikirim SMS.

## Adegan 1 — Lansia mandiri dengan panduan suara (3 menit)

Narasi pemeran: **“Saya Pak Budi. Saya menggunakan kursi roda dan ingin ke Teknik Geologi. Saya perlu jalur yang tidak melewati tangga.”**

1. Masuk sebagai Budi, perlihatkan kondisi kursi roda dan lokasi asal TETI. Ucapkan **“Cari teknik geologi”**. Pastikan yang terbuka adalah **[DEMO FT] Teknik Geologi UGM**.
2. Pada detail tempat, ketuk **Cari rute ke sini**. Tombol ini tetap diketuk; perintah suara “Cari rute” membuka pencarian, bukan otomatis menyetujui tujuan.
3. Perlihatkan garis rute dan informasi belum disurvei. Ucapkan **“Baca rute”**, tunggu selesai, lalu **“Mulai perjalanan”**.
4. Dengarkan instruksi pertama. Ucapkan **“Ulangi petunjuk”**, **“Langkah berikutnya”**, **“Jeda perjalanan”**, lalu **“Lanjutkan perjalanan”**. Bisa dilakukan sambil duduk. Untuk mode wake, tambahkan “Halo Unstoppable” pada setiap perintah.
5. Beralih ke Rina → **Pantau Perjalanan** milik Budi. Tunjukkan perjalanan aktif, izin berbagi, dan posisi. Jangan selesaikan perjalanan Budi dulu jika akan lanjut ke SOS.

Kalimat penutup adegan: **“Saya bisa meminta petunjuk diulang tanpa membaca semua tulisan di layar. Keluarga memantau sesuai izin yang saya berikan.”**

## Adegan 2 — Tujuan sama, kebutuhan berbeda (1–2 menit)

Masuk sebagai Sari, gunakan asal TETI yang sama, cari tujuan **[DEMO FT] Teknik Geologi UGM**, lalu hitung rute. Bandingkan kedua garis peta atau rekam bergantian.

| Perjalanan | Kursi roda — Budi | Tunanetra — Sari |
|---|---|---|
| TETI → Geologi, demo utama | **198,1 m**, sekitar 3 menit; tanpa tangga | **156,2 m**, sekitar 3 menit; guiding block; satu segmen 4 anak tangga dengan pegangan |
| Tugu Teknik → FMIPA (Fisika), cadangan | **690,3 m**, sekitar 10 menit; menghindari cabang tangga | **689,1 m**, sekitar 10 menit; cabang berbeda dengan guiding block |

Penjelasan: profil kursi roda memblokir tangga. Profil tunanetra dalam skenario ini dapat menggunakan tangga dengan pegangan dan memberi penalti pada jalur tanpa guiding block. Ini kebutuhan persona Sari, bukan asumsi bahwa setiap lansia tunanetra dapat menggunakan tangga. Waktu merupakan estimasi sistem, bukan pengukuran kecepatan pribadi.

TETI → Geologi paling jelas untuk video karena perbedaan jalurnya lebih terlihat. Pada Tugu → FMIPA jaraknya hampir sama; perbedaannya adalah pemilihan cabang.

## Adegan 3 — SOS dan respons relawan (2 menit)

Narasi pemeran: **“Saya merasa tidak sanggup melanjutkan perjalanan dan membutuhkan bantuan.”**

1. Pastikan Rina membuka `/caregiver` dan Andi membuka **Dashboard Relawan** (`/dashboard`) sebelum kejadian. Periksa koneksi aktif.
2. Pada Budi, ucapkan **“SOS”** untuk membuka layar SOS. **Tahan tombol SOS selama 1,5 detik** untuk benar-benar mengirim. Perintah suara saja tidak mengirim darurat.
3. Tunjukkan Rina menerima pemberitahuan **SOS dari Pak Budi**. Tekan **Lihat lokasi SOS** untuk membuka titik kejadian dan status responden. Server tetap memeriksa izin keluarga saat lokasi dibuka.
4. Tunjukkan kartu SOS baru Andi dengan nama Budi. Tekan **Bantu / Menuju Lokasi**. Kembali ke Budi: nama Andi dan status **Menuju Anda** tampil. Jangan menggunakan kartu contoh awal “Budi / demo-sos” sebagai bukti penerimaan; gunakan kejadian dengan identitas [DEMO FT] yang baru dikirim.
5. Akhiri latihan melalui **Batalkan SOS** dan konfirmasi. Keluarga serta relawan yang sudah merespons memperoleh sinyal penutupan.

| Pihak | Apa yang terjadi ketika SOS dikirim |
|---|---|
| Rina, keluarga tertaut | Menerima event langsung `sos:triggered`; dapat memeriksa titik SOS sesuai izin. Budi selama perjalanan dan Sari hanya saat SOS adalah dua contoh izin yang berbeda. |
| Andi, relawan terverifikasi dan aktif dalam cakupan | Menerima `sos:new`, lalu bisa merespons. Pencarian bertahap memakai cakupan wilayah layanan 1 / 3 / 5 km; bukan jaminan relawan berada di titik GPS terdekat saat itu. |
| Budi, pengirim | Melihat jumlah penerima, responden, dan pembaruan status. |
| Admin / pemeta biasa | **Tidak menerima SOS otomatis.** |
| Polisi, rumah sakit, nomor 112 | **Tidak dihubungi otomatis.** |

Pengiriman ini melalui koneksi socket. Jangan menjanjikan SMS, telepon otomatis, atau push saat aplikasi penerima tertutup. Tidak ada jaminan event SOS muncul sebagai notifikasi tersimpan di inbox. Untuk rekaman, halaman penerima harus terbuka. Setelah tidak ada respons, ada tahapan eskalasi internal; jangan menyebutnya panggilan otomatis ke layanan darurat.

## Adegan 4 — Lapor ramp terhalang → verifikasi → pendamping (3 menit)

Narasi pemeran: **“Ramp di depan saya tertutup barang. Saya melapor agar pengguna lain dan pengelola mengetahui hambatannya.”**

1. Sebelum laporan, jalankan perjalanan Sari dari TETI ke Geologi, agar ada pengguna lain dengan perjalanan aktif di sekitar lokasi. Biarkan halamannya terbuka.
2. Budi membuka **Lapor → Ramp terhalang → Lanjutkan**. Pilih titik hambatan di peta sekitar latitude `-7.7652844`, longitude `110.3718686`. Titik juga tersedia sebagai fitur Point pada `routes.geojson` dan `manifest-*.json` privat.
3. Pilih keparahan **Tinggi**, isi **“[DEMO FT] Ramp tertutup barang. Ini laporan latihan, bukan kejadian nyata.”** Foto opsional. Ketuk **Kirim Laporan** dan tunjukkan konfirmasi server.
4. Pada Sari muncul pemberitahuan hambatan sekitar perjalanan. Pengguna lain dengan perjalanan aktif dalam 500 m adalah penerima event `report:nearby`; pelapor sendiri dikecualikan. Keluarga dan seluruh relawan tidak otomatis menerima setiap laporan.
5. Admin membuka **Antrean Verifikasi**, muat ulang jika perlu, pilih laporan Budi. Tinjau lokasi dan deskripsi, lalu setujui dampak **block / blokir**. Laporan baru awalnya berdampak **degrade**; penutupan penuh diperlihatkan setelah keputusan admin.
6. Budi menghitung ulang rute yang sama. Dalam jaringan dummy ini ramp adalah satu-satunya cabang tanpa tangga; setelah diblokir, profil kursi roda akan mendapat **Tidak terjangkau**. Sari masih memiliki cabang alternatif sesuai profil. Aplikasi belum otomatis menghitung ulang hanya karena laporan masuk.
7. Budi memilih **Minta Pendamping**, tujuan Geologi, titik temu TETI, waktu sekitar 90 menit ke depan, jenis bantuan kursi roda; awali catatan dengan **[DEMO FT]**. Ajukan dengan tombol.
8. Andi membuka **Permintaan Dampingan**, memilih permintaan Budi dan menawarkan bantuan. Budi memilih tawaran Andi. Saat dikonfirmasi, pengirim, relawan terpilih, dan keluarga tertaut menerima event konfirmasi. Permintaan terbuka tidak otomatis mengirim pemberitahuan ke semua relawan.
9. Jika waktu tersedia, perlihatkan konfirmasi bertemu dan selesai oleh **kedua pihak**. Jangan menampilkan permintaan yang sekadar dibuat sebagai pendampingan yang sudah diterima.

Tambahan opsional: Sari dapat menguatkan laporan Budi satu kali. Pelapor tidak boleh menguatkan laporannya sendiri. Admin dapat menolak laporan latihan setelah selesai untuk menghilangkan dampak pada rute.

## Adegan 5 — Pemeta dan admin (1 menit, opsional)

Andi memiliki dua kemampuan dalam satu role relawan sehingga tidak perlu akun keenam. Buka **Peta Editor** dan buat usulan titik/jalur dengan awalan **[DEMO FT]**. Data masuk sebagai draft. Pada akun Admin buka **Antrean Verifikasi** dan tinjau usulan tersebut. Persetujuan adalah langkah yang membuat data layak dipakai jaringan; jangan menyebut draft sebagai hasil survei terverifikasi.

Seeder juga menyediakan satu draft **[DEMO FT] Usulan tempat istirahat TETI** untuk menunjukkan antrean tanpa menggambar saat rekaman. Tinjau lalu tolak dengan alasan latihan selesai agar tidak menambah data yang dianggap nyata. Fitur role admin lain yang dapat diperlihatkan singkat: verifikasi relawan, topologi graf, dan ekspor laporan.

## Data dan sumber

Koordinat berikut adalah titik jangkar jalan untuk skenario, bukan pintu masuk gedung yang sudah diverifikasi. Urutan dalam JSON/GeoJSON adalah **longitude, latitude**; tabel di bawah menggunakan latitude, longitude agar mudah dimasukkan ke Sensors.

| Titik | Latitude | Longitude |
|---|---:|---:|
| Asal TETI | -7.7655068 | 110.3717538 |
| Tujuan Geologi | -7.7655304 | 110.3727871 |
| Asal Tugu Teknik | -7.7660728 | 110.3739703 |
| Tujuan FMIPA (Fisika) | -7.7671729 | 110.3758043 |
| Ramp latihan TETI–Geologi | -7.7652844 | 110.3718686 |

Geometri mengikuti simpul/jalan [OpenStreetMap](https://www.openstreetmap.org/copyright), dengan orientasi lokasi dari [Peta Kampus UGM 2023](https://geo.ugm.ac.id/wp-content/uploads/sites/13/2023/12/Peta-Lingkungan-Kampus-Universitas-Gadjah-Mada-2023.pdf). Nama memakai awalan **[DEMO FT]**. Lebar, kemiringan, guiding block, tangga, pegangan, dan ramp **sintetis**, tidak mewakili hasil survei lapangan. Beberapa jalan sumber mempunyai pembatasan akses; skenario tidak membuktikan izin melintas. Lakukan demonstrasi perangkat lunak sambil duduk; jangan gunakan fixture sebagai panduan berjalan di lapangan. `surveyed_at` tetap NULL; skor survei tidak dibuat-buat.

Berkas:

- `backend/prisma/ft-ugm-demo.paths.json`: geometri sumber, provenance OSM, dua pasang asal–tujuan.
- `backend/prisma/ft-ugm-demo.fixture.ts`: lima persona, cabang jalur, atribut aksesibilitas sintetis.
- `backend/prisma/ft-ugm-demo.seed.ts`: seeder idempoten; default hanya dry-run. Menolak tabrakan dengan akun/data nonfixture; tidak mengubah profil aksesibilitas sistem.
- `qa/ft-ugm-demo/routes.geojson`: empat rute keluaran mesin routing plus titik asal, tujuan, dan laporan; bisa dibuka di penampil GeoJSON.
- `/tmp/unstoppable-ft-demo/manifest-*.json`: ID aktual dan titik laporan untuk database lokal.
- Kata sandi dibuat acak dan disimpan dengan izin privat; tidak ada kata sandi atau token pada repository.

## Menyiapkan ulang di komputer ini

Dari root repository, gunakan database lokal khusus; jangan menyalin `.env` produksi ke layanan demo.

```bash
# Jika kontainer sudah ada (seperti pada komputer ini):
docker start unstoppable-ft-demo-db
# Untuk instalasi pertama, gunakan ini sebagai pengganti docker start:
# docker run -d --name unstoppable-ft-demo-db -e POSTGRES_PASSWORD=ft-demo-local-only -e POSTGRES_DB=ft_demo -p 127.0.0.1:55479:5432 pgrouting/pgrouting:16-3.4-3.6.1
export DATABASE_URL='postgresql://postgres:ft-demo-local-only@127.0.0.1:55479/ft_demo'
cd backend
npx prisma migrate deploy
npx tsx prisma/accessibility-profiles.seed.ts
npx tsx prisma/ft-ugm-demo.seed.ts
npx tsx prisma/ft-ugm-demo.seed.ts --apply --ack-fixture=ft-ugm-demo-v1
```

Pada terminal backend dari root repo:

```bash
PORT=4011 DATABASE_URL='postgresql://postgres:ft-demo-local-only@127.0.0.1:55479/ft_demo' JWT_SECRET='ft-demo-local-only-strong-secret-node-exercise' FRONTEND_URL=http://localhost:3011 NODE_ENV=test ./backend/node_modules/.bin/tsx watch backend/src/index.ts
```

Pada terminal frontend (dependensi harus sudah terpasang):

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://localhost:4011/api NEXT_PUBLIC_SOCKET_URL=http://localhost:4011 npm run dev -- --port 3011 --webpack
```

Periksa port sebelum memulai ulang karena saat disiapkan layanan sudah berjalan. Seeder berulang mempertahankan ID dan kata sandi yang sudah ada; berkas kredensial run berikutnya hanya memuat akun yang baru dibuat. Simpan berkas kredensial pertama yang berisi lima akun. Untuk target remote, seeder juga memerlukan `--ack-target=<hostname>`; paket ini tidak menjalankan penulisan remote.

## Mengulang rekaman / reset lokal

Batalkan SOS dan perjalanan lewat UI terlebih dahulu agar penerima memperoleh event penutupan. Untuk membersihkan sisa latihan lokal:

```bash
DATABASE_URL='postgresql://postgres:ft-demo-local-only@127.0.0.1:55479/ft_demo' ./backend/node_modules/.bin/tsx qa/ft-ugm-demo/reset-local.mts
```

Reset menutup sesi/SOS/booking fixture dan menolak laporan aktif berawalan [DEMO FT]. Riwayat, akun, serta graf tetap ada. Refresh halaman semua pemeran setelah reset. Script menolak database selain localhost/ft_demo. Rute baseline kembali tersedia setelah dampak laporan dihilangkan.

## Verifikasi teknis

```bash
# Guard, geometri, profil, route engine PostGIS dan idempotensi:
cd backend
FT_DEMO_TEST_DB=1 DATABASE_URL='postgresql://postgres:ft-demo-local-only@127.0.0.1:55479/ft_demo' npx vitest run prisma/ft-ugm-demo.test.ts
# Dari root, backend lokal harus menyala:
node qa/ft-ugm-demo/verify-local.mjs
# QA browser memerlukan Playwright dan Chromium yang terpasang:
node qa/ft-ugm-demo/verify-ui.mjs
```

`verify-local.mjs` menguji login lima role, empat rute nyata, penerima SOS, respons/cancel, laporan/autolink, blokir rute, booking sampai kedua pihak selesai, draft pemeta dan antrean admin. `verify-ui.mjs` memakai API lokal sungguhan; input/output speech disimulasikan agar deterministik. Tes tersebut bukan bukti bahwa mikrofon fisik dan layanan pengenalan suara browser bekerja; lakukan satu percobaan suara sebelum merekam. Chat Asisten Perjalanan adalah fitur tambahan yang membutuhkan konfigurasi layanan AI; bukan prasyarat demo panduan suara ini.
