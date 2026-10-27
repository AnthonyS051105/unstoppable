// Demo data until the backend API is wired.
import type { LocationSharingMode } from "@/types/api";

export type ProfileId = "blind" | "low_vision" | "wheelchair" | "crutches";

export const PROFILES: [ProfileId, string, string, string][] = [
  ["blind", "Lansia dengan gangguan penglihatan berat", "eye-off", "Panduan suara dan ubin pemandu membantu menentukan arah."],
  ["low_vision", "Lansia dengan penglihatan menurun", "eye", "Utamakan jalur terang dan petunjuk yang jelas."],
  ["wheelchair", "Lansia pengguna kursi roda", "accessibility", "Jalur landai, cukup lebar, dan tanpa anak tangga."],
  ["crutches", "Lansia dengan walker atau tongkat", "person-standing", "Permukaan stabil, jarak nyaman, dan tempat beristirahat."],
];

export const PROFILE_SHORT: Record<ProfileId, string> = {
  blind: "Penglihatan berat terganggu",
  low_vision: "Penglihatan menurun",
  wheelchair: "Kursi roda",
  crutches: "Walker / tongkat",
};

export const profileName = (id: string) => PROFILES.find((p) => p[0] === id)?.[1] || id;

export const DESTINATIONS = [
  "Puskesmas Mergangsan",
  "Apotek Lingkungan",
  "Posyandu Lansia",
  "Klinik Sehat Lantai 2",
  "Balai Warga Lantai 3",
];

export const STEPS: [string, string, string][] = [
  ["Mulai dari lokasi Anda", "0 m", "map-pin"],
  ["Jalan lurus 80 meter", "80 m", "arrow-up"],
  ["Belok kanan ke Jl. Kolonel Sugiyono", "20 m", "corner-up-right"],
  ["Seberangi zebra cross", "90 m", "person-standing"],
  ["Belok kanan ke Jl. Taman Siswa", "60 m", "corner-up-right"],
  ["Anda tiba di tujuan", "0 m", "flag"],
];

export const CATEGORIES: [string, string][] = [
  ["Guiding block rusak", "footprints"],
  ["Guiding block hilang", "footprints"],
  ["Terhalang", "construction"],
  ["Konstruksi", "traffic-cone"],
  ["Lift rusak", "arrow-up-down"],
  ["Ramp terhalang", "accessibility"],
  ["Permukaan rusak", "route"],
  ["Genangan", "waves"],
  ["Tanpa penyeberangan", "signpost"],
  ["Lainnya", "ellipsis"],
];

export const NEARBY: [string, string, string][] = [
  ["Puskesmas & klinik", "800 m, 18 menit", "hospital"],
  ["Apotek", "450 m, 10 menit", "building-2"],
  ["Toilet aksesibel", "150 m", "accessibility"],
  ["Halte Bus Aksesibel", "300 m", "bus"],
  ["Rest Area Aksesibel", "450 m", "users"],
];

export const destNote = (d: string) => (d.includes("Lantai 3") ? "Lantai 3, tanpa lift" : "Yogyakarta");

export const VOLUNTEERS = [
  {
    id: "rina",
    name: "Rina Safitri",
    rating: "4.9",
    count: 24,
    distance: "320 m",
    available: true,
    message: "Saya bisa membantu memandu jalan dan mendampingi ke tujuan.",
  },
  {
    id: "budi",
    name: "Budi Pratama",
    rating: "4.8",
    count: 12,
    distance: "550 m",
    available: false,
    message: "Saya mengenal jalur lingkungan sekitar dan siap membantu.",
  },
  {
    id: "siti",
    name: "Siti Rahma",
    rating: "4.9",
    count: 19,
    distance: "800 m",
    available: true,
    message: "Saya tersedia untuk pendampingan sesuai waktu yang Anda ajukan.",
  },
];
export type Volunteer = (typeof VOLUNTEERS)[number];
export const AVAILABLE_VOLUNTEERS = VOLUNTEERS.filter((v) => v.available).sort((a, b) => Number(b.rating) - Number(a.rating));
export const volunteerById = (id?: string | null) => VOLUNTEERS.find((v) => v.id === id);

// Location sharing modes (API_CONTRACT §3). One table for onboarding, Privacy, the family
// link screen, and the caregiver dashboard; the system never tracks outside a trip.
export const SHARING_OPTIONS: [LocationSharingMode, string, string][] = [
  ["during_trip", "Selama perjalanan", "Keluarga melihat lokasi Anda sejak berangkat hingga perjalanan selesai."],
  [
    "sos_only",
    "Hanya saat darurat",
    "Lokasi hanya dibagikan saat Anda menekan SOS. Keluarga tetap diberi tahu saat Anda berangkat dan tiba.",
  ],
  ["off", "Tidak berbagi", "Keluarga tidak melihat lokasi dan tidak menerima kabar perjalanan."],
];
export const SHARING_NOTE = "Lokasi tidak pernah dibagikan di luar perjalanan.";
export const sharingOption = (mode: string) => SHARING_OPTIONS.find((o) => o[0] === mode) ?? SHARING_OPTIONS[1];

export type Role = "blind_user" | "mobility_user" | "caregiver" | "volunteer" | "admin";

// "user" is the access-group key for both senior roles (lib/access.ts), not an API role.
export const ROLE_LABEL: Record<string, string> = {
  user: "Lansia",
  blind_user: "Lansia",
  mobility_user: "Lansia",
  caregiver: "Keluarga",
  volunteer: "Relawan",
  admin: "Verifikator",
};

export const ROLE_CHOICES: [Role, string, string, string][] = [
  ["blind_user", "Saya lansia", "Rute sesuai kondisi, laporkan hambatan, SOS, dan pendampingan", "accessibility"],
  ["volunteer", "Saya relawan", "Bantu perjalanan dan validasi data (perlu verifikasi)", "handshake"],
  ["caregiver", "Saya merawat anggota keluarga lansia", "Pantau perjalanan dengan izin pengguna", "shield-check"],
];

export const PAGE_TITLES: Record<string, string> = {
  landing: "Sampai dengan Selamat",
  register: "Daftar akun",
  login: "Masuk",
  otp: "Verifikasi OTP",
  role: "Pilih peran",
  onboarding: "Kenali kondisi Anda (5 langkah)",
  home: "Beranda lansia",
  search: "Pilih tujuan (pencarian di Beranda)",
  loading: "Menghitung rute",
  preview: "Pratinjau rute",
  profile: "Ubah kondisi",
  unreachable: "Tidak terjangkau",
  compare: "Pembanding rute",
  trip: "Perjalanan aktif",
  arrived: "Selesai perjalanan",
  feedback: "Masukan perjalanan",
  report: "Kategori hambatan",
  "report-confirm": "Konfirmasi laporan",
  "report-sent": "Laporan terkirim",
  "my-reports": "Laporan saya",
  assistance: "Minta Pendamping",
  "assistance-form": "Formulir pendampingan",
  "assistance-status": "Status permintaan",
  "volunteer-offers": "Pilih relawan",
  "assistance-detail": "Detail & check-in",
  "assistance-rating": "Rating pendampingan",
  sos: "Tahan SOS",
  "sos-active": "SOS aktif",
  "sos-empty": "SOS tanpa penerima",
  place: "Detail gedung",
  communities: "Daftar komunitas",
  community: "Detail komunitas",
  dashboard: "Dashboard relawan",
  "volunteer-register": "Daftar relawan",
  "volunteer-pending": "Status verifikasi",
  "service-area": "Wilayah layanan",
  "volunteer-requests": "Permintaan terbuka",
  "volunteer-request": "Detail permintaan",
  "volunteer-schedule": "Jadwal & check-in",
  volunteers: "Relawan terdekat",
  editor: "Peta editor",
  topology: "Validasi topologi",
  verification: "Antrean verifikasi",
  review: "Tinjau segmen",
  "volunteer-review": "Verifikasi relawan",
  caregiver: "Keluarga",
  monitor: "Pantau perjalanan",
  "caregiver-link": "Tautkan anggota keluarga",
  settings: "Pengaturan",
  account: "Profil saya",
  privacy: "Privasi & izin",
  "voice-settings": "Bahasa & suara",
  notifications: "Notifikasi",
  "notification-settings": "Pengaturan notifikasi",
  saved: "Rute tersimpan",
  history: "Riwayat perjalanan",
  exports: "Ekspor laporan",
  help: "Bantuan",
};

export const screenTitle = (route: string) => PAGE_TITLES[route];
