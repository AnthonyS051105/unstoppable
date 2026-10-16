# Unstoppable — Frontend

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Leaflet/OpenStreetMap.
Implementasi React dari desain final v6 (lansia & keluarga).

```bash
npm install
npm run dev            # http://localhost:3000
npm run build && npm start
npm run lint
npx prettier --write "src/**/*.{ts,tsx,css}"   # format (konfigurasi: .prettierrc.json)
```

Variabel opsional (`.env.local`):

| Variabel | Default | Fungsi |
|---|---|---|
| `NEXT_PUBLIC_MAP_TILE_URL` | tile OpenStreetMap | Sumber tile peta |
| `NEXT_PUBLIC_GEOCODER_URL` | `https://photon.komoot.io` | Pencarian alamat (Photon / proxy backend `GET /geocode/*`) |

OTP demo: `123456`. Rute, relawan, SOS, keluarga, dan graf editor masih **simulasi lokal** di
`localStorage` (`unstoppable-demo-v1`); belum terhubung ke backend.

## Struktur

```
src/
├── app/                         Rute (App Router)
│   ├── page.tsx                 Landing (Server Component, HTML statis)
│   ├── (auth)/                  login, register, otp, role, onboarding
│   ├── (app)/layout.tsx         AppShell: sidebar, topbar + pencarian, SOS, bottom nav
│   │   ├── (user)/              home, search, place, preview, trip, report*, assistance*, sos*, compare, …
│   │   ├── (volunteer)/         dashboard, service-area, volunteer-*
│   │   ├── (mapper)/            editor, topology, verification, review, volunteer-review
│   │   ├── (caregiver)/         caregiver, monitor, caregiver-link
│   │   └── (account)/           settings, account, privacy, voice-settings, notifications, saved, history, help, exports
│   ├── globals.css              Satu-satunya stylesheet: Tailwind + token DS + design system
│   ├── layout.tsx, providers.tsx, not-found.tsx
├── screens/                     Isi layar per domain (journey, report, companion, sos, places, …)
├── components/
│   ├── ui/                      Primitif DS: Icon (subset Lucide), Btn, LinkBtn, Badge, Field, FileInput
│   ├── shell/                   AppShell, SearchCombobox, SosHoldButton, RouteSync
│   ├── map/                     MapStage (sheet/panel), MapFrame, LeafletMap, RequestPointsMap, map-data
│   ├── location/                LocationPicker + LocationConfirmMap (pemilih alamat)
│   └── shared.tsx               Heading, ProfileChoices, RouteSummary, FamilyStatus, CommunityCta, …
├── contexts/                    DemoState, Ui (toast, live region, dialog, skip link), Voice (STT/TTS)
├── hooks/                       useApp (aksi bersama), useMediaQuery, useOverlayAlign
├── lib/                         access (peran & izin), data, demo-state, places, geo, geocode, speech, …
└── assets/                      Semua aset, dibundel dengan hash (cache 1 tahun, immutable)
    ├── images/                  Ilustrasi + logo (AVIF), favicon (PNG); URL-nya di images/index.ts
    └── fonts/                   Inter Variable subset latin (woff2) + lisensi
```

## Styling

- `src/app/globals.css` adalah satu-satunya file CSS. Bagian atas: konfigurasi Tailwind dan token DS.
  Bagian bawah (`@layer components`): desain v6 dalam urutan cascade aslinya (bagian 1–6), lalu revisi
  produk setelah v6 (bagian 7–8). Urutan bagian **jangan diubah**: bagian akhir sengaja menimpa bagian
  awal (mode teks besar, kontras tinggi, map-first).
- Token DS tersedia sebagai utility Tailwind (`bg-yellow`,
  `text-ink`, `rounded-card`, `shadow-panel`, …); palet bawaan Tailwind dimatikan.
- Preflight Tailwind tidak dipakai, dan nama kelas DS dikecualikan dari pemindaian Tailwind
  (`@source not inline` di `globals.css`) agar utility seperti `.list-item`/`.border` tidak menimpa DS.
  Kalau menambah kelas DS baru, tambahkan juga ke daftar itu.

## Peta & lokasi

- Leaflet dimuat dinamis (`ssr:false`). Konversi `[lng, lat]` ↔ `[lat, lng]` hanya di `src/lib/geo.ts`.
- Geometri rute, pin, dan graf editor adalah **data demonstrasi** v6, ditempatkan di sekitar Puskesmas
  Mergangsan. Sumber peta dan status data ditampilkan lewat tombol ⓘ di setiap peta.
- Semua input lokasi memakai `LocationPicker`: cari alamat (OSM/Photon), lokasi saat ini, alamat
  tersimpan, lalu ketuk peta atau seret pin untuk menentukan titik.

## Aset

Tambahkan gambar ke `src/assets/images/` lalu daftarkan URL-nya di `src/assets/images/index.ts`
(`new URL("./nama.avif", import.meta.url).href`). Gunakan AVIF dengan lebar maksimal 2× ukuran tampil;
PNG hanya untuk favicon. Folder `public/` sengaja tidak dipakai: file di sana tidak di-hash sehingga
browser harus memvalidasi ulang ke server di setiap kunjungan.

## Performa

Ilustrasi AVIF diperkecil ke ukuran tampil maksimum ×2 (hero 1586 px, ilustrasi 1100 px, logo 176 px),
font Inter di-subset latin (≈100 KB), ikon Lucide hanya yang dipakai, landing dirender statis di
server, dan Leaflet hanya diunduh di halaman yang memakai peta.
