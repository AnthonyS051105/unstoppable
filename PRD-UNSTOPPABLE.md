# Product Requirements Document (PRD)

# UNSTOPPABLE — Aplikasi Navigasi & Pendampingan Aksesibilitas

# untuk Penyandang Tunanetra dan Disabilitas Mobilitas

**Versi**: 1.2 \
**Tipe produk**: Web Application (PWA), diakses lewat browser HP (dominan) dan desktop \
**Target lomba**: Hackathon JOINTS UGM 2026 — batas pengumpulan **16 Oktober 2026** (waktu pengerjaan efektif ±6,5 minggu sejak 30 Agustus 2026), Grand Final 1 November 2026 \
**Area pilot**: Fakultas Teknik & FMIPA UGM (opsional: GIK UGM) \

---

## Daftar Isi

1. [Deskripsi Project](#1-deskripsi-project)
2. [User Story](#2-user-story)
3. [User Flow](#3-user-flow)
4. [Daftar Fitur](#4-daftar-fitur)
5. [Daftar Requirement Teknis Lengkap](#5-daftar-requirement-teknis-lengkap)
6. [Data Flow](#6-data-flow)
7. [Skema Database (PostgreSQL + PostGIS)](#7-skema-database-postgresql--postgis)
8. [Keamanan Siber & Keamanan Data](#8-keamanan-siber--keamanan-data)
9. [Hal Teknis Backend](#9-hal-teknis-backend)
10. [Hal Teknis Frontend](#10-hal-teknis-frontend)
11. [Rencana Validasi Pengguna](#11-rencana-validasi-pengguna)
12. [Timeline & Pembagian Kerja](#12-timeline--pembagian-kerja)
13. [Daftar Risiko (Risk Register)](#13-daftar-risiko-risk-register)
14. [Strategi Demo & Kelengkapan Pengumpulan](#14-strategi-demo--kelengkapan-pengumpulan)
15. [Daftar Koreksi & Catatan Terbuka](#15-daftar-koreksi--catatan-terbuka)
16. [Ringkasan Perubahan Versi](#16-ringkasan-perubahan-versi)

---

## 1. Deskripsi Project

### 1.1 Latar Belakang

Trotoar dan infrastruktur pejalan kaki di Indonesia secara luas belum ramah disabilitas. Riset dan laporan lapangan menunjukkan guiding block (jalur pemandu tunanetra) yang sudah terpasang di berbagai kota justru sering ditemukan salah arah (mengarah ke pipa, tiang, atau bahaya lain), terputus di tengah jalan, rusak tanpa perbaikan, atau terhalang kendaraan parkir dan pedagang kaki lima. Kondisi ini membuat penyandang tunanetra tidak bisa sepenuhnya mengandalkan infrastruktur fisik yang ada, bahkan yang sudah "resmi" dibangun sekalipun.

Solusi navigasi yang tersedia saat ini punya keterbatasan yang saling melengkapi tapi tidak ada yang menggabungkan semuanya:

- **Google Maps aksesibilitas** kuat di data peta dan rute, tapi asumsi kondisi fisik jalur sesuai standar (padahal riset menunjukkan sering tidak), dan tidak ada komunitas atau pengawasan caregiver.
- **Be My Eyes** kuat di bantuan relawan real-time berbasis video call, tapi tidak berbasis rute/peta terstruktur, dan tidak ada fitur pengawasan caregiver.
- **Aplikasi lokal seperti PetaNetra** fokus di panduan lisan lokasi, tapi cakupan dan fitur komunitas/safety masih terbatas.

UNSTOPABLE dirancang mengisi celah ini: platform navigasi yang datanya divalidasi kondisi lapangan nyata lewat pelaporan komunitas, dilengkapi sistem keselamatan berlapis (SOS, deteksi area berbahaya, pengawasan caregiver), dan jaringan bantuan relawan yang terverifikasi.

### 1.2 Tujuan Produk

1. Memberi penyandang tunanetra rute berjalan kaki yang benar-benar aman digunakan, bukan cuma "secara teori" ramah disabilitas menurut data peta standar.
2. Membangun basis data kondisi jalur pejalan kaki Indonesia yang tervalidasi komunitas, yang lebih akurat untuk konteks lokal dibanding data peta global manapun.
3. Menyediakan lapisan keselamatan aktif (SOS, deteksi area berbahaya, monitoring caregiver) yang bekerja dalam batasan teknis web app di HP.
4. Menghubungkan penyandang tunanetra dengan jaringan relawan terverifikasi dan caregiver dalam satu ekosistem yang salingnya terintegrasi.

### 1.3 Target Pengguna

| Peran                  | Deskripsi                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Pengguna Tunanetra** | Pengguna utama, memakai fitur navigasi, TTS, SOS, dan berbagi lokasi                                              |
| **Caregiver**          | Keluarga/wali yang memantau lokasi dan kondisi keamanan pengguna tunanetra yang mereka rawat                      |
| **Relawan Komunitas**  | Masyarakat umum terverifikasi yang bersedia membantu pengguna tunanetra secara langsung di lokasi saat dibutuhkan |
| **Pelapor Komunitas**  | Siapa saja (termasuk relawan dan masyarakat umum) yang melaporkan kondisi jalur pejalan kaki                      |

### 1.4 Batasan Teknis Penting (mempengaruhi seluruh desain produk)

Karena ini web app diakses lewat browser HP (bukan aplikasi native), ada batasan platform yang membentuk banyak keputusan desain di dokumen ini:

- **Tidak ada background geolocation.** Tracking lokasi hanya berfungsi selama aplikasi terbuka di layar depan (foreground). Begitu layar mati atau user berpindah aplikasi, tracking berhenti.
- **Screen Wake Lock API** bisa mencegah layar mati selama tab aktif, tapi tidak berlaku jika user pindah tab/aplikasi lain, dan boros baterai.
- **Push notification tidak sepenuhnya reliable di semua platform**, terutama iOS Safari punya banyak batasan dibanding Android Chrome.
- **Sensor gerak (accelerometer/gyroscope)** bisa diakses lewat `DeviceMotionEvent`, tapi di iOS 13+ butuh izin eksplisit lewat interaksi pengguna (tombol), dan akurasinya untuk deteksi jatuh terbukti di berbagai studi punya trade-off signifikan antara false positive dan false negative, terutama saat device tidak berada di posisi tetap (misalnya dipegang tangan, bukan di kantong).

Implikasi: seluruh fitur real-time safety pada dokumen ini dirancang dengan asumsi eksplisit **"aplikasi harus tetap terbuka di layar depan selama sesi perjalanan aktif"**, dan sistem fall detection diposisikan sebagai sinyal pendukung dalam skema eskalasi berlapis, bukan sebagai penentu tunggal yang diklaim akurat penuh.

### 1.5 Dua Profil Pengguna: Tunanetra dan Disabilitas Mobilitas

Produk ini melayani **dua profil kebutuhan aksesibilitas** di atas satu basis data dan satu mesin routing yang sama.

**Alasan keduanya disatukan (bukan digabung paksa):**

Kedua kelompok mengajukan pertanyaan yang identik — _"bagaimana saya sampai dari titik A ke titik B dengan aman?"_ — dan keduanya bergantung pada **objek fisik yang sama** (pintu, koridor, trotoar, tangga, ramp, lift, guiding block, penyeberangan). Yang berbeda hanya **bobot penilaian** atas objek tersebut.

| Aspek                      | Profil Tunanetra / Low Vision                                                     | Profil Disabilitas Mobilitas                                                   |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Hambatan utama             | Guiding block rusak/terputus/salah arah, rintangan tak terduga, disorientasi arah | Tangga, ketiadaan ramp, ramp terlalu curam, pintu sempit, lift rusak/tidak ada |
| Tangga pada rute           | Dapat dilalui, tapi butuh peringatan dini                                         | **Jalan buntu mutlak** (bobot tak terhingga)                                   |
| Segmen tanpa guiding block | Penalti tinggi                                                                    | Netral (tidak relevan)                                                         |
| Ramp curam >8%             | Netral                                                                            | Penalti tinggi                                                                 |
| Kanal informasi utama      | Audio (TTS)                                                                       | Visual (peta + label)                                                          |
| Bentuk instruksi           | Naratif berurutan, hands-free                                                     | Ringkasan visual + detail hambatan                                             |

**Implikasi teknis:** satu graf jalur, banyak fungsi bobot. Titik asal dan tujuan yang sama akan menghasilkan **rute berbeda** tergantung profil pengguna. Ini menjadi bukti utama bahwa sistem memiliki logika nyata, bukan sekadar menggambar garis di peta (lihat Bagian 14 — Strategi Demo).

**Batasan cakupan yang disengaja:** profil disabilitas lain (tuli, disabilitas kognitif) **tidak** dimasukkan pada versi ini. Alasannya, kebutuhan mereka menuntut atribut data yang sama sekali berbeda (ketersediaan juru bahasa isyarat, kejelasan papan petunjuk, penyederhanaan bahasa) yang tidak bisa berbagi struktur data dengan dua profil di atas.

**Pengguna sekunder yang diuntungkan tanpa perubahan desain apa pun:** mahasiswa dengan cedera sementara (patah kaki, pasca-operasi), pengguna kruk sementara, dan pengantar barang beroda. Kelompok ini memperkuat argumen dampak tanpa menambah kompleksitas produk.

### 1.6 Area Pilot & Strategi Data Awal

**Masalah yang harus diakui sejak awal:** OpenStreetMap **tidak menyimpan** data guiding block, kondisi ramp, kelandaian trotoar, maupun keberadaan lift di Indonesia secara memadai. Artinya fitur F2 (routing yang memprioritaskan jalur ramah disabilitas) **tidak akan berfungsi** hanya dengan menarik data OSM. Basis datanya harus dibangun sendiri.

**Area pilot yang disepakati:**

| Prioritas                    | Area                                             | Status                                 |
| ---------------------------- | ------------------------------------------------ | -------------------------------------- |
| P0 (wajib)                   | **Fakultas Teknik UGM**                          | Wajib selesai disurvei & terdigitalkan |
| P0 (wajib)                   | **FMIPA UGM**                                    | Wajib selesai disurvei & terdigitalkan |
| P1 (jika waktu memungkinkan) | **GIK (Gelanggang Inovasi dan Kreativitas) UGM** | Tambahan, bukan blocker                |

**Alasan pemilihan area:**

- Bisa disurvei tuntas oleh 4 orang dalam 1–2 akhir pekan
- Tim sudah menguasai medannya, mengurangi risiko kesalahan data
- Juri berasal dari lingkungan UGM sehingga **dapat memverifikasi sendiri** kebenaran data yang ditampilkan — ini keunggulan kredibilitas yang tidak dimiliki tim yang memakai area acak
- Kasus disabilitas mobilitas sangat nyata di gedung-gedung lama kampus (gedung bertingkat tanpa lift, pintu masuk tanpa ramp)

**Metode pengumpulan data:**

1. Survei lapangan langsung: foto + koordinat GPS + pencatatan atribut per segmen
2. Digitalisasi ke format GeoJSON, dimuat ke PostGIS sebagai graf jalur
3. Verifikasi silang oleh minimal 2 anggota tim per segmen
4. Untuk jalur dalam gedung: digambar manual per lantai sebagai graf berlapis (lihat Bagian 9.4)

**Cara membingkai keterbatasan ini saat pitching:** posisikan sebagai **pilot terverifikasi**, bukan kekurangan. Kalimat yang disarankan: _"kami memilih memvalidasi 2 fakultas secara menyeluruh daripada mengklaim cakupan nasional dengan data yang tidak pernah kami cek sendiri."_ Ini justru memperkuat poin Dampak & Kelayakan.

### 1.6.1 Dua Sumber Data yang Berbeda Perannya — Jangan Dicampur Saat Demo

Produk ini punya **dua mekanisme pengisian data dengan tujuan yang berbeda**, dan keduanya harus dijelaskan terpisah agar tidak menimbulkan ekspektasi keliru di depan juri:

|                                 | Survei Tim (Bagian 1.6)                                 | Kontribusi Komunitas (F13, prinsip "Dari Komunitas Untuk Komunitas")                                 |
| ------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Kapan dikerjakan                | Sebelum lomba, minggu 1–2                               | Berkelanjutan, **setelah** aplikasi diluncurkan                                                      |
| Siapa                           | Tim sendiri (4 orang)                                   | Relawan komunitas disabilitas UGM secara umum (role `volunteer`, flag `can_map_data`)                |
| Tujuan                          | Menjamin **data untuk demo benar-benar ada dan akurat** | Menjamin **data tetap hidup dan terbarui** jangka panjang                                            |
| Status saat Grand Final (1 Nov) | Sudah lengkap & terverifikasi untuk FT+FMIPA            | Baru berupa **mekanisme/alur**, belum tentu berisi kontribusi nyata — aplikasi baru saja diluncurkan |

**Kenapa pemisahan ini penting untuk dinyatakan eksplisit ke seluruh tim:** kontribusi komunitas adalah fitur _pasca-peluncuran_ yang menjawab pertanyaan keberlanjutan ("siapa yang menjaga data ini ke depan?" — lihat catatan O5 di Bagian 15.3), **bukan** sumber data yang bisa diandalkan untuk demo 1 November. Rute yang dinavigasikan saat demo tetap wajib berasal dari survei tim (poin di atas), tanpa terkecuali.

**Cara mendemokan bagian komunitas dengan jujur:** tunjukkan **alurnya** — form kontribusi, antrean verifikasi (Flow 3.8) — sambil menjelaskan lisan bahwa ini dirancang untuk keberlanjutan pasca-lomba. Jangan berusaha menampilkan data kontribusi komunitas seolah sudah banyak terisi; juri berpengalaman akan menyadari kalau itu dibuat-buat, dan itu jauh lebih merugikan daripada mengakui produknya baru diluncurkan.

### 1.7 Penyelarasan dengan Kriteria Penilaian Lomba

Bobot penilaian resmi Hackathon JOINTS UGM 2026 dan bagian PRD yang menjawabnya:

| Aspek Penilaian                 | Bobot   | Ditopang oleh bagian                                                                                                  |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Implementasi Teknis             | **30%** | Routing multi-profil berbasis graf berbobot (1.5, 9.4), PostGIS geospasial (7), arsitektur realtime (6, 9)            |
| Inovasi Solusi                  | **25%** | Basis data aksesibilitas tervalidasi lapangan (1.6), satu graf dua profil (1.5), booking pendampingan terjadwal (3.7) |
| Fungsionalitas & Desain         | **20%** | Strategi antarmuka dua sisi (10.5), standar desain Sisi B (10.6)                                                      |
| Dampak & Kelayakan Implementasi | **15%** | Validasi pengguna nyata (11), area pilot terverifikasi (1.6), skor aksesibilitas gedung (F14)                         |
| Presentasi & Demonstrasi        | **10%** | Strategi demo (14)                                                                                                    |

**Catatan penting:** bobot terbesar ada di Implementasi Teknis. Oleh karena itu prioritas pengerjaan (Bagian 4.5) mendahulukan **mesin routing multi-profil yang benar-benar berjalan** di atas fitur pendukung apa pun.

---

## 2. User Story

### 2.1 Sebagai Pengguna Tunanetra

- Sebagai pengguna tunanetra, saya ingin mencari rute dari lokasi saya ke tujuan yang mempertimbangkan kondisi jalur yang aman, supaya saya tidak terjebak di jalur yang rusak atau berbahaya.
- Sebagai pengguna tunanetra, saya ingin mendengar deskripsi audio tentang kondisi sekitar saya secara real-time saat berjalan, supaya saya bisa waspada terhadap kontur, rintangan, atau bahaya yang akan saya temui.
- Sebagai pengguna tunanetra, saya ingin bisa menekan tombol SOS dengan mudah (termasuk tanpa presisi visual) saat saya merasa dalam bahaya, supaya bantuan bisa datang secepat mungkin.
- Sebagai pengguna tunanetra, saya ingin mendapat peringatan sebelum memasuki area yang dilaporkan bermasalah, supaya saya bisa memilih jalur alternatif atau lebih berhati-hati.
- Sebagai pengguna tunanetra, saya ingin bisa melaporkan kondisi jalur yang saya alami (dibantu relawan/orang sekitar untuk verifikasi visual), supaya pengguna lain mendapat manfaat dari pengalaman saya.
- Sebagai pengguna tunanetra, saya ingin mengontrol kapan lokasi saya dibagikan ke caregiver, supaya privasi dan otonomi saya tetap terjaga di luar situasi darurat.
- Sebagai pengguna tunanetra, saya ingin bisa mengoperasikan aplikasi sepenuhnya lewat suara, supaya saya tidak harus mengandalkan ketepatan sentuhan di layar sambil memegang tongkat.
- Sebagai pengguna tunanetra, saya ingin bisa menceritakan rencana perjalanan saya secara natural (bukan sekadar isi kolom tujuan), supaya AI bisa membantu menyusun rencana yang sesuai konteks saya (misal waktu, keperluan) tanpa saya harus tahu istilah teknis atau nama pasti tempatnya.
- Sebagai pengguna tunanetra, saya ingin AI Planner mengingat kebiasaan/tempat yang sering saya kunjungi, supaya rencana perjalanan berikutnya bisa lebih relevan dan cepat disusun.

### 2.2 Sebagai Caregiver

- Sebagai caregiver, saya ingin mengetahui lokasi orang yang saya rawat secara real-time saat mereka sedang bepergian, supaya saya tenang dan bisa membantu jika terjadi sesuatu.
- Sebagai caregiver, saya ingin menerima alert segera jika terjadi situasi darurat (SOS, potensi jatuh, area sangat berbahaya), supaya saya bisa segera merespons.
- Sebagai caregiver, saya tidak ingin dibanjiri notifikasi untuk hal-hal kecil yang tidak darurat, supaya saya tidak mengalami kelelahan alert dan tetap responsif saat benar-benar dibutuhkan.
- Sebagai caregiver, saya ingin melihat ringkasan aktivitas perjalanan (rute yang dilalui, area bermasalah yang dilewati) dalam bentuk dashboard, bukan notifikasi satu-satu.

### 2.3 Sebagai Relawan Komunitas

- Sebagai relawan, saya ingin mendaftar dan diverifikasi identitasnya, supaya pengguna tunanetra bisa mempercayai saya sebagai bagian dari jaringan bantuan yang sah.
- Sebagai relawan, saya ingin menerima notifikasi ketika ada pengguna tunanetra di sekitar saya yang membutuhkan bantuan (SOS atau berbagi lokasi), supaya saya bisa segera merespons.
- Sebagai relawan, saya ingin mudah melaporkan kondisi jalur yang saya temui atau yang dilaporkan pengguna tunanetra kepada saya, supaya data komunitas semakin lengkap.

### 2.4 Sebagai Pelapor Komunitas (umum)

- Sebagai warga umum, saya ingin melaporkan kondisi guiding block atau trotoar yang rusak/berbahaya dengan mudah (foto + lokasi), supaya penyandang tunanetra lain terhindar dari bahaya yang sama.

### 2.5 Sebagai Pengguna Disabilitas Mobilitas (kursi roda/kruk)

- Sebagai pengguna kursi roda, saya ingin rute yang **tidak pernah** melewati tangga, supaya saya tidak terjebak di tengah jalan dan harus berputar balik jauh.
- Sebagai pengguna kursi roda, saya ingin tahu pintu masuk gedung mana yang punya ramp, supaya saya tidak mendatangi pintu yang ternyata hanya berupa anak tangga.
- Sebagai pengguna kursi roda, saya ingin tahu status lift suatu gedung sebelum berangkat, supaya saya tidak sampai di lokasi lalu menemukan lift sedang rusak.
- Sebagai pengguna kursi roda, saya ingin melihat rute pada peta secara visual dengan penanda hambatan yang jelas, supaya saya bisa menilai sendiri kelayakannya sebelum berangkat.
- Sebagai pengguna kruk, saya ingin bisa memilih toleransi hambatan saya sendiri (misal masih sanggup 3–4 anak tangga), supaya rute tidak terlalu memutar tanpa perlu.
- Sebagai pengguna disabilitas mobilitas, saya ingin memesan pendampingan relawan untuk lokasi atau acara yang saya tahu belum ramah akses, supaya saya tetap bisa hadir.

### 2.6 Sebagai Pemeta (Surveyor Data Aksesibilitas)

- Sebagai pemeta, saya ingin menandai fasilitas aksesibilitas (ramp, lift, guiding block, toilet difabel) langsung di atas peta dengan atribut terstruktur, supaya data yang saya kumpulkan langsung bisa dipakai mesin routing.
- Sebagai pemeta, saya ingin memetakan jalur di dalam gedung per lantai, supaya rute tidak berhenti di pintu masuk saja.
- Sebagai pemeta, saya ingin melihat area mana yang belum terpetakan, supaya usaha survei tim tidak tumpang tindih.
- Sebagai verifikator (unit layanan disabilitas/pemeta senior), saya ingin meninjau antrean laporan komunitas sebelum masuk ke data resmi, supaya kualitas data tetap terjaga.

### 2.7 Sebagai Pengguna yang Membutuhkan Pendampingan Terjadwal

- Sebagai penyandang disabilitas, saya ingin mengajukan permintaan pendampingan **beberapa hari sebelumnya** untuk acara tertentu, supaya saya punya kepastian dan tidak bergantung pada ketersediaan relawan dadakan.
- Sebagai relawan, saya ingin melihat daftar permintaan pendampingan terjadwal beserta lokasi dan durasinya, supaya saya bisa memilih yang sesuai jadwal saya.
- Sebagai penyandang disabilitas, saya ingin tahu identitas relawan yang akan mendampingi saya sebelum hari-H, supaya saya merasa aman.

---

## 3. User Flow

### 3.1 Flow Utama: Perjalanan dengan Navigasi Aktif

```
1. User membuka UNSTOPABLE (PWA sudah ter-install di home screen)
2. Login (voice-guided, bisa pakai voice command atau screen reader)
3. User mengucapkan/mengetik tujuan ("Saya mau ke Perpustakaan UGM")
4. Sistem menghitung rute dengan mempertimbangkan:
   - Jalur dengan guiding block terverifikasi baik
   - Menghindari titik yang dilaporkan bermasalah/berbahaya
   - Mempertimbangkan penyeberangan yang aman
5. Sistem membacakan ringkasan rute + tingkat risiko sebelum berangkat
   ("Rute ini melewati 1 titik yang dilaporkan bermasalah,
   disarankan rute alternatif 5 menit lebih lama tapi lebih aman")
6. User memilih untuk lanjut atau pilih rute alternatif
7. Mode "Perjalanan Aktif" dimulai:
   - Wake Lock diaktifkan
   - Geolocation tracking dimulai (foreground)
   - Fall detection monitoring dimulai (accelerometer)
   - Lokasi mulai dibagikan ke caregiver (sesuai preferensi privasi user)
8. Selama perjalanan:
   - TTS membacakan instruksi arah + kondisi sekitar secara berkala
   - Sistem memberi peringatan dini saat mendekati titik bermasalah
   - Dead man's switch: sistem minta konfirmasi berkala ("ketuk layar"
     atau ucapkan "aman")
9. [Skenario normal] User sampai tujuan → sesi ditutup, ringkasan
   perjalanan tersimpan
10. [Skenario darurat] Lihat Flow SOS di bawah
```

### 3.2 Flow SOS (Darurat)

```
1. User memicu SOS (tap tombol besar, kombinasi tombol fisik,
   atau voice command darurat)
2. Sistem merekam audio ambient singkat (10-15 detik) sebagai konteks
3. Sistem mengambil lokasi terakhir yang valid (real-time atau ter-cache)
4. Alert terkirim secara paralel ke:
   a. Caregiver terdaftar (via WebSocket + fallback SMS)
   b. Relawan terverifikasi dalam radius tertentu (via WebSocket)
5. Relawan yang merespons akan terlihat statusnya ke user
   ("Relawan [nama] sedang menuju lokasi Anda")
6. Caregiver mendapat notifikasi setiap relawan merespons/tiba
7. User bisa membatalkan SOS jika ternyata aman
   (dengan konfirmasi untuk mencegah pembatalan tidak sengaja)
```

### 3.3 Flow Deteksi Jatuh (Fall Detection)

```
1. Selama mode Perjalanan Aktif, sistem memonitor data accelerometer
2. Pola mencurigakan terdeteksi (lonjakan akselerasi + diam signifikan)
3. Sistem memberi jeda konfirmasi 10-15 detik:
   audio "Terdeteksi kemungkinan jatuh. Ketuk layar atau ucapkan
   'aman' jika baik-baik saja"
4a. [User merespons "aman"] → Insiden dicatat sebagai false positive,
    tidak ada eskalasi, data tetap disimpan untuk analisis pola
4b. [User tidak merespons dalam waktu tertentu] → Eskalasi otomatis
    ke Flow SOS (poin 3.2, mulai dari langkah 3)
```

### 3.4 Flow Peringatan Area Tidak Ramah

```
1. Selama mode Perjalanan Aktif, sistem terus mencocokkan posisi user
   dengan database titik bermasalah (PostGIS geofencing)
2. User mendekati titik bermasalah dalam radius tertentu (misal 20-30m)
3. Sistem memberi peringatan audio sebelum sampai di titik tersebut,
   dengan detail kategori masalah
   ("20 meter lagi, guiding block terputus, disarankan pindah ke
   sisi kanan trotoar")
4. [Jika level bahaya tinggi] Alert tambahan terkirim ke:
   - Relawan terdekat (standby, bukan otomatis datang)
   - Caregiver (masuk ringkasan aktivitas, notifikasi real-time
     hanya untuk level bahaya tinggi)
5. Sistem mencatat lintasan user melalui titik tersebut sebagai data
   tambahan (memperkaya validasi laporan komunitas)
```

### 3.5 Flow AI Planner (Perencanaan Rute via Percakapan)

```
1. User memilih jalur "AI Planner" dari halaman utama (setara dengan
   jalur input tujuan langsung, bukan menggantikannya)
2. User bercerita bebas tentang rencana perjalanan, lewat teks atau suara
   Contoh: "Saya mau ke Perpustakaan UGM buat pinjam buku, kira-kira
   jam 2 siang"
3. Sistem (LLM) mengekstrak informasi terstruktur dari cerita user:
   - Intent/tujuan (nama tempat atau jenis tempat)
   - Waktu rencana keberangkatan (jika disebutkan)
   - Konteks tambahan (jika disebutkan, misal keperluan)
4. [Jika informasi kunci hilang/ambigu, misal nama tempat tidak jelas
   atau ada banyak kemungkinan match]
   → Sistem membuat SATU pertanyaan klarifikasi maksimal
   ("Yang dimaksud Perpustakaan UGM Pusat atau Perpustakaan Fakultas?")
   → Bukan multi-turn bebas tanpa batas, dibatasi maksimal 1-2 kali
   klarifikasi supaya tidak jadi obrolan panjang yang melelahkan
   lewat suara
5. [Jika informasi cukup jelas] → Sistem langsung lanjut ke langkah 6
6. Sistem memanggil Route & Map Service (F2) menggunakan destinasi
   yang sudah diekstrak, menghasilkan rute yang sama seperti jalur
   input langsung
7. Sistem membacakan konfirmasi rencana yang tersusun sebelum lanjut
   ke ringkasan risiko rute (menyambung ke Flow 3.1 langkah 5)
   ("Baik, rute ke Perpustakaan UGM Pusat sudah disiapkan,
   diperkirakan berangkat jam 2 siang")
8. Riwayat percakapan & hasil ekstraksi disimpan ke database,
   dipakai sebagai konteks personalisasi untuk sesi berikutnya
   (misal AI belajar tempat yang sering dikunjungi user)
9. Lanjut ke Flow 3.1 (Perjalanan dengan Navigasi Aktif) dari
   langkah 6
```

**Catatan desain penting:**

- Untuk versi awal (MVP), AI Planner **fokus ke rute jalan kaki** saja, karena data transportasi publik/jadwal moda transportasi belum tersedia. AI tetap bisa menangkap konteks waktu dari cerita user (untuk fitur estimasi & pengingat), tapi tidak menyarankan moda transportasi lain.
- Klarifikasi dibatasi (bukan percakapan bebas tanpa akhir) karena ini interaksi suara — percakapan panjang bolak-balik lewat TTS/voice command lebih melelahkan dan lambat dibanding lewat teks, jadi sistem didesain untuk menebak dengan asumsi masuk akal dulu (destinasi paling umum/terdekat) sebelum bertanya balik, dan hanya bertanya kalau benar-benar ambigu.

---

### 3.6 Flow Pelaporan Komunitas

```
1. User (relawan/masyarakat umum/pengguna tunanetra dibantu relawan)
   membuka fitur "Lapor Kondisi Jalan"
2. Pilih lokasi (otomatis dari GPS atau pin manual di peta)
3. Pilih kategori masalah (guiding block rusak/terputus/salah arah,
   terhalang objek, tidak ada penyeberangan aman, area konstruksi, dll)
4. Unggah foto (opsional tapi direkomendasikan untuk verifikasi)
5. Submit laporan → status awal "belum diverifikasi"
6. Laporan senada dari user berbeda di lokasi sama akan menaikkan
   status jadi "terverifikasi" setelah mencapai ambang tertentu
7. Data yang terverifikasi masuk ke sistem peringatan (flow 3.4)
   dan mempengaruhi kalkulasi rute (flow 3.1)
```

### 3.7 Flow Booking Pendampingan Relawan Terjadwal

Berbeda dari Flow SOS (3.2) yang bersifat **reaktif dan darurat**, flow ini bersifat **proaktif dan terencana** — untuk situasi di mana pengguna sudah tahu sejak awal bahwa lokasi tujuan belum ramah akses.

```
1. User membuka fitur "Ajukan Pendampingan"
2. User mengisi/mengucapkan detail permintaan:
   - Lokasi/acara tujuan (bisa dari pencarian tempat atau input bebas)
   - Tanggal & jam mulai, perkiraan durasi
   - Jenis bantuan yang dibutuhkan (memandu jalan, membantu kursi roda
     melewati tangga, membacakan informasi, mendampingi selama acara)
   - Titik temu yang disepakati
3. Sistem menyimpan permintaan dengan status "menunggu relawan"
4. Sistem menampilkan permintaan ke relawan terverifikasi yang:
   - Berada dalam radius wilayah layanan yang mereka pilih
   - Tidak punya jadwal pendampingan bentrok di waktu tersebut
5. Relawan mengajukan diri (bukan otomatis ditugaskan)
6. User menerima daftar relawan yang bersedia, lengkap dengan:
   nama, rating, jumlah pendampingan sebelumnya, status verifikasi
7. User memilih satu relawan → status berubah "terkonfirmasi"
   → kedua pihak menerima detail titik temu & kontak terbatas
   → caregiver (jika ada) diberi tahu sebagai lapisan keamanan
8. H-1: sistem mengirim pengingat ke kedua pihak
9. Hari-H: kedua pihak melakukan check-in di titik temu
   (konfirmasi dua arah, mencegah klaim sepihak)
10. Setelah selesai: kedua pihak saling memberi rating
    → rating relawan masuk ke volunteer_profiles (F9)
11. [Skenario batal] Pembatalan oleh salah satu pihak memicu
    notifikasi ke pihak lain + pencatatan pada riwayat keandalan
```

**Catatan desain penting:**

- **Relawan mengajukan diri, bukan ditugaskan otomatis.** Pendampingan fisik melibatkan kontak langsung dengan orang asing, sehingga pengguna harus memegang keputusan akhir memilih siapa yang mendampingi.
- **Caregiver otomatis diberi tahu** setiap ada pendampingan terkonfirmasi, sebagai lapisan keamanan tanpa perlu persetujuan caregiver (menjaga otonomi pengguna dewasa).
- Fitur ini **menutup celah** yang tidak bisa dijawab oleh routing: ada lokasi yang memang secara fisik tidak mungkin diakses mandiri, dan solusinya bukan teknologi melainkan manusia.

### 3.8 Flow Pemetaan & Verifikasi Data Aksesibilitas

```
1. Pemeta membuka Peta Editor (antarmuka desktop-first, berbasis visual)
2. Sistem menampilkan area pilot dengan penanda cakupan:
   hijau = sudah terpetakan, abu-abu = belum
3. Pemeta memilih mode penandaan:
   a. Titik (node)    → pintu, lift, ramp, toilet difabel, tangga
   b. Segmen (edge)   → jalur/koridor/trotoar antar dua titik
4. Untuk setiap objek, pemeta mengisi atribut terstruktur:
   - Segmen: jenis permukaan, lebar, ada tangga (ya/jumlah anak tangga),
     kelandaian, ada guiding block (ya/tidak/rusak), lantai
   - Titik: jenis, status operasional, jam operasional (untuk lift)
5. Untuk gedung bertingkat: pemeta menandai lantai (level) tiap objek,
   dan menghubungkan antar lantai lewat node penghubung (lift/tangga/ramp)
6. Pemeta menyimpan → data masuk sebagai status "draft"
7. Verifikator meninjau antrean draft:
   → menyetujui, meminta revisi, atau menolak
8. Data yang disetujui masuk ke graf routing produksi (F2)
9. Laporan komunitas dari flow 3.6 masuk ke antrean yang sama,
   sebagai usulan perubahan atribut pada objek yang sudah ada
   (mis. "lift di gedung X sedang rusak" → mengubah status operasional
   sementara tanpa menghapus objeknya)
```

**Catatan desain penting:**

- Flow ini adalah **prasyarat** agar F2 berfungsi. Tanpa data hasil pemetaan, mesin routing tidak punya apa pun untuk dihitung.
- Peta Editor sengaja **desktop-first** — ini satu-satunya bagian produk yang tidak dioptimalkan untuk HP, karena pekerjaan menggambar graf menuntut layar lebar dan presisi kursor.
- Perubahan status sementara (lift rusak) **tidak menghapus objek**, hanya mengubah atribut operasionalnya, sehingga riwayat tetap utuh dan data bisa dipulihkan saat perbaikan selesai.

---

## 4. Daftar Fitur

### 4.1 Fitur Fungsional / Utama

| #   | Fitur                                                 | Deskripsi Singkat                                                                                                                                                                                                 |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Peta detail dengan kontur & rute ramah disabilitas    | Peta berbasis OpenStreetMap yang menampilkan data tambahan: kondisi guiding block, kontur jalan, bangunan, dan jalur yang sudah divalidasi ramah disabilitas                                                      |
| F2  | Perencanaan rute A ke B ramah disabilitas             | Kalkulasi rute dengan bobot khusus: prioritaskan jalur dengan guiding block valid, hindari titik bermasalah, pertimbangkan penyeberangan aman                                                                     |
| F3  | Maps-to-speech (TTS kontekstual)                      | Membacakan posisi, arah, dan kondisi sekitar secara real-time, termasuk peringatan kontur/rintangan berbasis data komunitas                                                                                       |
| F4  | Komunitas relawan — berbagi lokasi saat butuh bantuan | User tunanetra bisa membagikan lokasi ke jaringan relawan terverifikasi saat membutuhkan bantuan langsung di lokasi                                                                                               |
| F5  | Caregiver — pemantauan lokasi                         | Caregiver terdaftar bisa melihat lokasi real-time orang yang dirawat selama mode Perjalanan Aktif                                                                                                                 |
| F6  | Pelaporan kondisi jalan/rute oleh komunitas           | Siapa saja bisa melaporkan kondisi jalur (rusak, berbahaya, dll) lengkap dengan lokasi dan foto, dengan sistem verifikasi bertingkat                                                                              |
| F7  | Tombol/shortcut SOS                                   | Trigger darurat multi-modal (tap besar, kombinasi tombol fisik, voice command) yang mengirim alert ke komunitas relawan sekitar dan caregiver sekaligus                                                           |
| F8  | Alert otomatis area tidak ramah                       | Peringatan proaktif ke user saat mendekati titik bermasalah, dengan eskalasi alert ke komunitas/caregiver untuk area berisiko tinggi                                                                              |
| F9  | Verifikasi & reputasi relawan                         | Sistem verifikasi identitas dasar dan rating relawan untuk menjaga keamanan jaringan bantuan                                                                                                                      |
| F10 | AI Planner — perencanaan rute via percakapan          | User menceritakan rencana perjalanan secara bebas (teks/suara), AI mengekstrak tujuan & konteks lalu menyusun rencana rute, dengan klarifikasi terbatas jika informasi ambigu, dan personalisasi berbasis riwayat |

### 4.2 Fitur Pendukung

| #   | Fitur                                                    | Deskripsi Singkat                                                                                                     |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P1  | Mode "Perjalanan Aktif" dengan Wake Lock otomatis        | Mengaktifkan Wake Lock API otomatis saat sesi navigasi dimulai, dengan peringatan audio jika gagal aktif              |
| P2  | Dead man's switch (check-in berkala)                     | Konfirmasi berkala selama perjalanan untuk mendeteksi user tidak merespons (indikasi masalah)                         |
| P3  | Fall detection (accelerometer, sinyal pendukung)         | Deteksi pola jatuh berbasis data gerak, dengan jeda konfirmasi sebelum eskalasi ke SOS                                |
| P4  | Rekaman audio darurat singkat saat SOS                   | Rekaman ambient 10-15 detik otomatis dilampirkan saat SOS terpicu, sebagai konteks tambahan bagi penerima bantuan     |
| P5  | Fallback SOS via SMS                                     | Jalur cadangan pengiriman alert darurat ke caregiver lewat SMS gateway, independen dari push notification             |
| P6  | Estimasi waktu tiba ke caregiver                         | Notifikasi otomatis estimasi waktu tiba saat rute dimulai, dengan alert follow-up jika melebihi estimasi tanpa update |
| P7  | Ringkasan risiko rute sebelum berangkat                  | Menampilkan/membacakan jumlah titik bermasalah pada rute sebelum user memilih untuk berangkat                         |
| P8  | Voice command penuh (hands-free)                         | Operasional aplikasi sepenuhnya lewat suara untuk pencarian rute, kontrol sesi, dan trigger SOS                       |
| P9  | Mode "area asing" — kewaspadaan otomatis                 | Menaikkan frekuensi check-in dan detail instruksi saat user berada di area tanpa data komunitas sama sekali           |
| P10 | Dashboard caregiver (ringkasan, bukan notifikasi satuan) | Tampilan agregat aktivitas perjalanan untuk mencegah alert fatigue pada caregiver                                     |
| P11 | Trusted circle bertingkat                                | Dukungan lebih dari satu caregiver per user dengan kontrol privasi granular                                           |

### 4.3 Fitur Non-Fungsional (Keamanan & Kenyamanan)

| #   | Fitur/Requirement                              | Deskripsi Singkat                                                                                                          |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| N1  | Enkripsi data lokasi & data sensitif           | Data lokasi real-time dan riwayat perjalanan dienkripsi saat disimpan (at-rest) dan saat transmisi (in-transit, HTTPS/WSS) |
| N2  | Kontrol privasi granular untuk berbagi lokasi  | User tunanetra menentukan kapan lokasi dibagikan terus-menerus vs hanya saat SOS                                           |
| N3  | Rate limiting endpoint pelaporan               | Mencegah spam/laporan palsu yang merusak kualitas data komunitas                                                           |
| N4  | Audit log aktivitas sensitif                   | Pencatatan siapa mengakses data lokasi siapa, kapan, untuk keperluan akuntabilitas                                         |
| N5  | Aksesibilitas penuh (WCAG 2.1 AA minimum)      | Seluruh antarmuka harus kompatibel screen reader, kontras warna cukup, navigasi keyboard penuh                             |
| N6  | Graceful degradation saat sensor/koneksi gagal | Peringatan eksplisit ke user saat GPS/koneksi/wake lock gagal, bukan diam-diam berhenti berfungsi                          |
| N7  | Performa rendering peta & TTS                  | Peta dan TTS harus responsif di device kelas menengah-bawah, mengingat target pengguna beragam kondisi ekonomi             |
| N8  | Retensi & penghapusan data                     | Kebijakan jelas berapa lama data lokasi/riwayat disimpan dan mekanisme user menghapus datanya                              |

### 4.4 Fitur Tambahan (Profil Ganda, Pemetaan & Pendampingan)

Fitur berikut melengkapi F1–F10 dan P1–P11 di atas, sebagai konsekuensi dari perluasan ke dua profil pengguna (1.5) dan kebutuhan data awal (1.6).

| #   | Fitur                                                 | Deskripsi Singkat                                                                                                                                                           |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F11 | Profil kebutuhan aksesibilitas & routing multi-profil | User memilih profil (tunanetra, low vision, kursi roda, kruk) beserta toleransi personal; profil ini menentukan fungsi bobot yang dipakai mesin routing atas graf yang sama |
| F12 | Booking pendampingan relawan terjadwal                | Permintaan pendampingan terencana untuk lokasi/acara yang belum ramah akses, dengan mekanisme relawan mengajukan diri dan user memilih (lihat Flow 3.7)                     |
| F13 | Peta Editor untuk pemeta                              | Antarmuka visual desktop-first untuk menandai node & segmen aksesibilitas beserta atributnya, termasuk jalur dalam gedung per lantai (lihat Flow 3.8)                       |
| F14 | Skor aksesibilitas gedung/area                        | Agregasi otomatis kondisi fasilitas per gedung menjadi skor terbuka, berfungsi sebagai alat advokasi ke pengelola gedung, bukan sekadar informasi pengguna                  |
| F15 | Antrean verifikasi data                               | Dashboard verifikator untuk meninjau draft pemetaan dan usulan perubahan dari laporan komunitas sebelum masuk ke graf produksi                                              |

| #   | Fitur Pendukung              | Deskripsi Singkat                                                                                                                                                         |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P12 | Pembanding rute antar profil | Menampilkan hasil rute untuk dua profil berbeda pada pasangan asal–tujuan yang sama secara berdampingan; berfungsi sebagai alat demonstrasi sekaligus alat edukasi publik |
| P13 | Mode peta pilot offline      | Cache tile & graf area pilot di sisi klien, agar demo tidak bergantung kualitas jaringan di lokasi Grand Final                                                            |
| P14 | Ekspor laporan aksesibilitas | Ekspor ringkasan hambatan per gedung (PDF/CSV) untuk diserahkan ke unit layanan disabilitas atau pengelola kampus                                                         |

### 4.5 Prioritisasi MVP — Apa yang Wajib Jadi dan Apa yang Boleh Gugur

**Peringatan realitas:** PRD ini memuat 15 fitur utama, 14 fitur pendukung, dan 26 requirement teknis. Dengan 4 orang dan waktu pengerjaan efektif ±6,5 minggu (lihat Bagian 12), **tidak semuanya bisa selesai dengan kualitas layak demo.** Risiko terbesar proyek ini bukan kekurangan ide, melainkan seluruh fitur selesai setengah jalan.

Prioritas berikut mengikat: fitur P1 tidak boleh dikerjakan sebelum seluruh P0 berfungsi end-to-end.

| Prioritas                                       | Fitur                              | Alasan                                                              |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| **P0 — Wajib jalan saat demo**                  | F13 Peta Editor + data area pilot  | Prasyarat mutlak; tanpa data, tidak ada yang bisa didemokan         |
|                                                 | F11 Profil & routing multi-profil  | Inti pembeda produk, penyumbang utama nilai Implementasi Teknis 30% |
|                                                 | F2 Perencanaan rute                | Fitur inti                                                          |
|                                                 | F1 Peta dengan data aksesibilitas  | Wajah produk                                                        |
|                                                 | F3 Maps-to-speech (TTS)            | Pembuktian sisi tunanetra benar-benar berfungsi                     |
|                                                 | P12 Pembanding rute antar profil   | Alat demonstrasi paling menentukan (lihat Bagian 14)                |
|                                                 | F6 Pelaporan komunitas             | Menunjukkan model data hidup, bukan statis                          |
| **P1 — Kuat kalau sempat**                      | F12 Booking pendampingan terjadwal | Pembeda inovasi; bisa didemokan meski jaringan relawan masih kecil  |
|                                                 | F7 SOS + F4 relawan reaktif        | Bernilai tinggi, tapi butuh banyak infrastruktur realtime           |
|                                                 | F5 Caregiver monitoring            | Bergantung pada infrastruktur realtime yang sama                    |
|                                                 | F15 Antrean verifikasi             | Bisa disederhanakan jadi verifikasi manual internal saat demo       |
|                                                 | F14 Skor aksesibilitas gedung      | Nilai advokasi tinggi, implementasi relatif ringan                  |
| **P2 — Gugurkan tanpa ragu jika waktu menipis** | P3 Fall detection                  | Akurasi rendah, risiko gagal saat demo tinggi, butuh kalibrasi lama |
|                                                 | P4 Rekaman audio SOS               | Nilai tambah kecil dibanding kompleksitas izin mikrofon             |
|                                                 | P5 Fallback SMS                    | Berbiaya (gateway berbayar) dan sulit didemokan meyakinkan          |
|                                                 | F10 AI Planner                     | Lihat catatan di bawah                                              |
|                                                 | P9 Mode area asing                 | Turunan dari fitur lain, bukan fitur mandiri                        |
|                                                 | P14 Ekspor laporan                 | Mudah dijelaskan lewat mockup tanpa perlu diimplementasi            |

**Catatan khusus soal F10 (AI Planner):**

Fitur ini diletakkan di P2 bukan karena tidak bernilai, melainkan karena **hampir setiap tim hackathon menampilkan chatbot LLM**, sehingga nilai pembedanya di mata juri rendah — sementara biaya implementasinya (penanganan ambiguitas, klarifikasi terbatas, personalisasi riwayat) tinggi.

**Rekomendasi:** jika F10 tetap dikerjakan, persempit perannya menjadi **satu tugas spesifik yang jelas alasannya**, yaitu mengubah keluaran graf rute menjadi kalimat panduan yang enak didengar (RT-03), bukan sebagai antarmuka percakapan umum. Dengan begitu penggunaan LLM terlihat sebagai keputusan desain yang disengaja, bukan tempelan mengikuti tren — dan justru ini yang dinilai tinggi pada aspek Inovasi.

**Prinsip pemotongan:** lebih baik 7 fitur berjalan mulus daripada 20 fitur yang setengahnya gagal di depan juri. Fitur P2 tetap ditulis di pitch deck sebagai _roadmap_, dengan penjelasan jujur bahwa itu belum diimplementasikan.

---

## 5. Daftar Requirement Teknis Lengkap

### 5.1 Requirement Fungsional Teknis

| ID    | Requirement                                                                                                                                                                        | Terkait Fitur  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| RT-01 | Sistem dapat menghitung rute berjalan kaki dengan bobot kustom (menghindari titik bermasalah, memprioritaskan guiding block valid)                                                 | F2             |
| RT-02 | Sistem dapat melakukan reverse-geocoding dan forward-geocoding untuk pencarian lokasi/tujuan                                                                                       | F1, F2         |
| RT-03 | Sistem dapat men-generate deskripsi natural language dari data rute + laporan komunitas untuk dibacakan TTS                                                                        | F3             |
| RT-04 | Sistem dapat melakukan query geospasial (radius search) untuk mencari relawan terdekat dari titik SOS                                                                              | F4, F7         |
| RT-05 | Sistem dapat menyimpan dan memperbarui lokasi real-time user selama sesi aktif, dan meneruskannya ke caregiver terkait                                                             | F5             |
| RT-06 | Sistem dapat menerima, menyimpan, dan memverifikasi laporan kondisi jalan secara bertingkat (belum diverifikasi → terverifikasi) berdasarkan jumlah laporan senada                 | F6             |
| RT-07 | Sistem dapat mendeteksi saat posisi user mendekati titik bermasalah dalam radius tertentu (geofencing) dan memicu peringatan                                                       | F8             |
| RT-08 | Sistem dapat mengeskalasi alert secara otomatis dan bertingkat (user → caregiver + relawan) berdasarkan aturan waktu/kondisi tertentu                                              | F7, F8, P2, P3 |
| RT-09 | Sistem dapat memverifikasi identitas dasar relawan (OTP nomor HP minimum) dan menyimpan riwayat rating                                                                             | F9             |
| RT-10 | Sistem dapat mengaktifkan Wake Lock otomatis saat sesi navigasi dimulai dan mendeteksi kegagalannya                                                                                | P1             |
| RT-11 | Sistem dapat memproses data accelerometer client-side untuk mendeteksi pola gerak mencurigakan (threshold-based)                                                                   | P3             |
| RT-12 | Sistem dapat merekam audio singkat dan melampirkannya pada payload SOS                                                                                                             | P4             |
| RT-13 | Sistem dapat mengirim SMS melalui gateway pihak ketiga sebagai fallback saat kondisi tertentu terpenuhi                                                                            | P5             |
| RT-14 | Sistem mendukung voice input (speech-to-text) untuk kontrol aplikasi dan voice output (text-to-speech) untuk seluruh konten informasional                                          | F3, P8         |
| RT-15 | Sistem dapat mengekstrak entitas terstruktur (tujuan, waktu, konteks) dari input percakapan bebas (teks/suara) menggunakan LLM                                                     | F10            |
| RT-16 | Sistem dapat mendeteksi ambiguitas hasil ekstraksi (misal beberapa kemungkinan tempat match) dan membuat maksimal 1-2 pertanyaan klarifikasi sebelum melanjutkan ke kalkulasi rute | F10            |
| RT-17 | Sistem dapat menyimpan riwayat percakapan AI Planner dan hasil ekstraksinya sebagai data personalisasi untuk sesi berikutnya                                                       | F10            |
| RT-18 | Sistem dapat meneruskan hasil ekstraksi AI Planner langsung ke Route & Map Service (RT-01) tanpa duplikasi logika kalkulasi rute                                                   | F10, F2        |

### 5.2 Requirement Non-Fungsional

| ID     | Requirement                                                               | Target/Ambang                                                                                     |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| RNF-01 | Latensi respons API untuk kalkulasi rute                                  | < 3 detik untuk rute dalam radius 5km                                                             |
| RNF-02 | Latensi pengiriman alert SOS (dari trigger ke diterima relawan/caregiver) | < 5 detik dalam kondisi jaringan normal                                                           |
| RNF-03 | Uptime sistem selama periode demo/pengujian                               | ≥ 99%                                                                                             |
| RNF-04 | Kompatibilitas browser minimum                                            | Chrome/Android WebView terbaru, Safari iOS 16.4+ (untuk Wake Lock)                                |
| RNF-05 | Skalabilitas data geospasial                                              | Query radius search harus tetap performan hingga puluhan ribu titik laporan (index spasial wajib) |
| RNF-06 | Enkripsi data                                                             | TLS 1.2+ untuk semua transmisi; enkripsi kolom sensitif (lokasi riwayat) di database              |
| RNF-07 | Aksesibilitas                                                             | WCAG 2.1 level AA sebagai baseline wajib                                                          |
| RNF-08 | Ukuran payload TTS/respons API                                            | Dioptimalkan untuk koneksi lambat (respons API terkompresi, deskripsi TTS ringkas)                |

### 5.3 Requirement Teknis Tambahan (Profil Ganda, Pemetaan & Pendampingan)

| ID    | Requirement                                                                                                                                                                                            | Terkait Fitur |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| RT-19 | Sistem menyimpan graf jalur aksesibilitas (node & edge) beserta atribut fisiknya, termasuk penanda lantai untuk jalur dalam gedung                                                                     | F13, F1       |
| RT-20 | Sistem dapat menghitung rute atas graf yang sama dengan **fungsi bobot berbeda per profil pengguna**, di mana atribut tertentu dapat bernilai penghalang mutlak (mis. tangga bagi pengguna kursi roda) | F11, F2       |
| RT-21 | Sistem dapat menyimpan preferensi/toleransi personal per pengguna (mis. jumlah anak tangga yang masih sanggup dilalui) dan menerapkannya sebagai modifier bobot                                        | F11           |
| RT-22 | Sistem menyediakan antarmuka penyuntingan graf (tambah/ubah/hapus node & edge) dengan validasi topologi — mencegah edge menggantung tanpa node, atau lantai yang tidak terhubung                       | F13           |
| RT-23 | Sistem dapat menandai objek graf berstatus draft dan hanya memasukkannya ke graf produksi setelah disetujui verifikator                                                                                | F15, F13      |
| RT-24 | Sistem dapat mengubah **status operasional sementara** suatu objek (mis. lift rusak) tanpa menghapus objeknya, dan mengembalikannya saat pulih                                                         | F15, F6       |
| RT-25 | Sistem dapat menyimpan permintaan pendampingan terjadwal, mencocokkannya ke relawan berdasarkan wilayah layanan dan ketersediaan waktu, serta mencegah jadwal bentrok                                  | F12           |
| RT-26 | Sistem dapat menghitung skor aksesibilitas agregat per gedung dari atribut objek graf di dalamnya                                                                                                      | F14           |
| RT-27 | Sistem dapat mengembalikan dua hasil rute untuk profil berbeda dalam satu permintaan, untuk kebutuhan tampilan pembanding                                                                              | P12           |
| RT-28 | Sistem menyediakan mekanisme check-in dua arah pada pendampingan terjadwal (relawan & pengguna sama-sama mengonfirmasi pertemuan)                                                                      | F12           |

### 5.4 Penyesuaian Requirement Non-Fungsional

| ID     | Requirement                         | Target/Ambang                                                                      | Catatan                                                                                              |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RNF-09 | Latensi kalkulasi rute multi-profil | < 2 detik untuk area pilot                                                         | Area pilot berskala kampus, jauh lebih kecil dari radius 5 km pada RNF-01                            |
| RNF-10 | Cakupan data area pilot             | 100% jalur utama Fakultas Teknik & FMIPA terpetakan dan terverifikasi              | Ini metrik kesiapan demo, bukan metrik performa                                                      |
| RNF-11 | Ketersediaan saat demo              | Aplikasi berfungsi penuh tanpa ketergantungan jaringan eksternal untuk area pilot  | Menggantikan RNF-03 (uptime 99%) yang tidak terukur dalam konteks lomba — lihat Bagian 15, temuan E6 |
| RNF-12 | Konsistensi hasil routing           | Pasangan asal–tujuan yang sama menghasilkan rute identik pada pemanggilan berulang | Penting agar demo tidak berubah-ubah di depan juri                                                   |

---

## 6. Data Flow

### 6.1 Diagram Alur Data — Perjalanan Aktif

```
[Browser HP User Tunanetra]
   │
   ├─ Geolocation API (watchPosition) ──────┐
   ├─ DeviceMotionEvent (accelerometer) ────┤
   │                                        ▼
   │                              [WebSocket Connection]
   │                                        │
   │                                        ▼
   │                          [Express + Socket.io Server]
   │                                        │
   │              ┌─────────────────────────┼─────────────────────────┐
   │              ▼                         ▼                         ▼
   │     [PostGIS: cek posisi     [Fall Detection Logic]    [Update lokasi ke
   │      vs titik bermasalah]     (evaluasi pola gerak)      caregiver terkait]
   │              │                         │                         │
   │              ▼                         ▼                         ▼
   │     [Trigger peringatan          [Trigger jeda            [Socket emit ke
   │      area jika dalam radius]      konfirmasi jika          dashboard/device
   │              │                    pola mencurigakan]        caregiver]
   │              ▼                         │
   │     [Kirim ke client:                  ▼
   │      TTS peringatan]           [Timeout tanpa respons?]
   │                                         │
   │                                    Ya   │   Tidak
   │                              ┌──────────┴──────────┐
   │                              ▼                     ▼
   │                     [Trigger SOS Flow]      [Catat sebagai
   │                                              false positive,
   │                                              lanjut normal]
```

### 6.2 Diagram Alur Data — SOS

```
[User trigger SOS]
      │
      ▼
[Client: ambil lokasi terakhir valid (real-time atau cache)]
[Client: rekam audio ambient 10-15 detik]
      │
      ▼
[POST /api/sos] ──────────────────────────┐
      │                                   │
      ▼                                   ▼
[Simpan record SOS ke PostgreSQL]  [Socket.io broadcast]
      │                                   │
      │                    ┌──────────────┼──────────────┐
      │                    ▼              ▼              ▼
      │           [Query relawan    [Notifikasi ke   [Cek status
      │            radius X km      caregiver via     Wake Lock/
      │            via PostGIS]      Socket.io]        koneksi]
      │                    │              │                │
      │                    ▼              ▼                ▼
      │           [Kirim alert ke   [Jika gagal/      [Jika gagal,
      │            relawan yang     timeout →          fallback ke
      │            match]           trigger SMS        SMS gateway]
      │                             fallback]
      ▼
[BullMQ job: pantau status respons,
 eskalasi lanjutan jika tidak ada
 relawan merespons dalam X menit]
```

### 6.3 Diagram Alur Data — AI Planner

```
[User bercerita bebas: teks atau suara]
      │
      ▼
[Jika suara: Web Speech API → transkrip teks di client]
      │
      ▼
[POST /api/ai-planner/message]
      │
      ▼
[Ambil konteks riwayat user dari PostgreSQL
 (tempat sering dikunjungi, percakapan sebelumnya)]
      │
      ▼
[Claude API: ekstrak entitas terstruktur
 (destinasi, waktu, konteks) + gunakan histori sebagai context]
      │
      ▼
[Hasil ekstraksi jelas & tidak ambigu?]
      │
   Ya │              │ Tidak (mis. beberapa tempat match nama serupa)
      ▼              ▼
[Lanjut langkah   [Generate SATU pertanyaan klarifikasi]
 berikutnya]              │
      │                   ▼
      │            [Kirim ke client, tunggu respons user]
      │                   │
      │                   ▼
      │            [Respons user → kembali ke tahap ekstraksi,
      │             maksimal 2 iterasi lalu ambil asumsi terbaik]
      │
      ▼
[Simpan hasil akhir + riwayat percakapan ke PostgreSQL
 (untuk personalisasi sesi berikutnya)]
      │
      ▼
[Panggil Route & Map Service (POST /api/routes/plan)
 dengan destinasi hasil ekstraksi — reuse logika F2, tidak duplikasi]
      │
      ▼
[Lanjut ke Flow 3.1: ringkasan risiko rute, dst.]
```

### 6.4 Diagram Alur Data — Pelaporan Komunitas

```
[User submit laporan (lokasi + kategori + foto opsional)]
      │
      ▼
[POST /api/reports]
      │
      ▼
[Simpan ke PostgreSQL (status: unverified)]
[Upload foto ke Object Storage (jika ada)]
      │
      ▼
[Cek laporan lain di radius sama & kategori sama]
      │
      ▼
[Jumlah laporan senada ≥ threshold?]
      │
   Ya │              │ Tidak
      ▼              ▼
[Update status:  [Tetap unverified,
 verified]        tunggu laporan lain]
      │
      ▼
[Data verified masuk ke:
 - Index PostGIS untuk geofencing (F8)
 - Bobot kalkulasi rute (F2)
 - Konten TTS kontekstual (F3)]
```

### 6.5 Diagram Alur Data — Routing Multi-Profil

```
[User memilih tujuan]
      │
      ▼
[POST /api/routes/plan { origin, destination, profile_id }]
      │
      ▼
[Ambil profil aksesibilitas user + toleransi personal dari PostgreSQL]
      │
      ▼
[Bangun fungsi bobot dinamis berdasarkan profil:]
   ┌──────────────────────────┬──────────────────────────┐
   │  Profil Kursi Roda        │  Profil Tunanetra          │
   │  - ada_tangga  → ∞        │  - ada_tangga  → +penalti  │
   │  - kelandaian>8% → +berat │  - tanpa guiding → +berat  │
   │  - lebar<90cm  → ∞        │  - laporan rintangan → +++ │
   │  - lift rusak  → ∞        │  - lift rusak → netral     │
   └──────────────────────────┴──────────────────────────┘
      │
      ▼
[pgRouting: hitung jalur terpendek atas graf berbobot dinamis]
      │
      ▼
[Gabungkan dengan laporan komunitas aktif di sepanjang rute (PostGIS)]
      │
      ▼
[Hasil: geometri rute + daftar hambatan + tingkat risiko]
      │
      ├──► [Sisi A: kirim ke TTS Service untuk dinarasikan]
      └──► [Sisi B: kirim geometri + marker ke peta visual]
```

### 6.6 Diagram Alur Data — Booking Pendampingan Terjadwal

```
[User ajukan permintaan pendampingan]
      │
      ▼
[POST /api/companions/requests]
      │
      ▼
[Simpan ke PostgreSQL (status: open)]
      │
      ▼
[Query relawan yang cocok:
 - wilayah layanan mencakup lokasi (PostGIS)
 - tidak ada booking terkonfirmasi bentrok di rentang waktu
 - status verifikasi = verified]
      │
      ▼
[Notifikasi ke relawan yang cocok (Socket.io + push)]
      │
      ▼
[Relawan mengajukan diri → simpan sebagai penawaran]
      │
      ▼
[User melihat daftar penawaran + rating & riwayat relawan]
      │
      ▼
[User memilih satu → status: confirmed]
      │
      ├──► [Notifikasi ke relawan terpilih + relawan lain yang tidak terpilih]
      ├──► [Notifikasi ke caregiver terkait (lapisan keamanan)]
      └──► [BullMQ job: pengingat H-1 ke kedua pihak]
      │
      ▼
[Hari-H: check-in dua arah di titik temu]
      │
      ▼
[Selesai → rating dua arah → update volunteer_profiles]
```

---

## 7. Skema Database (PostgreSQL + PostGIS)

### 7.1 Tabel Inti

```sql
-- Users (semua peran: tunanetra, caregiver, relawan)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  phone_verified BOOLEAN DEFAULT FALSE,
  name VARCHAR(100),
  role VARCHAR(20) NOT NULL, -- 'blind_user', 'mobility_user', 'caregiver', 'volunteer'
                             -- catatan: ini PERAN PLATFORM (hak akses fitur).
                             -- Kebutuhan aksesibilitas untuk routing disimpan
                             -- terpisah di user_accessibility_profiles (lihat 7.3)
                             --
                             -- 'volunteer' adalah SATU role dengan DUA kapabilitas
                             -- (bisa menjadi pendamping DAN/ATAU kontributor data
                             -- lewat Peta Editor), bukan dua role terpisah.
                             -- Kapabilitas diatur lewat kolom di bawah, bukan
                             -- lewat percabangan role.
  can_companion BOOLEAN DEFAULT FALSE,  -- relawan ini bisa menerima booking
                                        -- pendampingan (F12)
  can_map_data BOOLEAN DEFAULT FALSE,   -- relawan ini bisa berkontribusi data
                                        -- lewat Peta Editor (F13) — default FALSE
                                        -- sampai relawan diverifikasi
  password_hash TEXT,
  profile_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Relasi caregiver <-> user tunanetra (many-to-many, trusted circle)
CREATE TABLE caregiver_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blind_user_id UUID REFERENCES users(id),
  caregiver_id UUID REFERENCES users(id),
  relationship_type VARCHAR(30), -- 'primary', 'secondary'
  location_sharing_mode VARCHAR(20) DEFAULT 'sos_only', -- 'always', 'sos_only', 'off'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Profil & verifikasi relawan
CREATE TABLE volunteer_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  verification_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'verified'
  rating_avg NUMERIC(2,1) DEFAULT 0,
  total_helps INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

-- Laporan kondisi jalan (data komunitas)
CREATE TABLE road_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id),
  location GEOGRAPHY(POINT, 4326) NOT NULL, -- PostGIS geography type
  category VARCHAR(50) NOT NULL, -- 'guiding_block_rusak', 'terputus', 'salah_arah',
                                  -- 'terhalang', 'tanpa_penyeberangan', 'konstruksi'
  severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high'
  description TEXT,
  photo_url TEXT,
  status VARCHAR(20) DEFAULT 'unverified', -- 'unverified', 'verified', 'disputed'
  corroboration_count INT DEFAULT 1,
  metadata JSONB, -- fleksibel untuk data tambahan per kategori
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_road_reports_location ON road_reports USING GIST(location);

-- Rute tersimpan (untuk fitur "rute terdaftar")
CREATE TABLE saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(100),
  origin GEOGRAPHY(POINT, 4326),
  destination GEOGRAPHY(POINT, 4326),
  route_geometry GEOGRAPHY(LINESTRING, 4326),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sesi perjalanan aktif
CREATE TABLE travel_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  origin GEOGRAPHY(POINT, 4326),
  destination GEOGRAPHY(POINT, 4326),
  route_geometry GEOGRAPHY(LINESTRING, 4326),
  estimated_arrival TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'sos_triggered', 'cancelled'
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- Log lokasi real-time selama sesi (untuk riwayat & audit)
CREATE TABLE location_pings (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES travel_sessions(id),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_location_pings_session ON location_pings(session_id, recorded_at);

-- Insiden SOS
CREATE TABLE sos_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES travel_sessions(id),
  user_id UUID REFERENCES users(id),
  trigger_type VARCHAR(30), -- 'manual_button', 'voice_command', 'fall_detection_escalation'
  location GEOGRAPHY(POINT, 4326),
  audio_recording_url TEXT,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'resolved', 'cancelled', 'false_alarm'
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Respons relawan terhadap SOS
CREATE TABLE sos_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id UUID REFERENCES sos_incidents(id),
  volunteer_id UUID REFERENCES users(id),
  response_status VARCHAR(20), -- 'accepted', 'en_route', 'arrived', 'declined'
  responded_at TIMESTAMPTZ DEFAULT now()
);

-- Insiden fall detection (termasuk false positive, untuk analisis pola)
CREATE TABLE fall_detection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES travel_sessions(id),
  location GEOGRAPHY(POINT, 4326),
  raw_sensor_data JSONB,
  confirmed_as_fall BOOLEAN, -- NULL jika belum ada respons user
  escalated_to_sos BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Riwayat percakapan AI Planner
CREATE TABLE ai_planner_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'abandoned'
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Pesan dalam satu sesi percakapan (baik dari user maupun AI)
CREATE TABLE ai_planner_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES ai_planner_conversations(id),
  sender VARCHAR(10) NOT NULL, -- 'user', 'ai'
  input_mode VARCHAR(10), -- 'text', 'voice' (hanya relevan untuk sender='user')
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Hasil ekstraksi terstruktur dari percakapan (destinasi, waktu, konteks)
CREATE TABLE ai_planner_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES ai_planner_conversations(id),
  destination_text TEXT, -- teks asli sebutan tempat dari user
  destination_location GEOGRAPHY(POINT, 4326), -- hasil resolusi ke koordinat
  planned_time TIMESTAMPTZ, -- waktu rencana keberangkatan jika disebutkan
  context_notes TEXT, -- konteks tambahan (keperluan, dll), disimpan bebas
  clarification_rounds INT DEFAULT 0, -- jumlah iterasi klarifikasi yang terjadi
  resulting_session_id UUID REFERENCES travel_sessions(id), -- jika lanjut ke perjalanan
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Preferensi/personalisasi user yang dipelajari dari waktu ke waktu
CREATE TABLE user_place_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  place_name TEXT NOT NULL,
  place_location GEOGRAPHY(POINT, 4326),
  visit_count INT DEFAULT 1,
  last_visited_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_user_place_preferences_user ON user_place_preferences(user_id);

-- Audit log akses data sensitif
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  action VARCHAR(50), -- 'view_location', 'export_data', dll
  target_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.2 Catatan Desain Skema

- `GEOGRAPHY(POINT, 4326)` dipakai (bukan `GEOMETRY`) karena perhitungan jarak otomatis memperhitungkan kelengkungan bumi, lebih akurat untuk jarak dunia nyata dengan sedikit overhead performa yang bisa diterima di skala aplikasi ini.
- Index `GIST` pada kolom geografi wajib ada di semua tabel yang sering di-query berdasarkan lokasi (`road_reports`, dan sebaiknya juga `location_pings` jika volume data besar).
- Kolom `metadata JSONB` di `road_reports` memberi fleksibilitas menyimpan atribut tambahan spesifik per kategori masalah tanpa mengubah skema (misal kategori "konstruksi" mungkin butuh field "estimasi selesai", kategori "guiding block rusak" mungkin butuh field "panjang segmen rusak").
- `location_pings` didesain sebagai tabel append-only bervolume tinggi; pertimbangkan partitioning berdasarkan waktu jika data bertumbuh besar, dan kebijakan retensi (hapus data lebih dari X hari) untuk menjaga performa dan sejalan dengan requirement N8.
- `ai_planner_conversations` dan `ai_planner_messages` dipisah (bukan satu tabel) supaya riwayat percakapan tersimpan granular per pesan, memudahkan reconstruction konteks untuk LLM call berikutnya dan analisis pola pemakaian.
- `ai_planner_extractions` menyimpan hasil akhir yang sudah terstruktur, terpisah dari raw messages, supaya query "destinasi apa saja yang pernah direncanakan user" tidak perlu parsing ulang percakapan mentah setiap saat.
- `user_place_preferences` sengaja didesain sederhana (agregat kunjungan per tempat) alih-alih menyimpan seluruh riwayat mentah, supaya query personalisasi ("tempat yang sering dikunjungi user ini") cepat tanpa perlu agregasi berat saat runtime. Tabel ini di-update setiap kali sesi perjalanan (`travel_sessions`) selesai dengan sukses.

### 7.3 Skema Tambahan — Graf Jalur, Profil Aksesibilitas & Pendampingan

Tabel-tabel berikut **melengkapi** skema pada 7.1 tanpa mengubahnya. Prinsip yang dipakai: `users.role` tetap berperan sebagai **peran platform**, sedangkan kebutuhan aksesibilitas disimpan terpisah agar satu pengguna bisa memiliki lebih dari satu kebutuhan (mis. low vision sekaligus pengguna kruk).

```sql
-- ========== PROFIL AKSESIBILITAS PENGGUNA ==========

-- Katalog profil kebutuhan (data referensi, bukan data user)
CREATE TABLE accessibility_profiles (
  id VARCHAR(30) PRIMARY KEY,   -- 'blind', 'low_vision', 'wheelchair', 'crutches'
  label VARCHAR(50) NOT NULL,
  primary_channel VARCHAR(10) NOT NULL, -- 'audio' | 'visual'
  weight_config JSONB NOT NULL  -- konfigurasi bobot routing per atribut segmen
);

-- Kebutuhan aksesibilitas yang dimiliki user (bisa lebih dari satu)
CREATE TABLE user_accessibility_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  profile_id VARCHAR(30) REFERENCES accessibility_profiles(id),
  is_primary BOOLEAN DEFAULT TRUE,
  tolerance_overrides JSONB,  -- toleransi personal, mis. {"max_steps": 4}
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_user_acc_profiles_user ON user_accessibility_profiles(user_id);

-- ========== GRAF JALUR AKSESIBILITAS ==========

-- Gedung/area (konteks untuk jalur dalam ruangan & skor aksesibilitas)
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  faculty VARCHAR(100),               -- 'Fakultas Teknik', 'FMIPA', 'GIK'
  footprint GEOGRAPHY(POLYGON, 4326),
  floor_count INT DEFAULT 1,
  accessibility_score NUMERIC(4,1),   -- hasil kalkulasi F14, di-update berkala
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Node graf: titik-titik penting pada jalur
CREATE TABLE path_nodes (
  id BIGSERIAL PRIMARY KEY,
  building_id UUID REFERENCES buildings(id),  -- NULL jika di luar ruangan
  floor_level INT DEFAULT 0,                  -- 0 = lantai dasar/luar ruangan
  node_type VARCHAR(30) NOT NULL,             -- 'entrance', 'lift', 'stairs', 'ramp',
                                              -- 'junction', 'room', 'accessible_toilet',
                                              -- 'crossing', 'parking'
  name VARCHAR(150),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  is_operational BOOLEAN DEFAULT TRUE,        -- untuk status sementara (lift rusak)
  operational_note TEXT,
  operational_until TIMESTAMPTZ,              -- perkiraan pulih, NULL jika tidak diketahui
  status VARCHAR(20) DEFAULT 'draft',         -- 'draft', 'approved', 'rejected'
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_path_nodes_location ON path_nodes USING GIST(location);
CREATE INDEX idx_path_nodes_building ON path_nodes(building_id, floor_level);

-- Edge graf: segmen jalur antar dua node, beserta atribut fisiknya
CREATE TABLE path_edges (
  id BIGSERIAL PRIMARY KEY,
  source_node_id BIGINT REFERENCES path_nodes(id),
  target_node_id BIGINT REFERENCES path_nodes(id),
  geometry GEOGRAPHY(LINESTRING, 4326) NOT NULL,
  length_m NUMERIC(8,2) NOT NULL,

  -- Atribut penentu bobot routing
  surface_type VARCHAR(30),          -- 'paving', 'aspal', 'tanah', 'rumput', 'keramik'
  width_cm INT,
  has_stairs BOOLEAN DEFAULT FALSE,
  step_count INT DEFAULT 0,
  slope_percent NUMERIC(4,1),        -- kelandaian, penting untuk kursi roda
  has_guiding_block BOOLEAN DEFAULT FALSE,
  guiding_block_condition VARCHAR(20), -- 'baik', 'rusak', 'terputus', 'salah_arah'
  has_handrail BOOLEAN DEFAULT FALSE,
  is_covered BOOLEAN DEFAULT FALSE,  -- beratap (relevan saat hujan)
  is_indoor BOOLEAN DEFAULT FALSE,

  is_operational BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'draft',
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_path_edges_geometry ON path_edges USING GIST(geometry);
CREATE INDEX idx_path_edges_nodes ON path_edges(source_node_id, target_node_id);
CREATE INDEX idx_path_edges_status ON path_edges(status) WHERE status = 'approved';

-- Menghubungkan laporan komunitas (7.1) ke objek graf yang terdampak
CREATE TABLE report_edge_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES road_reports(id),
  edge_id BIGINT REFERENCES path_edges(id),
  node_id BIGINT REFERENCES path_nodes(id),
  effect VARCHAR(30),  -- 'block', 'degrade', 'info'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== PENDAMPINGAN TERJADWAL ==========

-- Wilayah & waktu layanan relawan
CREATE TABLE volunteer_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID REFERENCES users(id),
  service_area GEOGRAPHY(POLYGON, 4326),
  day_of_week INT,        -- 0-6, NULL = semua hari
  start_time TIME,
  end_time TIME,
  is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_volunteer_availability_area ON volunteer_availability USING GIST(service_area);

-- Permintaan pendampingan terjadwal
CREATE TABLE companion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES users(id),
  destination_name TEXT NOT NULL,
  destination_location GEOGRAPHY(POINT, 4326),
  meeting_point_location GEOGRAPHY(POINT, 4326),
  meeting_point_note TEXT,
  scheduled_start TIMESTAMPTZ NOT NULL,
  estimated_duration_min INT,
  assistance_types TEXT[],   -- 'memandu_jalan', 'bantu_kursi_roda',
                             -- 'bacakan_informasi', 'dampingi_acara'
  notes TEXT,
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'confirmed', 'completed',
                                      -- 'cancelled', 'expired'
  selected_volunteer_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_companion_requests_location ON companion_requests USING GIST(destination_location);
CREATE INDEX idx_companion_requests_schedule ON companion_requests(scheduled_start, status);

-- Penawaran relawan atas suatu permintaan
CREATE TABLE companion_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES companion_requests(id),
  volunteer_id UUID REFERENCES users(id),
  message TEXT,
  status VARCHAR(20) DEFAULT 'offered', -- 'offered', 'selected', 'not_selected',
                                         -- 'withdrawn'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (request_id, volunteer_id)
);

-- Check-in dua arah saat pendampingan berlangsung
CREATE TABLE companion_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES companion_requests(id),
  actor_id UUID REFERENCES users(id),
  checkin_type VARCHAR(20),  -- 'meet', 'complete'
  location GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.4 Catatan Desain Skema Tambahan

- **`users.role` tidak diperluas untuk kebutuhan aksesibilitas.** Peran platform (`blind_user`, `mobility_user`, `caregiver`, `volunteer`) menjawab _"orang ini bisa mengakses fitur apa"_, sedangkan `user_accessibility_profiles` menjawab _"rute orang ini harus dihitung bagaimana"_. Pemisahan ini penting karena satu orang bisa punya lebih dari satu kebutuhan sekaligus, sementara peran platform-nya tetap satu.
- **`volunteer` sengaja tidak dipecah jadi `volunteer` vs `mapper`.** Di lapangan, satu orang relawan komunitas bisa menjadi pendamping sekaligus kontributor data — memaksakan dua role terpisah hanya akan membuat orang yang sama harus didaftarkan dua kali. Dua kapabilitasnya (`can_companion`, `can_map_data`) diatur independen: seorang relawan bisa mengaktifkan salah satu, keduanya, atau menunggu verifikasi sebelum keduanya aktif.
- **`accessibility_profiles.weight_config` disimpan sebagai JSONB, bukan hardcode di kode.** Dengan begitu penyetelan bobot (mis. seberapa berat penalti segmen tanpa guiding block) bisa diubah tanpa deploy ulang — sangat berguna saat menyetel hasil routing berdasarkan masukan pengguna nyata pada tahap validasi.
- **`path_nodes.floor_level` adalah kunci navigasi dalam gedung.** Perpindahan antar lantai hanya boleh terjadi lewat node bertipe `lift`, `stairs`, atau `ramp`. Inilah yang membuat graf ini berlapis dan bukan sekadar peta datar — dan inilah alasan pengguna kursi roda bisa dinyatakan "terjebak" di suatu lantai secara terukur oleh sistem.
- **`is_operational` dipisahkan dari `status`.** `status` menyangkut kualitas data (draft/disetujui), sedangkan `is_operational` menyangkut kondisi dunia nyata (lift rusak). Menggabungkan keduanya akan membuat lift yang rusak sementara terhapus dari peta, lalu hilang selamanya saat sudah diperbaiki.
- **`report_edge_links` menjembatani `road_reports` (7.1) ke graf.** Ini menjawab temuan E3 pada Bagian 15: laporan bertipe titik kini bisa dikaitkan ke segmen memanjang yang terdampak, tanpa mengubah struktur `road_reports` yang sudah ada.
- **`companion_offers` memakai `UNIQUE (request_id, volunteer_id)`** untuk mencegah relawan mengajukan diri berkali-kali pada permintaan yang sama.
- **Pengecekan bentrok jadwal relawan** dilakukan lewat query rentang waktu pada `companion_requests` berstatus `confirmed`; jika volume tumbuh, pertimbangkan tipe `tstzrange` dengan exclusion constraint agar penegakannya terjadi di level basis data, bukan hanya di level aplikasi.

---

## 8. Keamanan Siber & Keamanan Data

### 8.1 Keamanan Aplikasi (Cyber Security)

| Area                           | Penerapan                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Autentikasi                    | JWT dengan access token berumur pendek + refresh token; verifikasi OTP untuk nomor HP saat registrasi                                       |
| Otorisasi                      | Role-based access control (RBAC) — endpoint tervalidasi berdasarkan peran (tunanetra/caregiver/relawan) di setiap request                   |
| Rate limiting                  | Diterapkan di endpoint publik/rawan abuse: submit laporan (`/api/reports`), trigger SOS (`/api/sos`), login                                 |
| Input validation               | Validasi ketat di setiap endpoint (skema Zod/Joi) untuk mencegah injection dan data korup, khususnya pada payload geolokasi dan file upload |
| HTTPS/WSS wajib                | Seluruh komunikasi (REST API dan WebSocket) hanya lewat koneksi terenkripsi, tidak ada fallback HTTP/WS polos                               |
| Proteksi terhadap spam laporan | Kombinasi rate limiting per user + threshold verifikasi bertingkat (butuh beberapa laporan independen sebelum status "verified")            |
| Content Security Policy (CSP)  | Diterapkan di level HTTP header untuk mencegah XSS pada konten yang menampilkan data dari user lain (misal deskripsi laporan)               |
| Dependency scanning            | Audit rutin dependency (`npm audit`) terutama karena banyak library pihak ketiga (routing, geospasial, SMS gateway SDK)                     |

### 8.2 Keamanan Data & Privasi

| Area                                             | Penerapan                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enkripsi at-rest                                 | Kolom data lokasi sensitif (riwayat perjalanan, `location_pings`) dienkripsi di level database atau menggunakan ekstensi `pgcrypto`                                                        |
| Enkripsi in-transit                              | TLS 1.2+ wajib untuk semua koneksi API dan WebSocket                                                                                                                                       |
| Minimalisasi data                                | Hanya menyimpan data lokasi yang benar-benar diperlukan untuk fitur (riwayat perjalanan, bukan tracking permanen tanpa tujuan)                                                             |
| Kontrol privasi granular                         | User tunanetra mengatur `location_sharing_mode` per caregiver (`always`, `sos_only`, `off`), bukan pengaturan global tunggal                                                               |
| Retensi data                                     | Kebijakan hapus otomatis data `location_pings` setelah periode tertentu (misal 30-90 hari), kecuali terkait insiden SOS yang mungkin perlu disimpan lebih lama untuk keperluan investigasi |
| Hak hapus data (user rights)                     | User dapat meminta penghapusan akun dan seluruh data terkait                                                                                                                               |
| Audit trail                                      | Setiap akses ke data lokasi sensitif oleh pihak lain (caregiver melihat lokasi, admin mengakses data) tercatat di `audit_logs`                                                             |
| Verifikasi relawan sebagai lapisan keamanan data | Relawan yang bisa melihat lokasi SOS user harus melalui verifikasi identitas dasar (OTP minimum), mengurangi risiko penyalahgunaan akses lokasi oleh pihak tak dikenal                     |
| Kebijakan data anak (jika relevan)               | Jika ada kemungkinan pengguna di bawah umur, terapkan consent tambahan dari wali untuk fitur berbagi lokasi                                                                                |

### 8.3 Pertimbangan Khusus: Keandalan Sistem Safety-Critical

Karena beberapa fitur (SOS, fall detection, alert area berbahaya) bersifat safety-critical, ada pertimbangan tambahan di luar keamanan siber standar:

- **Sistem harus fail-safe, bukan fail-silent**: jika suatu komponen gagal (GPS tidak akurat, Wake Lock gagal aktif, koneksi terputus), sistem harus secara eksplisit memberi tahu user lewat audio, bukan gagal diam-diam.
- **Redundansi jalur komunikasi darurat**: SOS tidak boleh bergantung pada satu jalur saja (WebSocket + fallback SMS), mengingat keandalan jaringan bisa bervariasi.
- **Transparansi keterbatasan ke pengguna**: dokumentasi dan onboarding harus jujur menjelaskan keterbatasan fall detection (potensi false positive/negative) dan kebutuhan menjaga aplikasi tetap terbuka di layar depan selama sesi aktif, supaya ekspektasi pengguna sesuai realita teknis.

### 8.4 Keputusan Enkripsi Data Lokasi (Resolusi Konflik Internal)

**Konflik yang diselesaikan:** Bagian 8.2 mewajibkan enkripsi at-rest kolom lokasi menggunakan `pgcrypto`, sementara Bagian 7.2 mewajibkan index GIST pada tabel yang sama. Kolom yang dienkripsi `pgcrypto` tersimpan sebagai `bytea` acak sehingga **tidak dapat di-index secara spasial, tidak dapat dihitung jaraknya, dan tidak dapat dipakai untuk geofencing** tanpa mendekripsi seluruh tabel lebih dulu.

**Keputusan yang diambil:**

| Lapisan                        | Penerapan                                                                                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enkripsi at-rest utama**     | Menggunakan enkripsi di **level penyimpanan** (disk/volume encryption dari penyedia basis data), bukan enkripsi per kolom. Requirement "data terenkripsi saat disimpan" tetap terpenuhi, sementara PostGIS tetap berfungsi penuh. |
| **Enkripsi arsip (penguat)**   | Data `location_pings` yang telah melewati masa retensi aktif diagregasi/diarsipkan ke tabel terpisah dan dienkripsi per kolom sebelum disimpan jangka panjang. Data arsip tidak lagi memerlukan query spasial.                    |
| **Kontrol akses**              | RBAC ketat + `audit_logs` (sudah ada di 7.1) sebagai lapisan pertahanan utama terhadap akses internal yang tidak sah.                                                                                                             |
| **Kolom non-spasial sensitif** | `pgcrypto` tetap dipakai untuk kolom sensitif yang tidak pernah di-query secara spasial (mis. catatan kondisi pribadi, jika ada).                                                                                                 |

**Alasan keputusan:** enkripsi level penyimpanan adalah praktik standar untuk basis data geospasial. Klaim keamanan tetap dapat dipertanggungjawabkan di hadapan penguji — yang berbeda hanya mekanisme penerapannya, bukan tingkat perlindungannya. Sebaliknya, mempertahankan enkripsi per kolom akan mematikan geofencing (F8), pencarian relawan terdekat (RT-04), dan analisis pola lintasan (Flow 3.4 langkah 5) sekaligus.

### 8.5 Keamanan Pertemuan Fisik antara Pengguna dan Relawan

Fitur pendampingan (F4, F12) mempertemukan penyandang disabilitas dengan orang yang belum tentu dikenal, di lokasi fisik nyata. Ini adalah **risiko keselamatan yang harus dijawab secara eksplisit** — dan hampir pasti akan ditanyakan oleh dewan juri.

| Lapisan Perlindungan                     | Penerapan                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verifikasi identitas berjenjang          | OTP nomor HP sebagai syarat minimum (sudah ada di F9); untuk pendampingan terjadwal, tambahkan verifikasi identitas institusional (Kartu Tanda Mahasiswa/pegawai) pada area pilot kampus |
| Pengguna memegang keputusan akhir        | Relawan **mengajukan diri**, pengguna yang memilih — sistem tidak pernah menugaskan relawan secara sepihak (Flow 3.7 langkah 5–7)                                                        |
| Transparansi identitas sebelum pertemuan | Nama, rating, dan jumlah pendampingan sebelumnya ditampilkan sebelum pengguna memilih                                                                                                    |
| Keterlibatan pihak ketiga otomatis       | Caregiver terkait diberi tahu setiap kali pendampingan dikonfirmasi, tanpa memerlukan persetujuan mereka (menjaga otonomi pengguna dewasa)                                               |
| Jejak pertemuan                          | Check-in dua arah (RT-28) mencatat bahwa pertemuan benar-benar terjadi, kapan, dan di mana                                                                                               |
| Konsekuensi berbasis reputasi            | Rating dua arah + pencatatan pembatalan sepihak pada riwayat keandalan relawan                                                                                                           |
| Kanal pelaporan penyalahgunaan           | Mekanisme pelaporan perilaku relawan dengan tindak lanjut penonaktifan akun                                                                                                              |

**Batasan yang harus diakui jujur:** verifikasi berbasis OTP dan kartu identitas **tidak menjamin keamanan mutlak**. Sistem ini mengurangi risiko dan menciptakan akuntabilitas, bukan menghilangkan risiko. Pada penerapan nyata di luar lingkungan kampus, kemitraan dengan organisasi disabilitas resmi sebagai penjamin relawan menjadi prasyarat — dan hal ini sebaiknya dinyatakan terbuka saat pitching, bukan disembunyikan.

### 8.6 Catatan Privasi Tambahan: Pemrosesan Suara Pihak Ketiga

`SpeechRecognition` pada Web Speech API di browser berbasis Chromium **mengirimkan potongan audio ke server pihak ketiga** untuk diproses, bukan diproses sepenuhnya di perangkat. Karena PRD ini menempatkan privasi lokasi sebagai perhatian utama, ketidakselarasan berikut perlu ditangani:

- Nyatakan hal ini secara eksplisit dalam onboarding dan kebijakan privasi — pengguna berhak tahu suaranya diproses di luar perangkat.
- Hindari mendorong pengguna mengucapkan informasi sensitif (alamat rumah lengkap, kondisi kesehatan) lewat kanal suara.
- Sediakan jalur teks yang setara untuk setiap fungsi bersuara, sehingga pengguna yang keberatan tetap dapat memakai seluruh fitur.

---

## 9. Hal Teknis Backend

### 9.1 Tech Stack Backend

| Komponen            | Pilihan                                                  | Alasan                                                                                                                                    |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime & Framework | Node.js + ExpressJS + TypeScript                         | Konsisten bahasa dengan frontend, ekosistem matang, tim sudah familiar                                                                    |
| Database utama      | PostgreSQL + ekstensi PostGIS                            | Kebutuhan geospasial kompleks (radius search, geofencing, routing) jauh lebih matang di PostGIS dibanding alternatif NoSQL                |
| ORM                 | Prisma (dengan raw query untuk operasi PostGIS spesifik) | Type-safe, dokumentasi lengkap, cukup mendukung kebutuhan skema di atas                                                                   |
| Realtime            | Socket.io                                                | Dibutuhkan untuk lokasi real-time ke caregiver, alert SOS, dan notifikasi area berbahaya                                                  |
| Queue & Scheduler   | Redis + BullMQ                                           | Untuk dead man's switch (job berkala), timeout eskalasi SOS, dan proses asinkron lain                                                     |
| Routing/Pathfinding | pgRouting (ekstensi PostGIS) atau OSRM self-hosted       | Kalkulasi rute dengan bobot kustom (hindari titik bermasalah)                                                                             |
| AI/LLM              | Claude API                                               | Generate deskripsi natural language untuk TTS dari data rute + laporan; ekstraksi entitas terstruktur & percakapan untuk AI Planner (F10) |
| SMS Gateway         | Twilio atau provider lokal (Zenziva/Watzap)              | Fallback SOS independen dari push notification                                                                                            |
| Object Storage      | Cloudflare R2 (S3-compatible)                            | Penyimpanan foto laporan komunitas dan rekaman audio SOS                                                                                  |
| Autentikasi         | JWT (access + refresh token) + OTP verification          | Standar aman, mendukung kebutuhan verifikasi nomor HP untuk relawan                                                                       |

### 9.2 Daftar Service/Endpoint API Backend

#### Auth Service

```
POST   /api/auth/register              — registrasi user baru
POST   /api/auth/verify-otp            — verifikasi OTP nomor HP
POST   /api/auth/login                 — login
POST   /api/auth/refresh               — refresh access token
POST   /api/auth/logout                — logout
```

#### User & Relationship Service

```
GET    /api/users/me                   — profil user saat ini
PATCH  /api/users/me                   — update profil
POST   /api/users/caregiver-link       — hubungkan caregiver ke user tunanetra
PATCH  /api/users/caregiver-link/:id   — update mode privasi berbagi lokasi
DELETE /api/users/caregiver-link/:id   — putus hubungan caregiver
GET    /api/users/caregivers           — daftar caregiver terhubung (untuk user tunanetra)
GET    /api/users/dependents           — daftar user tunanetra yang dirawat (untuk caregiver)
```

#### Volunteer Service

```
POST   /api/volunteers/apply           — ajukan diri jadi relawan
GET    /api/volunteers/profile         — lihat profil & rating sendiri
GET    /api/volunteers/nearby          — (internal) cari relawan terdekat dari titik tertentu
POST   /api/volunteers/rate            — beri rating setelah dibantu
```

#### Route & Map Service

```
POST   /api/routes/plan                — hitung rute A ke B dengan bobot kustom
GET    /api/routes/:id                 — detail rute tersimpan
POST   /api/routes/save                — simpan rute sebagai "rute terdaftar"
GET    /api/routes/saved               — daftar rute tersimpan user
GET    /api/map/tiles                  — proxy/serve tile peta (jika self-hosting OSM tile)
```

#### AI Planner Service

```
POST   /api/ai-planner/conversations           — mulai sesi percakapan baru
POST   /api/ai-planner/conversations/:id/message — kirim pesan (teks/hasil transkrip suara),
                                                     terima balasan AI (ekstraksi/klarifikasi)
GET    /api/ai-planner/conversations/:id        — riwayat percakapan tertentu
POST   /api/ai-planner/conversations/:id/confirm — konfirmasi hasil ekstraksi, lanjut ke
                                                     Route & Map Service
GET    /api/ai-planner/preferences              — daftar tempat sering dikunjungi user
                                                     (untuk personalisasi & shortcut)
```

#### TTS / Contextual Description Service

```
POST   /api/tts/route-summary          — generate ringkasan risiko rute (untuk dibacakan sebelum berangkat)
POST   /api/tts/segment-description    — generate deskripsi kontekstual per segmen rute saat berjalan
```

#### Road Report Service

```
POST   /api/reports                    — submit laporan kondisi jalan
GET    /api/reports/nearby             — laporan dalam radius tertentu
GET    /api/reports/:id                — detail laporan
POST   /api/reports/:id/corroborate    — tambahkan laporan senada (menaikkan status verifikasi)
GET    /api/reports/along-route/:routeId — laporan yang bersinggungan dengan rute tertentu
```

#### Travel Session Service

```
POST   /api/sessions/start             — mulai sesi perjalanan aktif
PATCH  /api/sessions/:id/location      — update lokasi real-time (juga via WebSocket)
POST   /api/sessions/:id/end           — akhiri sesi
GET    /api/sessions/:id/summary       — ringkasan sesi (untuk caregiver dashboard)
```

#### SOS Service

```
POST   /api/sos/trigger                — trigger SOS baru
POST   /api/sos/:id/cancel             — batalkan SOS (dengan konfirmasi)
POST   /api/sos/:id/respond            — relawan merespons SOS
PATCH  /api/sos/:id/status             — update status (resolved, dll)
GET    /api/sos/:id                    — detail insiden SOS
```

#### Fall Detection Service

```
POST   /api/fall-events                — catat event fall detection terdeteksi
PATCH  /api/fall-events/:id/confirm    — konfirmasi user (aman/jatuh sungguhan)
```

#### WebSocket Events (Socket.io)

```
Client → Server:
  - location:update          (posisi terkini selama sesi aktif)
  - checkin:respond          (respons dead man's switch)
  - fall:confirm             (konfirmasi setelah fall detection terpicu)

Server → Client:
  - alert:area-warning       (peringatan mendekati titik bermasalah)
  - alert:checkin-request    (permintaan check-in dead man's switch)
  - alert:fall-confirmation  (jeda konfirmasi setelah fall terdeteksi)
  - sos:volunteer-responded  (notifikasi relawan merespons)
  - sos:caregiver-notified   (konfirmasi caregiver sudah menerima alert)
  - session:location-shared  (update lokasi ke caregiver yang memantau)
```

### 9.3 Arsitektur Backend (Ringkas)

```
                    ┌─────────────────────┐
                    │   NextJS Frontend    │
                    │   (PWA, browser HP)  │
                    └──────────┬───────────┘
                               │ HTTPS / WSS
                               ▼
                    ┌─────────────────────┐
                    │   ExpressJS API      │
                    │   + Socket.io        │
                    └──────────┬───────────┘
                               │
           ┌───────────────────┼───────────────────┬──────────────┐
           ▼                   ▼                   ▼              ▼
  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ ┌──────────┐
  │  PostgreSQL      │ │  Redis           │ │  Claude API    │ │  SMS     │
  │  + PostGIS       │ │  (BullMQ queue)  │ │  (TTS content) │ │  Gateway │
  └─────────────────┘ └─────────────────┘ └────────────────┘ └──────────┘
           │
           ▼
  ┌─────────────────┐
  │  Object Storage  │
  │  (Cloudflare R2) │
  └─────────────────┘
```

### 9.4 Mesin Routing: Keputusan pgRouting dan Model Graf

**Keputusan: gunakan pgRouting, bukan OSRM.**

Bagian 9.1 menyebut "pgRouting atau OSRM self-hosted" sebagai pilihan setara. Untuk kebutuhan produk ini, keduanya **tidak setara**:

| Aspek                                | pgRouting                                                                  | OSRM                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Bobot dinamis per permintaan         | Didukung — bobot dapat dihitung sebagai ekspresi SQL saat query dijalankan | Sangat terbatas — profil bobot di-_compile_ lebih dulu menjadi berkas biner |
| Menambah profil pengguna baru        | Cukup menambah baris konfigurasi bobot                                     | Perlu kompilasi ulang seluruh graf per profil                               |
| Sumber data                          | Tabel PostgreSQL milik sendiri (`path_edges`)                              | Ekstrak OpenStreetMap                                                       |
| Kecocokan dengan data survei sendiri | Sangat cocok                                                               | Perlu konversi ke format OSM lebih dulu                                     |
| Data dalam gedung & multi-lantai     | Bisa dimodelkan bebas                                                      | Tidak dirancang untuk itu                                                   |

Karena inti pembeda produk ini justru **bobot yang berbeda per profil pengguna atas graf yang sama**, dan datanya berasal dari survei sendiri (bukan OSM), pgRouting adalah satu-satunya pilihan yang layak. OSRM sebaiknya dicoret dari dokumen teknis agar tim tidak menghabiskan waktu mengevaluasinya.

**Model graf yang dipakai:**

```
Node (path_nodes)          : titik keputusan — pintu, lift, tangga, ramp,
                             persimpangan, ruang, penyeberangan
Edge (path_edges)          : segmen jalur antar node, membawa atribut fisik
Perpindahan lantai         : hanya lewat node bertipe lift/stairs/ramp,
                             menghubungkan floor_level yang berbeda
Bobot                      : dihitung saat query dari atribut edge
                             × weight_config profil × tolerance_overrides user
```

**Contoh perhitungan bobot (konseptual):**

```
biaya_segmen = panjang_meter
             × faktor_permukaan
             × faktor_kelandaian
             + penalti_tanpa_guiding_block
             + penalti_laporan_aktif

Jika (profil = kursi_roda DAN has_stairs = true) → biaya = TAK TERHINGGA
Jika (profil = kursi_roda DAN width_cm < 90)     → biaya = TAK TERHINGGA
Jika (is_operational = false)                     → biaya = TAK TERHINGGA
```

**Konsekuensi yang harus disadari tim:** jika suatu tujuan **tidak terjangkau sama sekali** oleh profil tertentu (mis. ruang di lantai 3 gedung tanpa lift bagi pengguna kursi roda), sistem tidak boleh mengembalikan galat teknis. Sistem harus menjawab secara bermakna: _"tujuan ini tidak dapat dijangkau secara mandiri dengan kursi roda — hambatan: tidak tersedia lift"_, lalu **menawarkan pengajuan pendampingan (F12)** sebagai jalan keluar.

Skenario "tidak terjangkau" ini justru salah satu momen paling kuat untuk didemonstrasikan, karena menunjukkan sistem memahami keterbatasan dunia nyata alih-alih memaksakan rute yang tidak mungkin dilalui.

### 9.5 Endpoint API Tambahan

#### Accessibility Profile Service

```
GET    /api/profiles                      — daftar profil aksesibilitas tersedia
GET    /api/users/me/accessibility        — profil & toleransi milik user
PUT    /api/users/me/accessibility        — set/ubah profil & toleransi personal
```

#### Mapping Service (Peta Editor)

```
GET    /api/graph/nodes                   — node dalam bounding box tertentu
POST   /api/graph/nodes                   — tambah node (status draft)
PATCH  /api/graph/nodes/:id               — ubah atribut/status operasional node
GET    /api/graph/edges                   — edge dalam bounding box tertentu
POST   /api/graph/edges                   — tambah segmen (status draft)
PATCH  /api/graph/edges/:id               — ubah atribut segmen
DELETE /api/graph/edges/:id               — hapus segmen draft
GET    /api/graph/coverage                — cakupan area yang sudah terpetakan
POST   /api/graph/validate                — validasi topologi sebelum submit
```

#### Verification Service

```
GET    /api/verification/queue            — antrean draft & usulan perubahan
POST   /api/verification/:id/approve      — setujui, masukkan ke graf produksi
POST   /api/verification/:id/reject       — tolak dengan alasan
```

#### Companion Service (Pendampingan Terjadwal)

```
POST   /api/companions/requests           — ajukan permintaan pendampingan
GET    /api/companions/requests           — daftar permintaan milik user
GET    /api/companions/open               — permintaan terbuka (untuk relawan)
POST   /api/companions/requests/:id/offer — relawan mengajukan diri
POST   /api/companions/requests/:id/select— user memilih relawan
POST   /api/companions/requests/:id/checkin — check-in dua arah
POST   /api/companions/requests/:id/cancel  — pembatalan
POST   /api/volunteers/availability       — atur wilayah & waktu layanan
```

#### Building & Score Service

```
GET    /api/buildings                     — daftar gedung area pilot
GET    /api/buildings/:id                 — detail + skor aksesibilitas
GET    /api/buildings/:id/barriers        — daftar hambatan terdata
```

#### Route Service (tambahan)

```
POST   /api/routes/compare                — hitung rute untuk 2 profil sekaligus (P12)
```

---

## 10. Hal Teknis Frontend

### 10.1 Tech Stack Frontend

| Komponen           | Pilihan                                         | Alasan                                                                              |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| Framework          | NextJS (App Router) + TypeScript                | SSR/SSG untuk performa awal, ekosistem matang, sesuai target stack                  |
| Styling            | Tailwind CSS                                    | Cepat dikembangkan, tapi prioritas utama tetap aksesibilitas bukan estetika visual  |
| Komponen aksesibel | react-aria (Adobe) atau Radix UI                | Primitive komponen yang sudah teruji kompatibel screen reader                       |
| State management   | Zustand atau React Context                      | Mengelola state sesi perjalanan aktif (lokasi, status Wake Lock, dll) secara ringan |
| Peta               | Leaflet + react-leaflet                         | Open source, gratis, fleksibel untuk custom layer data komunitas                    |
| PWA                | next-pwa atau konfigurasi manual service worker | Supaya bisa di-install ke home screen dan berfungsi sebagai app-like experience     |
| Realtime client    | socket.io-client                                | Koneksi WebSocket ke backend                                                        |

### 10.2 Web API Browser yang Digunakan

| API                                | Kegunaan                                    | Catatan Batasan                                                                   |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| Geolocation API (`watchPosition`)  | Tracking lokasi real-time selama sesi aktif | Tidak berfungsi di background; berhenti saat layar mati tanpa Wake Lock           |
| DeviceMotionEvent                  | Data accelerometer untuk fall detection     | iOS 13+ butuh `requestPermission()` dipicu user gesture                           |
| Web Speech API — SpeechSynthesis   | Text-to-speech untuk maps-to-speech         | Dukungan suara Bahasa Indonesia bervariasi antar device/browser, perlu testing    |
| Web Speech API — SpeechRecognition | Voice command                               | Dukungan jauh lebih baik di Chrome Android dibanding Safari iOS                   |
| Screen Wake Lock API               | Mencegah layar mati selama sesi aktif       | Perlu re-request saat visibility change; ada riwayat bug di iOS Safari versi lama |
| Vibration API                      | Haptic feedback untuk peringatan            | Dukungan terbatas/tidak ada di iOS Safari                                         |
| MediaRecorder API                  | Rekam audio ambient singkat saat SOS        | Butuh izin mikrofon eksplisit                                                     |
| Web Push API                       | Notifikasi ke caregiver/relawan             | Keterbatasan signifikan di iOS di luar kondisi tertentu, perlu fallback SMS       |

### 10.3 Rencana Halaman (Page Plan)

| Halaman                | Deskripsi                                                                                                                                   | Peran Akses          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `/onboarding`          | Alur pengenalan awal: kalibrasi suara, kalibrasi gerak (untuk fall detection), penjelasan keterbatasan sistem, setup caregiver              | Semua peran          |
| `/login`, `/register`  | Autentikasi                                                                                                                                 | Semua peran          |
| `/home`                | Halaman utama user tunanetra: dua jalur setara — input tujuan langsung (voice/teks) atau masuk ke AI Planner, plus akses cepat SOS          | Tunanetra            |
| `/planner`             | Antarmuka percakapan AI Planner (mendukung teks & suara setara), menampilkan hasil ekstraksi untuk dikonfirmasi user sebelum lanjut ke rute | Tunanetra            |
| `/route/plan`          | Hasil perencanaan rute + ringkasan risiko sebelum berangkat (dituju baik dari input langsung maupun dari AI Planner)                        | Tunanetra            |
| `/route/active`        | Tampilan mode Perjalanan Aktif: peta real-time, kontrol sesi, indikator Wake Lock/GPS                                                       | Tunanetra            |
| `/reports/new`         | Form pelaporan kondisi jalan (lokasi, kategori, foto)                                                                                       | Semua peran          |
| `/reports/map`         | Peta agregat laporan komunitas (untuk eksplorasi/verifikasi)                                                                                | Semua peran          |
| `/sos/active`          | Tampilan status SOS berlangsung (untuk user & relawan yang merespons)                                                                       | Tunanetra, Relawan   |
| `/volunteer/dashboard` | Daftar permintaan bantuan di sekitar, riwayat bantuan, rating                                                                               | Relawan              |
| `/volunteer/apply`     | Form pendaftaran & verifikasi relawan                                                                                                       | Calon Relawan        |
| `/caregiver/dashboard` | Ringkasan aktivitas orang yang dirawat, peta lokasi real-time saat sesi aktif                                                               | Caregiver            |
| `/caregiver/settings`  | Pengaturan trusted circle, mode privasi berbagi lokasi                                                                                      | Caregiver, Tunanetra |
| `/profile`             | Pengaturan akun, preferensi aksesibilitas (kecepatan TTS, dll)                                                                              | Semua peran          |
| `/history`             | Riwayat perjalanan & insiden (SOS, fall detection)                                                                                          | Tunanetra, Caregiver |

### 10.4 Panduan Frontend — Hal yang Perlu Diperhatikan

**Aksesibilitas sebagai prioritas nomor satu, bukan tambahan belakangan**

- Setiap komponen interaktif wajib punya label ARIA yang jelas dan deskriptif, diuji langsung dengan screen reader (VoiceOver di iOS, TalkBack di Android), bukan hanya divalidasi lewat automated testing tool saja.
- Urutan fokus (tab order) harus logis dan mengikuti alur penggunaan yang wajar, terutama di halaman `/route/active` yang punya banyak elemen dinamis.
- Kontras warna minimum sesuai WCAG AA, meski prioritas utama tetap audio/screen reader karena target pengguna tunanetra total maupun low vision.

**Desain interaksi untuk kondisi tanpa penglihatan**

- Elemen kritis (tombol SOS) harus punya target area sentuh yang besar (minimum 44x44px sesuai rekomendasi umum, idealnya lebih besar untuk konteks ini) dan posisinya konsisten di semua halaman supaya predictable secara motorik/muscle memory.
- Hindari interaksi yang mengharuskan presisi visual tinggi (drag-and-drop, gesture kompleks) untuk fitur-fitur inti.
- Setiap aksi penting harus punya konfirmasi audio yang jelas ("SOS terkirim", "Rute dimulai") sehingga user tidak perlu melihat layar untuk tahu statusnya.

**Manajemen sesi & state real-time**

- State Wake Lock, koneksi WebSocket, dan status GPS harus dipantau terus-menerus di level aplikasi (bukan hanya dicek sekali di awal), dengan reaksi eksplisit (audio + UI) saat salah satu gagal/terputus di tengah sesi.
- Gunakan `visibilitychange` event untuk mendeteksi saat user pindah tab/aplikasi, dan re-request Wake Lock otomatis saat kembali ke aplikasi.

**Optimasi performa untuk device kelas menengah-bawah**

- Rendering peta (Leaflet) perlu dioptimasi agar tidak lag di device dengan RAM terbatas — pertimbangkan lazy loading tile dan membatasi jumlah marker yang dirender sekaligus (cluster marker untuk laporan komunitas yang padat).
- Ukuran bundle JavaScript perlu dipantau (code splitting per halaman) mengingat kemungkinan koneksi internet lambat di beberapa lokasi.

**Penanganan izin browser (permission handling)**

- Semua permintaan izin sensor (lokasi, mikrofon, motion sensor) harus didahului penjelasan konteks yang jelas kepada user (lewat audio, bukan hanya dialog native browser yang formatnya di luar kendali aplikasi) sebelum prompt native muncul, supaya user paham kenapa izin ini dibutuhkan.
- Sediakan jalur pemulihan yang jelas jika user menolak izin penting (misal, jelaskan fitur apa yang tidak akan berfungsi dan bagaimana mengaktifkannya kembali dari pengaturan browser).

**Konsistensi feedback multi-modal**

- Setiap feedback penting sebaiknya dikirim lewat lebih dari satu kanal sekaligus (audio + vibration + visual) mengingat kondisi penggunaan bisa bervariasi (lingkungan bising, device tidak mendukung vibration, dll), sejalan dengan prinsip redundansi yang juga diterapkan di sisi backend untuk SOS.

**Desain percakapan AI Planner (multi-modal, teks & suara setara)**

- Input teks dan suara harus mengarah ke pipeline pemrosesan yang sama di backend (transkrip suara diperlakukan sebagai teks biasa begitu selesai di-convert), supaya tidak ada duplikasi logika dan hasil konsisten dari kedua jalur.
- Karena klarifikasi dibatasi maksimal 1-2 putaran (lihat Flow 3.5), UI harus menampilkan dengan jelas kapan sistem "menebak" (dan memberi opsi mudah untuk mengoreksi) versus kapan sistem benar-benar bertanya balik — supaya user tidak bingung membedakan konfirmasi dari pertanyaan.
- Selalu tampilkan/bacakan ringkasan hasil ekstraksi sebelum lanjut ke kalkulasi rute (langkah 7 di Flow 3.5), sehingga user punya kesempatan mengoreksi sebelum sistem lanjut memproses, bukan langsung jalan berdasarkan asumsi yang belum tentu benar.

**Kejujuran teknis ke pengguna**

- Antarmuka (dan skrip onboarding) harus secara eksplisit menjelaskan keterbatasan sistem (fall detection bisa salah deteksi, tracking berhenti jika layar mati) sebagai bagian dari desain kepercayaan pengguna, bukan disembunyikan demi kesan "sempurna".

### 10.5 Strategi Antarmuka Dua Sisi (Sisi A dan Sisi B)

**Klarifikasi ruang lingkup atas Bagian 10.4.** Prinsip _"aksesibilitas sebagai prioritas nomor satu, bukan estetika visual"_ pada Bagian 10.1 dan 10.4 **tetap berlaku penuh** — namun ruang lingkupnya adalah **Sisi A**. Produk ini memiliki dua audiens dengan kebutuhan antarmuka yang berlawanan, dan menerapkan satu prinsip yang sama ke keduanya akan merugikan keduanya.

|                         | **Sisi A — Pengguna Disabilitas**                                                 | **Sisi B — Relawan, Caregiver, Pemeta, Verifikator**       |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Siapa                   | Tunanetra, low vision, pengguna kursi roda/kruk                                   | Relawan, caregiver, pemeta, verifikator                    |
| Kanal utama             | Audio (TTS), sentuhan, getaran                                                    | Visual — peta, tabel, dashboard                            |
| Prinsip desain          | Aksesibilitas mutlak; estetika tidak boleh mengorbankan keterbacaan screen reader | Kepadatan informasi, hierarki visual, efisiensi alur kerja |
| Ukuran target sentuh    | Sangat besar, posisi konsisten                                                    | Standar                                                    |
| Jumlah elemen per layar | Seminimal mungkin                                                                 | Boleh padat, asalkan terstruktur                           |
| Perangkat utama         | HP                                                                                | Desktop (Peta Editor) & HP (relawan lapangan)              |
| Metrik keberhasilan     | Bisa dioperasikan tanpa melihat layar sama sekali                                 | Tugas selesai cepat dengan kesalahan minimal               |

**Mengapa pemisahan ini penting bagi produk, bukan sekadar bagi penilaian:** Peta Editor yang buruk berarti pemetaan berjalan lambat dan datanya kacau — dan tanpa data, Sisi A tidak punya apa pun untuk dinavigasikan. Kualitas Sisi B adalah **prasyarat berfungsinya Sisi A**, bukan pemanis.

Perlu ditegaskan agar tidak disalahpahami: **Sisi B tetap wajib memenuhi WCAG 2.1 AA** (N5/RNF-07). Relawan, caregiver, dan pemeta juga bisa merupakan penyandang disabilitas. Yang berbeda adalah **prioritas kanal**, bukan standar aksesibilitasnya.

### 10.6 Standar Desain Sisi B

Karena Sisi B adalah tempat kualitas desain visual dinilai, standar berikut mengikat:

**Sistem desain**

- Tetapkan design token sejak awal: skala tipografi, skala spasi, palet warna dengan pasangan kontras yang sudah diuji, dan radius sudut yang konsisten. Ini mencegah tampilan "template default" yang mudah dikenali penguji.
- Satu keluarga huruf dengan hierarki jelas lebih baik daripada beragam huruf tanpa arah.

**Peta sebagai komponen utama**

- Rancang legenda ikon yang dapat dibedakan **tanpa mengandalkan warna semata** (bentuk + label), agar tetap terbaca oleh pengguna dengan defisiensi penglihatan warna.
- Bedakan secara visual: jalur terpetakan vs belum, segmen dapat dilalui vs terhalang, data draft vs disetujui.
- Gunakan pengelompokan penanda (marker clustering) agar peta tetap terbaca saat data padat.

**Dashboard**

- Dahulukan keadaan yang menuntut tindakan (antrean verifikasi, permintaan pendampingan yang belum terjawab) di posisi paling atas.
- Sediakan rancangan untuk **keadaan kosong, keadaan memuat, dan keadaan galat** — ketiganya pasti muncul saat demo dan sering terlupakan.

**Tampilan pembanding rute (P12)**

- Ini adalah layar yang paling menentukan saat demonstrasi. Rancang secara khusus: dua rute berdampingan, perbedaan jalur ditonjolkan, alasan perbedaan dijelaskan dalam kalimat pendek yang mudah dibaca dari jarak proyektor.

**Uji keterbacaan proyektor**

- Seluruh tampilan Sisi B harus diuji pada resolusi proyektor dengan kontras rendah dan dilihat dari jarak beberapa meter. Antarmuka yang bagus di laptop bisa tidak terbaca sama sekali di ruang Grand Final.

---

## 11. Rencana Validasi Pengguna

Validasi dilakukan dengan pengguna nyata melalui akses komunitas yang dimiliki tim.

### 11.1 Jadwal & Sasaran

| Tahap             | Waktu    | Sasaran                                                    | Keluaran                                                            |
| ----------------- | -------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Wawancara awal    | Minggu 1 | 1–2 pengguna disabilitas mobilitas, 1 tunanetra/low vision | Validasi asumsi masalah, koreksi daftar atribut yang perlu disurvei |
| Uji kegunaan awal | Minggu 4 | Pengguna yang sama, prototipe rute berjalan                | Perbaikan alur & kalimat panduan                                    |
| Uji akhir         | Minggu 6 | Pengguna yang sama + 1 baru                                | Kutipan & temuan untuk pitch deck dan video                         |

### 11.2 Pertanyaan Wawancara Awal (jangan bertanya soal fitur)

Aturan utama: **jangan tanyakan "apakah Anda akan memakai aplikasi ini?"** — jawabannya hampir selalu sopan dan tidak informatif. Tanyakan perilaku masa lalu:

1. Ceritakan terakhir kali Anda kesulitan mencapai suatu tempat di kampus. Apa yang terjadi?
2. Sebelum pergi ke gedung yang belum pernah Anda datangi, apa yang Anda lakukan lebih dulu?
3. Ketika menemukan jalan buntu di tengah perjalanan, apa yang Anda lakukan?
4. Siapa yang biasanya Anda hubungi saat butuh bantuan, dan bagaimana caranya?
5. Hambatan apa yang paling sering Anda temui tapi jarang disadari orang lain?
6. Informasi apa yang paling ingin Anda ketahui **sebelum** berangkat?

### 11.3 Yang Divalidasi Secara Spesifik

- **Ketepatan atribut survei:** apakah atribut yang kami catat (kelandaian, lebar, jumlah anak tangga) memang yang menentukan bagi mereka, atau ada faktor lain yang terlewat?
- **Ambang toleransi:** berapa persen kelandaian yang masih sanggup dilalui? Berapa anak tangga yang masih dianggap bisa?
- **Bentuk kalimat panduan:** seberapa rinci instruksi audio yang membantu, dan sejak titik mana justru membebani?
- **Kesediaan memakai pendampingan relawan:** apakah mereka nyaman didampingi orang asing terverifikasi, atau lebih memilih orang yang sudah dikenal?

### 11.4 Etika Penelitian

- Jelaskan tujuan, minta persetujuan lisan sebelum mencatat atau merekam.
- Jangan menampilkan identitas partisipan pada pitch deck atau video tanpa izin tertulis.
- Berikan kompensasi yang pantas atas waktu mereka, sekecil apa pun bentuknya.
- Sampaikan hasil akhirnya kembali ke partisipan — mereka bukan sumber data, tetapi mitra.
- **Hindari bingkai "inspirasi".** Posisikan partisipan sebagai ahli atas pengalamannya sendiri, bukan objek yang menggugah simpati.

---

## 12. Timeline & Pembagian Kerja

**Waktu efektif: ±6,5 minggu** (30 Agustus → 16 Oktober 2026, batas pengumpulan pukul 23.59 WIB).

### 12.1 Rencana Mingguan

| Minggu | Fokus              | Keluaran wajib                                                                                  |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| 1      | Persiapan & survei | Skema DB jalan, Peta Editor versi kasar, wawancara awal selesai, survei Fakultas Teknik dimulai |
| 2      | Data & fondasi     | Survei FT + FMIPA selesai & terdigitalkan, autentikasi + profil aksesibilitas jalan             |
| 3      | Mesin routing      | pgRouting berjalan dengan bobot multi-profil, endpoint `/routes/plan` berfungsi                 |
| 4      | Sisi A             | Peta pengguna, TTS panduan rute, pelaporan komunitas; uji kegunaan awal                         |
| 5      | Sisi B             | Dashboard relawan, booking pendampingan, antrean verifikasi, penyempurnaan desain               |
| 6      | Pemantapan         | Layar pembanding rute (P12), perbaikan berdasarkan uji, mode offline area pilot, uji akhir      |
| 6,5    | Pengumpulan        | Video 2 menit, pitch deck, rapikan repositori, README, pengumpulan H-1                          |

### 12.2 Pembagian Peran (4 orang)

| Peran                | Tanggung jawab utama                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| Backend & Geospasial | PostGIS, pgRouting, skema graf, endpoint routing                            |
| Frontend Sisi A      | Antarmuka pengguna disabilitas, TTS, aksesibilitas, pengujian screen reader |
| Frontend Sisi B      | Peta Editor, dashboard, sistem desain, layar pembanding rute                |
| Data & Produk        | Survei lapangan, digitalisasi data, wawancara pengguna, pitch deck & video  |

**Catatan:** survei lapangan minggu 1–2 sebaiknya dikerjakan **seluruh anggota tim**, bukan satu orang. Selain mempercepat, setiap anggota jadi memahami langsung masalah yang sedang dipecahkan — dan ini akan sangat terasa saat sesi tanya jawab dengan juri.

### 12.3 Tonggak Kritis (jika meleset, kurangi ruang lingkup)

| Tonggak                       | Batas waktu          | Jika meleset                                               |
| ----------------------------- | -------------------- | ---------------------------------------------------------- |
| Data area pilot siap          | Akhir minggu 2       | Kurangi ke 1 fakultas saja, jangan tambah GIK              |
| Routing multi-profil berjalan | Akhir minggu 3       | Gugurkan seluruh fitur P1 tanpa negosiasi                  |
| Demo end-to-end berjalan      | Akhir minggu 5       | Bekukan fitur, sisa waktu hanya untuk perbaikan            |
| Pengumpulan                   | **15 Oktober** (H-1) | Jangan mengumpulkan di hari terakhir — risiko server penuh |

---

## 13. Daftar Risiko (Risk Register)

| #   | Risiko                                                      | Dampak                             | Mitigasi                                                                                                                                                             |
| --- | ----------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Survei lapangan lebih lama dari perkiraan                   | Fatal — tanpa data, tidak ada demo | Mulai minggu 1 sebelum coding matang; batasi tegas ke 2 fakultas; siapkan set data minimal 1 gedung sebagai jaring pengaman                                          |
| R2  | Jaringan relawan kosong saat demo                           | Sedang                             | Siapkan data awal berisi akun relawan uji; perankan skenario booking secara langsung di panggung                                                                     |
| R3  | pgRouting lebih rumit dari perkiraan                        | Tinggi                             | Siapkan rencana cadangan berupa implementasi Dijkstra sendiri di sisi aplikasi untuk graf kecil (area pilot cukup kecil untuk ini)                                   |
| R4  | Kualitas suara TTS Bahasa Indonesia buruk di perangkat demo | Sedang                             | Uji di perangkat yang akan dipakai demo sejak minggu 4; siapkan berkas audio cadangan yang sudah direkam                                                             |
| R5  | Jaringan internet buruk saat Grand Final                    | Tinggi                             | Mode offline area pilot (P13); siapkan rekaman video demo sebagai cadangan                                                                                           |
| R6  | Fitur terlalu banyak, semua setengah jadi                   | Fatal                              | Patuhi prioritisasi 4.5 tanpa negosiasi; berani menggugurkan P2                                                                                                      |
| R7  | Juri mempertanyakan keamanan pertemuan relawan              | Sedang                             | Jawaban sudah disiapkan di Bagian 8.5 — hafalkan, jangan improvisasi                                                                                                 |
| R8  | Juri menganggap ini "hanya Google Maps versi disabilitas"   | Tinggi                             | Jawaban: Google Maps tidak punya data ini dan tidak bisa merutekan dalam gedung per lantai. Tunjukkan layar pembanding rute (P12) sebagai bukti, bukan argumen lisan |
| R9  | Anggota tim berhalangan saat masa kritis                    | Sedang                             | Dokumentasikan pekerjaan di repositori sejak awal; hindari satu-satunya orang yang paham satu modul                                                                  |
| R10 | Data survei salah/kedaluwarsa saat dicek juri               | Sedang                             | Verifikasi silang oleh 2 anggota per segmen; cantumkan tanggal survei pada tampilan sebagai bentuk kejujuran data                                                    |

---

## 14. Strategi Demo & Kelengkapan Pengumpulan

### 14.1 Kelengkapan yang Diwajibkan Panitia

| Item                                  | Status    | Catatan                                                                                        |
| ------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| Video (YouTube, publik, maks 2 menit) | **Wajib** | Durasi sangat ketat — lihat 14.3                                                               |
| Source code (repositori GitHub)       | **Wajib** | README wajib memuat cara menjalankan & sumber data survei                                      |
| Pitch deck (PDF)                      | **Wajib** |                                                                                                |
| Prototipe/mockup                      | **Wajib** | Prototipe berfungsi lebih kuat daripada mockup                                                 |
| Proposal (PDF, maks 10 halaman)       | Opsional  | Disarankan tetap dibuat — ruang untuk memaparkan metodologi survei dan hasil validasi pengguna |

### 14.2 Alur Demonstrasi yang Disarankan (Grand Final, pitching 10–12 menit)

Urutan ini dirancang agar bukti terkuat muncul lebih awal, sebelum perhatian juri menurun.

1. **Masalah (±1,5 menit)** — buka dengan temuan lapangan dan kutipan dari wawancara pengguna nyata, bukan statistik umum.
2. **Demonstrasi inti (±4 menit)** — layar pembanding rute: satu pasang titik asal–tujuan, dua profil, dua hasil rute berbeda. Jelaskan mengapa berbeda.
3. **Skenario tidak terjangkau (±1,5 menit)** — tunjukkan tujuan yang tidak dapat dicapai dengan kursi roda, lalu perlihatkan sistem menawarkan pendampingan relawan. Ini membuktikan produk memahami batas teknologi.
4. **Sisi A (±2 menit)** — operasikan aplikasi tanpa melihat layar, dengan audio dinyalakan ke ruangan.
5. **Data & validasi (±1,5 menit)** — tunjukkan Peta Editor dan sampaikan bahwa data ini disurvei sendiri oleh tim, bukan diunduh.
6. **Dampak & rencana lanjutan (±1,5 menit)** — skor aksesibilitas gedung sebagai alat advokasi, rencana perluasan area.

### 14.3 Catatan untuk Video 2 Menit

Dua menit sangat singkat. Sekitar 15 detik pertama menentukan apakah penonton bertahan.

- Buka langsung dengan masalah nyata secara visual (pengguna kursi roda berhadapan dengan tangga), **tanpa** intro logo dan tanpa penjelasan latar belakang panjang.
- Sisakan sekitar 45–60 detik untuk rekaman layar produk yang benar-benar berjalan.
- Wajib menyertakan **teks/caption** — ini video tentang aksesibilitas; video tanpa caption akan langsung terlihat tidak konsisten dengan nilai yang dibawa produk.
- Tutup dengan satu kalimat yang mudah diingat, bukan daftar fitur.

### 14.4 Pertanyaan Juri yang Harus Disiapkan Jawabannya

| Pertanyaan                                            | Arah jawaban                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Bedanya dengan Google Maps apa?"                     | Google Maps tidak memiliki data guiding block/ramp/lift di Indonesia dan tidak merutekan di dalam gedung per lantai. Tunjukkan P12 sebagai bukti.                          |
| "Datanya dari mana? Bagaimana kalau salah?"           | Survei langsung, verifikasi silang 2 orang, tanggal survei ditampilkan, laporan komunitas sebagai mekanisme koreksi.                                                       |
| "Bagaimana skalanya ke seluruh Indonesia?"            | Jujur: tidak bisa langsung. Modelnya per institusi/kampus, dengan Peta Editor sebagai alat agar pihak lain memetakan wilayahnya sendiri.                                   |
| "Bagaimana keamanan relawannya?"                      | Bagian 8.5 — verifikasi berjenjang, pengguna memilih sendiri, caregiver diberi tahu, check-in dua arah, akuntabilitas reputasi.                                            |
| "Kenapa tidak pakai IoT/beacon supaya lebih presisi?" | Akurasi setingkat langkah memang menuntut perangkat keras. Produk ini sengaja dirancang pada tingkat rute, agar dapat digunakan hari ini tanpa memasang perangkat apa pun. |
| "Siapa yang akan memelihara datanya?"                 | Unit layanan disabilitas kampus sebagai verifikator, komunitas sebagai pelapor. Sudah dirancang di F15.                                                                    |

---

## 15. Daftar Koreksi & Catatan Terbuka

Bagian ini mencatat temuan atas dokumen versi 1.0 beserta status penanganannya, agar seluruh anggota tim mengetahui apa yang berubah dan mengapa.

### 15.1 Perubahan yang Sudah Disetujui

| Kode | Temuan                                                 | Penanganan                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1   | Judul & `users.role` hanya mencakup tunanetra          | Judul diperluas; enum `role` ditambah `mobility_user`. Kebutuhan aksesibilitas dipisah ke tabel `user_accessibility_profiles` (7.3). Kapabilitas relawan (pendamping/kontributor data) diatur lewat flag `can_companion`/`can_map_data` pada role `volunteer` yang sama, bukan role terpisah — lihat 7.4 |
| K2   | Estetika visual di-deprioritaskan untuk seluruh produk | Ruang lingkup diperjelas di 10.5 — prinsip asli tetap berlaku penuh untuk Sisi A                                                                                                                                                                                                                         |
| K3   | Durasi pengerjaan tertulis "±3 bulan"                  | Dikoreksi ke timeline lomba sebenarnya (±6,5 minggu), dirinci di Bagian 12                                                                                                                                                                                                                               |
| K4   | Nama produk tertulis "UNSTOPABLE"                      | Diseragamkan menjadi "Unstoppable"                                                                                                                                                                                                                                                                       |
| K5   | Enkripsi `pgcrypto` bertabrakan dengan index GIST      | Diselesaikan di 8.4 — enkripsi level penyimpanan, dengan enkripsi arsip sebagai penguat                                                                                                                                                                                                                  |

### 15.2 Temuan Teknis yang Sudah Ditangani

| Kode | Temuan                                                                                 | Penanganan                                                                |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| E1   | Data guiding block/ramp tidak tersedia di OpenStreetMap, padahal F2 bergantung padanya | Ditangani di 1.6 (strategi data & area pilot) dan F13 (Peta Editor)       |
| E2   | OSRM tidak mendukung bobot dinamis per profil                                          | Ditetapkan memakai pgRouting; alasan lengkap di 9.4                       |
| E3   | `road_reports` bertipe POINT, padahal masalah jalur bersifat memanjang                 | Ditangani lewat tabel `report_edge_links` (7.3) tanpa mengubah tabel asli |
| E5   | Web Speech API mengirim audio ke server pihak ketiga                                   | Ditangani di 8.6                                                          |
| E6   | RNF-03 "uptime ≥99%" tidak terukur dalam konteks lomba                                 | Dilengkapi RNF-11 (5.4)                                                   |
| E7   | Jumlah fitur tidak realistis untuk waktu tersedia                                      | Ditangani lewat prioritisasi mengikat di 4.5                              |

### 15.3 Catatan Terbuka — Belum Diputuskan

| #   | Hal                                                                     | Perlu diputuskan                                                                                                               |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| O1  | F1 menyebut "kontur jalan", tetapi sumber data elevasi belum ditentukan | Apakah kelandaian diukur manual saat survei (disarankan, karena area pilot kecil), atau memakai sumber data elevasi eksternal? |
| O2  | Nasib F10 (AI Planner)                                                  | Dikerjakan penuh, dipersempit menjadi penghasil kalimat panduan saja (disarankan), atau digugurkan?                            |
| O3  | Cakupan GIK                                                             | Diputuskan di akhir minggu 2 berdasarkan kecepatan survei nyata, bukan diputuskan sekarang                                     |
| O4  | Verifikasi identitas institusional untuk relawan                        | Perlukah integrasi/pengecekan kartu identitas kampus, atau cukup OTP untuk versi lomba?                                        |
| O5  | Kemitraan dengan Unit Layanan Disabilitas UGM                           | Jika dapat diperoleh sebelum 16 Oktober, ini menaikkan kredibilitas secara signifikan — layak diupayakan sejak minggu 1        |

---

## 16. Ringkasan Perubahan Versi

| Versi | Perubahan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0   | Dokumen awal — fokus tunanetra, navigasi pejalan kaki luar ruangan, SOS, caregiver, relawan reaktif, AI Planner                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.1   | Perluasan ke dua profil pengguna (tunanetra + disabilitas mobilitas); penambahan graf jalur & Peta Editor sebagai prasyarat data; pendampingan relawan terjadwal; strategi antarmuka dua sisi; area pilot Fakultas Teknik & FMIPA UGM; prioritisasi MVP; rencana validasi pengguna; timeline sesuai jadwal lomba; daftar risiko; strategi demo; penyelesaian konflik internal (K1–K5) dan temuan teknis (E1–E7)                                                                                    |
| 1.2   | Role `volunteer` disatukan (bukan dipecah `volunteer`/`mapper`) dengan dua kapabilitas independen (`can_companion`, `can_map_data`), mencerminkan bahwa relawan komunitas yang sama bisa menjadi pendamping sekaligus kontributor data; penambahan Bagian 1.6.1 yang memisahkan secara eksplisit dua sumber data — survei tim (untuk demo) vs kontribusi komunitas berkelanjutan lewat prinsip "Dari Komunitas Untuk Komunitas" (fitur pasca-peluncuran) — agar tidak disamakan saat strategi demo |
