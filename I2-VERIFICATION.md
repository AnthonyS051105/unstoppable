# Verifikasi lanjutan I2 — 27 Oktober 2026

Basis: `origin/staging-frontend` pada `336cde851e384aa310e84130c53192b439d023fc`.
Branch: `fix/fe-i2-peta-rute`. Working tree awal bersih; tidak ada perubahan lokal pengguna yang ditimpa.

Status: implementasi lanjutan I2 siap ditinjau, **belum memenuhi penutupan penuh I2 dengan data survei nyata**.
Data backend yang diuji mencakup `[DEV]` dan data uji lain; bukan bukti survei lapangan.
Tidak ada perubahan skema Prisma, API_CONTRACT, dependency, CSS, atau implementasi I3.

## Audit dan perbaikan

- Integrasi `GET /buildings`, `POST /routes/plan`, penanganan 422, dan compare sudah ada; diperbaiki tanpa dibuat ulang.
- Detail gedung kini mengambil detail dan hambatan secara terpisah, dengan status pemuatan, gagal/coba lagi, kosong, dan berisi.
- Node fasilitas mengikuti bbox Leaflet, debounce 350 ms, pembatalan request lama; parameter `status=approved` dan filter klien menjaga hanya approved tampil. Daftar teks setara disediakan pada beranda.
- Fasilitas, termasuk ruang di lantai atas, bisa dibuka dan dirutekan memakai koordinat node server. ID graf tetap string.
- Katalog API dimulai kosong. Error atau respons kosong tidak mempertahankan katalog demo. Data demo terpisah tetap tersedia bagi layar gelombang lain.
- Origin harus dipilih eksplisit: GPS atau titik katalog. GPS di luar pilot dikirim apa adanya, tanpa penggantian gerbang otomatis. Origin/hasil rute dihapus ketika akun berubah.
- Preview hanya tersedia untuk hasil server yang cocok dengan tujuan dan profil primer. Error sistem memiliki coba ulang; 422 tetap hasil bisnis dengan pesan/reasons server dan opsi pendampingan.
- Compare memakai origin yang sama untuk kedua profil, ID tujuan, geometri dan alasan server. Hasil lama dibuang saat request baru/gagal; durasi/kesegaran yang tidak dikirim server dinyatakan tidak tersedia.
- Tanggal statis, jarak contoh pada pencarian, peringatan ramp contoh, dan statistik demo tidak dipakai I2. Hasil `[DEV]` diberi penjelasan pengembangan.
- Bug backend yang ditemukan melalui endpoint nyata: geometri edge tidak mengikuti traversal balik pgRouting. `orientEdge` kini membalik **urutan vertex**, tidak menukar pasangan longitude/latitude; hasil dipakai geometri dan pembangun langkah. Wilayah Nafal disentuh khusus untuk memperbaiki alur I2 ini; perlu review backend.

## Pengujian endpoint/backend nyata

Backend dijalankan pada port 4000, frontend 3000. Akun pengujian dibuat melalui register/OTP/login dengan label `[DEV]`.
Tidak ada seed atau data survei yang dibuat/diubah untuk memperoleh hasil rute.

| Panggilan | Hasil teramati |
|---|---|
| `GET /health` | 200, DB ok; layanan speech down (I3, tidak diuji) |
| `GET /buildings` | 200, dua gedung `[DEV]`, `surveyedAt=null` |
| `GET /buildings/:id` dan `/barriers` | 200; detail dan daftar hambatan kosong pada gedung GIK |
| `GET /graph/nodes?bbox=...&status=approved` | 200; hanya approved; fasilitas dan koordinat muncul di peta/daftar |
| `POST /routes/plan`, gerbang → GIK, wheelchair | 200, 255,3 m, tiga langkah termasuk tiba, satu hambatan laporan; narasi disertakan |
| `POST /routes/plan`, KPFT → GIK, wheelchair | 200, sekitar 302 m, lima langkah, satu hambatan laporan |
| `POST /routes/plan`, GIK → gerbang | Sebelum fix geometri berakhir salah; setelah fix dimulai `[110.374,-7.7662]`, berakhir `[110.3718,-7.7655]`, startPoint langkah pertama sesuai asal |
| `POST /routes/plan`, gerbang → ruang sidang KPFT, wheelchair | 422 `ROUTE_UNREACHABLE`, alasan tangga dan tidak ada lift; layar bisnis dan tombol pendampingan |
| `POST /routes/compare`, gerbang → ruang sidang | 200: wheelchair tidak terjangkau, blind sekitar 100 m / tujuh langkah |

## Pengujian browser

- Gedung → detail → rencana → preview diuji dengan backend nyata.
- Alur tersebut juga selesai memakai Tab/Enter dan pemilih asal native dengan keyboard; terakhir 24 + 9 + 3 perpindahan Tab pada viewport desktop. Tidak memulai perjalanan I3.
- Unreachable nyata dibuka dari fasilitas ruang sidang. Dialog titik alternatif: Enter membuka, Escape menutup, fokus kembali ke pemicu.
- Lima geseran peta cepat melalui keyboard menghasilkan satu request bbox baru setelah debounce.
- GPS browser **simulasi** di Jakarta dikirim utuh `[106.8456,-6.2088]`; backend menjawab 422 area tidak dipetakan. Izin GPS ditolak juga diuji: asal tetap belum dipilih dan ada penjelasan manual.
- Katalog loading/kosong/error/berisi diuji. Kosong dan 503 melalui injeksi respons browser, bukan pengosongan DB; tidak ada Puskesmas demo yang tampil.
- Error layanan rute 503 melalui injeksi respons: pesan tampil pada layar rute, coba lagi kembali ke preview dari backend nyata.
- Compare berisi memakai respons nyata. Empty dan 503 diinjeksi terpisah; tabel menampilkan tidak tersedia/gagal, bukan statistik lama.
- Satu node draft diinjeksi ke respons graph sebagai uji pertahanan: tidak tampil. Ini tidak mengubah DB.
- Screenshot staging sebelum dan sesudah tersedia untuk home/detail desktop, detail 360 px, preview, compare, dan keadaan layar. Baseline port 3001 memakai respons backend nyata dengan penyesuaian CORS **khusus harness browser**.
- Pemeriksaan visual: token warna, tipografi, bentuk tombol/kartu, shell dan peta tetap DS v6. Penambahan origin serta status/hambatan menambah tinggi konten secara sengaja. Tidak ada overflow horizontal pada detail/compare 360 px.
- Snapshot aksesibilitas diperiksa; **belum** diuji dengan VoiceOver/TalkBack fisik, pembesaran 200%, atau proyektor. Snapshot bukan pengganti screen reader.

Bukti visual yang disertakan di repo:

- [Beranda sebelum](test-evidence/i2/i2-before-home-desktop.png) · [sesudah](test-evidence/i2/i2-after-home-desktop.png)
- [Detail 360 px sebelum](test-evidence/i2/i2-before-place-mobile.png) · [sesudah](test-evidence/i2/i2-after-place-mobile.png)

Bukti tambahan sesi ini disimpan lokal di `/tmp/unstoppable-i2-evidence/` (preview, compare, serta keadaan layar).

## Pemeriksaan otomatis

```bash
npm --prefix frontend run lint
frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json
node backend/node_modules/tsx/dist/cli.mjs --tsconfig frontend/tsconfig.json --test frontend/tests/i2-live.test.ts
npm --prefix frontend run build -- --webpack
npm --prefix backend test
npm --prefix backend run build
```

- Lint dan typecheck frontend: lulus.
- Tujuh regresi frontend: lulus (API kosong/gagal, origin eksplisit, unreachable, respons lama, error sistem, compare gagal, approved-only).
- Backend: 17 suite / 86 tes lulus, termasuk dua tes arah traversal baru. Tes arah balik diamati gagal sebelum perbaikan.
- Production build frontend webpack: lulus. Build default Turbopack gagal pada proses CSS (`binding to a port: Operation not permitted`), termasuk setelah percobaan di luar sandbox; konfigurasi proyek tidak diubah sebagai jalan pintas.
- Build/typecheck backend: **gagal pada baseline**, TS1117 properti `urgent` duplikat di `src/jobs/check-stale-sessions.job.ts:68,84`. Baris yang sama dikonfirmasi melalui `git show origin/staging-frontend:...`; tidak diperbaiki karena scope sesi I2, bukan I3.

## Ketidakcocokan dan syarat penutupan

1. **Data nyata pilot belum terverifikasi.** Dua gedung `[DEV]` belum disurvei; sebagian node uji lain bertanggal. Integrasi teknis dapat didemokan, klaim survei nyata tidak dapat dibuat. Perlu dataset survei dan verifikasi tim, termasuk fasilitas kesehatan pilot sesuai INTEGRATION-GUIDE §8.
2. **Kontrak hambatan gedung belum mendefinisikan response.** Frontend mengikuti `buildings.types.ts`: `reportId`, `category`, `severity`, `description`, `corroborationCount`, `effect`, `edgeId`, `nodeId`, `createdAt`. Usulkan pendokumentasian bentuk itu di PR kontrak terpisah. Kontrak utama tidak diedit.
3. `code`, `faculty`, dan skor aspek gedung bisa null pada backend; tipe frontend mengakui null. Usulkan nullability tersebut dicatat eksplisit di kontrak.
4. Compare backend menyertakan `reasons` untuk hasil unreachable, tetapi tidak menyertakan durasi dan kesegaran data untuk hasil reachable. Frontend tidak menghitung/mengarang nilai pengganti. Usulkan field opsional itu dijelaskan dalam kontrak.
5. **`nearestReachablePoint` belum dijamin terjangkau.** Implementasi backend masih memakai titik tujuan sebagai pendekatan, termasuk pada ruang yang tidak terjangkau. Modal frontend menyebutnya titik alternatif dari server, menjelaskan keterbatasan, dan tidak membuat rute alternatif palsu. Perlu penelusuran graf per profil sebelum klaim keterjangkauan titik tersebut layak ditampilkan.
6. **Kesegaran agregat belum lengkap.** Backend memakai `MIN(surveyed_at)`, yang mengabaikan null. Rute campuran segmen uji bertanggal dan belum disurvei dapat memiliki tanggal non-null. Frontend menyebut tanggal dari server dan menjelaskan bahwa itu belum membuktikan seluruh segmen sudah disurvei. Usulkan agregat null jika ada segmen belum disurvei atau field kelengkapan survei melalui pembahasan kontrak.
7. Asal dan tujuan yang tersnap pada node sama masih mendapat 422 `no_path_in_graph` dari backend. Frontend mempertahankan hasil server; perlu penanganan rute nol panjang pada layanan routing.
8. Node bernama Lt 3 memiliki `floorLevel=2` (0 = dasar); tampilan daftar memakai penomoran lantai pengguna, sementara pesan alasan backend masih menyebut lantai 2. Perlu menyelaraskan teks backend dengan indeks lantai yang terdokumentasi.

Syarat akhir sebelum menandai seluruh I2 selesai: data survei nyata pilot terverifikasi, keterbatasan routing di atas diselesaikan/disepakati, build backend baseline diperbaiki oleh pemiliknya, uji screen reader dan perangkat/proyektor, serta review dan merge PR ke staging-frontend.

## Pull request

- [Koreksi arah geometri backend #91](https://github.com/AnthonyS051105/unstoppable/pull/91), branch `fix/be-i2-arah-rute`, commit `4e4ca86`.
- Frontend memakai branch `fix/fe-i2-peta-rute`; mencakup commit backend yang sama agar demo lokal utuh. Merge/review #91 terlebih dahulu menghilangkan overlap perubahan backend pada diff frontend.

`docs/` adalah direktori referensi lokal yang diabaikan Git. Laporan sesi ini ditempatkan di root dan bukti visual di `test-evidence/i2/` agar dapat ditinjau melalui PR tanpa mengubah aturan ignore.
