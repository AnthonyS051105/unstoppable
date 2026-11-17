# UNSTOPPABLE

**Platform navigasi dan pendampingan agar lansia dapat sampai ke layanan kesehatan dan aktivitas sehari-hari dengan selamat, dan agar keluarga yang merawatnya tidak perlu selalu ikut menemani.**

UNSTOPPABLE adalah aplikasi web sumber terbuka. Aplikasi ini merencanakan rute berdasarkan kondisi fisik setiap lansia, bukan berdasarkan jarak terpendek. Rute dirancang untuk dihitung dari satu graf jalur hasil survei lapangan, lengkap dengan data kelandaian, lebar jalur, anak tangga, ramp, lift, dan guiding block.

**Coba aplikasinya:** [unstoppable-mu.vercel.app](https://unstoppable-mu.vercel.app) </br>
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

**Untuk pengembang**

8. [Arsitektur dan teknologi](#8-arsitektur-dan-teknologi)
9. [Struktur repository](#9-struktur-repository)
10. [Menjalankan di komputer lokal](#10-menjalankan-di-komputer-lokal)
11. [Variabel lingkungan](#11-variabel-lingkungan)
12. [Pengujian dan deployment](#12-pengujian-dan-deployment)
13. [API, keamanan, dan prinsip data](#13-api-keamanan-dan-prinsip-data)
14. [Berkontribusi, peta jalan, dan lisensi](#14-berkontribusi-peta-jalan-dan-lisensi)

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

Setiap skenario berurutan: **apa yang dilakukan pengguna** (tombol yang ditekan atau kalimat yang diucapkan), **halaman yang terbuka** (rute), dan **hasilnya**. Tombol ditulis **tebal**, ucapan ditulis dalam tanda kutip. Rute ditulis relatif terhadap alamat aplikasi, misalnya `/home`.

**Cara memakai perintah suara.** Tekan ikon mikrofon di bilah atas, lalu tekan **Izinkan & mulai**. Dalam mode kendali langsung, ucapkan perintah tanpa awalan. Dalam mode "Halo Unstoppable", awali setiap perintah dengan "Halo Unstoppable". Daftar lengkap perintah ada di [bagian 5](#5-perintah-suara). Setiap perintah suara punya tombol yang setara, jadi aplikasi tetap bisa dipakai tanpa suara.

### Skenario 1. Mendaftar dan menyiapkan profil lansia

| Langkah | Tindakan pengguna | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Buka aplikasi, lalu tekan tombol daftar | `/` | Halaman landing menjelaskan produk |
| 2 | Isi **Alamat email** dan **Kata sandi**, lalu tekan **Kirim OTP** | `/register` | Server mengirim kode 6 digit ke email |
| 3 | Isi enam kotak kode, atau tempel kodenya, atau ucapkan "isi kode empat satu dua tiga lima enam". Setelah itu kirim formulir dengan tombol (suara tidak mengirim formulir). Kode tidak datang? Tekan **Kirim ulang kode** | `/otp` | Akun terverifikasi dan langsung masuk. Kode berlaku 5 menit |
| 4 | Pilih kartu **Saya lansia**. Dengan suara: "pilih peran lansia" | `/role` | Peran menentukan beranda dan menu. Pilihan lain: **Saya merawat anggota keluarga lansia** dan **Saya relawan** |
| 5 | Tekan **Mulai** pada layar sambutan. Tombol **Dengarkan penjelasan** membacakannya | `/onboarding` | Langkah 1 dari 5 |
| 6 | Pilih kondisi, minimal satu: kursi roda, walker atau tongkat, penglihatan menurun, atau penglihatan berat terganggu. Dengan suara: "pilih kondisi kursi roda", "pilih kondisi walker", "pilih kondisi penglihatan menurun", atau "pilih kondisi penglihatan berat terganggu". Lalu lanjut | `/onboarding` | Langkah 2 |
| 7 | Jawab "Toleransi anak tangga" dan "Seberapa curam jalur yang masih nyaman?", atau lewati | `/onboarding` | Kondisi dan toleransi tersimpan ke server |
| 8 | Beri izin lokasi dan izin suara dengan kotak centang. Keduanya boleh ditolak tanpa memblokir aplikasi | `/onboarding` | Langkah 4. Browser meminta izin lokasi |
| 9 | (Opsional) Centang **Tautkan anggota keluarga**, isi nama dan nomor telepon keluarga (harus sudah punya akun Keluarga), pilih mode berbagi, lalu selesaikan | `/onboarding` | Langkah 5. Keluarga tertaut dengan izin berbagi pilihan lansia |
| 10 | Selesai | `/home` | Muncul pesan "Profil Anda sudah tersimpan. Selamat datang!" |

Dengan suara, "langkah sebelumnya" mundur satu langkah onboarding. Pengguna yang sudah punya akun masuk lewat `/login` dengan nomor telepon atau email. Setiap peran diarahkan ke beranda masing-masing: lansia ke `/home`, keluarga ke `/caregiver`, relawan ke `/dashboard`, admin ke `/verification`.

### Skenario 2. Mencari tujuan dan melihat rute (lansia)

Pak Budi, pengguna kursi roda, ingin ke Teknik Geologi.

| Langkah | Tindakan pengguna | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Tekan mikrofon di bilah atas dan ucapkan **"cari teknik geologi"**. Cara lain: ucapkan "buka pencarian" lalu ketik di kolom **Cari nama gedung, fakultas, atau kode**, atau tekan **Pilih tujuan** di beranda | `/home` atau `/search` | Bila hanya satu tujuan cocok, detail tempat langsung terbuka dan dibacakan, termasuk tanggal survei atau keterangan "belum disurvei". Bila ada beberapa, ucapkan nama yang lebih lengkap |
| 2 | Tekan **Cari rute ke sini**. Tombol ini sengaja harus ditekan, suara tidak menyetujuinya. Tekan **Lihat skor dan fasilitas** untuk skor gedung | `/place` | Rute dihitung dengan bobot kondisi pengguna |
| 3 | Tunggu | `/loading` | Teks "Mencari rute yang sesuai untuk Anda" |
| 4 | Ucapkan **"baca rute"** (atau tekan **Dengarkan**), lalu dengarkan ringkasan dan langkah | `/preview` | Jarak, durasi, hambatan, daftar langkah, peta, dan kesegaran data dibacakan |
| 5 | (Opsional) Tekan **Bandingkan rute** | `/compare` | Dua profil pada asal dan tujuan yang sama, dengan panel penjelasan mengapa rutenya berbeda. Tekan **Ubah kondisi** untuk berganti profil |
| 6 | (Opsional) Ucapkan "simpan rute", atau tekan **Jadwalkan** untuk memilih waktu berangkat | `/preview` | Rute masuk `/saved`, atau jadwal masuk daftar perjalanan terjadwal dan pengingat dikirim |
| 5 alt | Tujuan tidak punya jalur yang memenuhi profil | `/unreachable` | Alasan spesifik, misalnya gedung tanpa lift ke lantai atas. Tekan **Minta Pendamping ke sini** untuk mengajukan relawan. Ini jawaban yang benar, bukan layar galat |

### Skenario 3. Melakukan perjalanan dengan panduan suara (lansia)

Inti pengalaman bagi pengguna tunanetra dan penglihatan menurun. Tidak ada layar yang wajib dilihat.

| Langkah | Tindakan pengguna | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Ucapkan **"mulai perjalanan"**, atau tekan **Mulai perjalanan** | `/preview` lalu `/trip` | Sesi dimulai di server, layar dijaga tetap menyala, dan lokasi dibagikan ke keluarga sesuai izin |
| 2 | Dengarkan instruksi pertama | `/trip` | Narasi dibacakan dari fakta database: arah, jarak, jumlah anak tangga, status lift, dan peringatan seperti guiding block rusak |
| 3 | Ucapkan **"ulangi petunjuk"**, atau tekan **Ulangi** | `/trip` | Instruksi saat ini dibacakan ulang |
| 4 | Ucapkan **"langkah berikutnya"** (atau "petunjuk berikutnya"), atau tekan tombol langkah berikutnya. Ucapkan "langkah sebelumnya" untuk mundur | `/trip` | Pindah ke instruksi berikut. Kemajuan ditampilkan dan diumumkan ke pembaca layar |
| 5 | Ucapkan **"jeda perjalanan"**, lalu **"lanjutkan perjalanan"** | `/trip` | Perjalanan dijeda lalu dilanjutkan |
| 6 | Ucapkan "perbesar peta" atau "teks lebih besar" bila perlu. Ucapkan "baca halaman" untuk membacakan isi layar | `/trip` | Tampilan menyesuaikan |
| 7 | Ucapkan **"akhiri perjalanan"**, atau tekan **Akhiri perjalanan** | `/trip` | Sesi ditutup di server dan keluarga diberi tahu |
| 8 | Dengarkan layar tiba, lalu tekan **Beri Masukan** (atau **Rute Baru** untuk berangkat lagi) | `/arrived` | Layar "Tiba di tujuan" |
| 9 | Pilih satu jawaban tanpa mengetik: **Sesuai dan nyaman**, **Ada hambatan kecil**, atau **Perlu diperbaiki** | `/feedback` | Muncul "Terima kasih, masukan Anda tersimpan." Bila ada hambatan, pengguna dapat langsung melapor |

Selama perjalanan, tombol SOS selalu berada di posisi yang sama. Suara dibacakan lewat Piper di server. Bila layanan suara tidak aktif, aplikasi beralih otomatis ke suara bawaan browser, sehingga narasi tidak pernah gagal total.

### Skenario 4. SOS saat dalam masalah

| Langkah | Tindakan pengguna | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Ucapkan **"SOS"** (atau "darurat" atau "tolong"), atau tekan tombol **SOS** yang selalu ada di layar | `/sos` | Layar SOS terbuka. Suara hanya membuka layar, tidak mengirim darurat |
| 2 | **Tahan tombol SOS selama 1,5 detik.** Dengan keyboard: tahan **Spasi** atau **Enter**. Lepaskan sebelum selesai untuk membatalkan | `/sos` | Getar dan hitung mundur suara, lalu sinyal dikirim |
| 3 | Tunggu respons. Tekan **Batalkan SOS** bila ternyata tidak diperlukan | `/sos-active` | Jumlah penerima, nama relawan yang merespons dengan status "Menuju Anda", dan pembaruan realtime |
| 3 alt | Tidak ada penerima di sekitar. Tekan **Hubungi 112** atau **Coba lagi** | `/sos-empty` | Pengguna diberi tahu terus terang dan ditawari jalur alternatif. SOS tidak boleh gagal senyap |

Di sisi penerima:

- **Keluarga tertaut** menerima peringatan "SOS dari ..." lalu menekan **Lihat lokasi SOS** (sesuai izin berbagi).
- **Relawan terverifikasi** di wilayah layanan melihat kartu SOS baru di `/dashboard` lalu menekan **Bantu / Menuju Lokasi**.

Bila tidak ada yang merespons dalam batas waktu, server mengeskalasi insiden. SOS berjalan lewat koneksi realtime dan tidak mengirim SMS atau menghubungi 112 secara otomatis.

### Skenario 5. Melaporkan hambatan di jalan

| Langkah | Tindakan pengguna | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Ucapkan **"lapor hambatan"**, atau tekan **Laporkan Hambatan**. Pilih kategori lewat kartu ikon besar: guiding block rusak, ada penghalang, lift rusak, ramp terhalang, jalan rusak, genangan, atau lainnya. Tekan **Lanjutkan** | `/report` | Tanpa mengetik |
| 2 | Periksa **Lokasi hambatan** (terisi dari GPS, ketuk peta untuk menggeser), pilih tingkat keparahan, tambah foto lewat **Pilih foto** (maksimal 3), dan isi **Deskripsi (opsional)**. Dengan suara: "isi deskripsi ramp tertutup barang" | `/report-confirm` | Ringkasan laporan |
| 3 | Tekan **Kirim Laporan** (suara tidak mengirim formulir) | `/report-sent` | Konfirmasi dari server |
| 4 | Tekan **Lihat laporan** atau **Periksa laporan saya** | `/my-reports` | Status laporan sendiri |

Pengguna lain dengan perjalanan aktif dalam radius 500 m menerima peringatan, dan dapat menekan tombol untuk menguatkan laporan satu kali. Laporan masuk antrean verifikasi. Setelah admin menyetujui dengan dampak "blokir", rute yang bergantung pada jalur itu menjadi tidak terjangkau pada perhitungan berikutnya.

### Skenario 6. Meminta pendamping relawan

| Pihak | Tindakan pengguna | Rute |
| --- | --- | --- |
| Lansia | Ucapkan **"minta pendamping"**, atau tekan **Minta Pendamping**. Isi tujuan, **Titik temu**, waktu, dan kebutuhan (ucapkan "isi titik temu gerbang utama", "isi catatan kursi roda"). Tekan **Ajukan permintaan** (suara tidak mengirimnya) | `/assistance` lalu `/assistance-form` |
| Relawan | Buka **Daftar relawan** atau permintaan di area layanannya. Tekan **Lihat**, lalu tawarkan bantuan | `/volunteer-requests` lalu `/volunteer-request` |
| Lansia | Tekan **Lihat penawaran relawan**, bandingkan penawaran, lalu tekan **Pilih relawan ini** | `/volunteer-offers` dan `/volunteers` |
| Relawan | Tekan **Terima** atau **Tolak** pada permintaan yang masuk, lalu cek jadwal lewat **Detail jadwal** | `/volunteer-schedule` |
| Kedua pihak | Saat bertemu, tekan **Saya sudah bertemu**. Setelah selesai, relawan menekan **Selesai Membantu** dan lansia mengonfirmasi **Pendampingan selesai**. Cek lewat **Lihat status** | `/assistance-status`, `/assistance-detail` |
| Lansia | Tekan **Beri rating** untuk menilai relawan | `/assistance-rating` |

Pendampingan yang dimulai dari layar "tidak terjangkau" mengisi tujuan secara otomatis.

### Skenario 7. Keluarga memantau

| Langkah | Tindakan pengguna | Rute |
| --- | --- | --- |
| 1 | Lansia ucapkan "keluarga" atau buka menu, lalu tekan **Tautkan Kontak Keluarga** dan pilih mode berbagi lokasi: selama perjalanan atau hanya saat SOS. Tekan **Kelola tautan** untuk mengubah atau **Putuskan tautan keluarga** untuk mencabut | `/caregiver-link` |
| 2 | Keluarga masuk, lalu melihat daftar lansia yang tertaut | `/caregiver` |
| 3 | Saat lansia berjalan, keluarga menekan **Pantau Perjalanan** | `/monitor` |
| 4 | Saat SOS, keluarga menerima peringatan dan menekan **Lihat lokasi SOS** | notifikasi di `/notifications` |

Keluarga menerima notifikasi saat perjalanan dimulai, selesai, atau terhenti tanpa penjelasan. Peringatan sampai walau aplikasi sedang tidak dibuka bila izin notifikasi diberikan.

### Skenario 8. Memetakan dan memverifikasi data

| Peran | Tindakan pengguna | Rute |
| --- | --- | --- |
| Relawan | Isi **Nama lengkap**, **Dokumen identitas**, dan **Motivasi menjadi relawan**, lalu kirim. Tekan **Lihat status pendaftaran** untuk memantau | `/volunteer-register`, `/volunteer-pending` |
| Admin | Tinjau pendaftaran lalu tekan **Setujui relawan** atau tolak dengan **Alasan penolakan** | `/volunteer-review` |
| Relawan atau pemeta | Tekan **Atur wilayah**, geser **Titik pusat wilayah**, atur **Radius layanan dalam kilometer**, lalu **Gunakan wilayah**. Aktifkan **Tersedia menerima permintaan** | `/service-area` |
| Pemeta | Pilih **Mode editor**, tekan **Tambah node melalui koordinat**, isi atribut (**Lebar (cm)**, **Kelandaian (%)**, **Jumlah anak tangga**, **Guiding block**, **Permukaan**). Data baru berstatus draf | `/editor` |
| Admin | Tekan **Validasi topologi** untuk memeriksa graf terhubung | `/topology` |
| Admin | Buka **Antrean verifikasi**, pilih usulan atau laporan, tekan **Tinjau**, lalu **Setujui** atau **Tolak** | `/verification`, `/review` |

### Skenario 9. Merencanakan perjalanan dengan AI Planner

| Langkah | Tindakan pengguna | Rute | Yang terjadi |
| --- | --- | --- | --- |
| 1 | Ucapkan **"AI planner"** (atau "perencana perjalanan"), atau buka dari menu | `/ai-planner` | Percakapan perencanaan terbuka |
| 2 | Ketik di **Pesan untuk Asisten Perjalanan** atau pilih **Contoh pesan**, lalu tekan **Kirim pesan**. Tekan **Dengarkan jawaban asisten** untuk mendengar balasan | `/ai-planner` | Asisten mencari tujuan terdata. Fakta fisik berasal dari database |
| 3 | Pilih rekomendasi, lalu tekan **Cari Rute Manual** bila ingin memilih sendiri tanpa percakapan | `/ai-planner` lalu `/preview` | Rute dihitung seperti Skenario 2 |
| 4 | Tekan **Jadwalkan** atau **Buat agenda** | `/ai-planner` | Rencana tersimpan dan pengingat dikirim lewat notifikasi |

Bila layanan AI tidak aktif, tampil "Asisten AI tidak tersedia" dan pengguna dapat memakai **Cari Rute Manual**.

### Menu pendukung

| Rute | Isi | Perintah suara |
| --- | --- | --- |
| `/settings`, `/account`, `/profile` | Menu, akun, dan kondisi pengguna. Mengubah kondisi menghitung ulang rute | "buka pengaturan", "kondisi Anda" |
| `/voice-settings` | Narasi, kecepatan suara, dan mode kendali suara | "panduan suara" |
| `/saved`, `/history` | Rute tersimpan dan riwayat perjalanan | "rute tersimpan", "riwayat perjalanan" |
| `/notifications`, `/notification-settings` | Kotak masuk dan pengaturan notifikasi | "notifikasi" |
| `/communities`, `/community` | Komunitas berbagi informasi jalur | "komunitas" |
| `/privacy`, `/exports`, `/help` | Privasi, ekspor, dan bantuan | "bantuan" |

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

---

# Untuk pengembang

## 8. Arsitektur dan teknologi

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

## 9. Struktur repository

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

## 10. Menjalankan di komputer lokal

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

## 11. Variabel lingkungan

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

## 12. Pengujian dan deployment

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

## 13. API, keamanan, dan prinsip data

**API.** Seluruh endpoint HTTP berada di bawah `/api` (ditambah `/health`), dan event WebSocket diautentikasi dengan token saat handshake. Respons memakai amplop seragam dan koordinat `[longitude, latitude]`. Daftar lengkap, contoh permintaan, dan kode galat ada di [API_DOCS.md](API_DOCS.md). Kontrak bersama BE dan FE ada di [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

**Keamanan.** Helmet dan CORS terbatas ke origin frontend, pembatasan laju per endpoint (termasuk pengiriman ulang OTP), validasi Zod, akses berbasis peran (RBAC), audit log untuk tindakan penting, dan voice microservice yang menolak permintaan tanpa kunci internal.

**Privasi.** Lokasi lansia hanya dibagikan ke keluarga yang diberi izin oleh lansia itu sendiri. Admin dan verifikator tidak berhak melihat lokasi pengguna. Data ping lokasi dihapus otomatis setiap hari.

**Prinsip data survei.**

- Data graf berasal dari survei lapangan nyata. Data karangan tidak boleh tampak seperti hasil survei, jadi seed dev memakai nama berkas `*.dev.seed.ts` dan `surveyedAt = null`.
- Fakta fisik dalam narasi rute selalu berasal dari database, bukan dikarang model bahasa.
- Data baru dan laporan komunitas harus lolos verifikasi sebelum dipakai perutean.

**Keselamatan pendampingan.** SOS tidak boleh gagal senyap, relawan tidak pernah ditugaskan otomatis, dan check-in selalu dua arah.

## 14. Berkontribusi, peta jalan, dan lisensi

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
