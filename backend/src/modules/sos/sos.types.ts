// Konstanta domain SOS. Nilai enum sinkron dengan prisma/schema.prisma
// (model SosIncident/SosResponse/CaregiverNotification) dan docs/API_CONTRACT.md §14.
// 'caregiver' (B11 §14): keluarga tertaut meminta bantuan relawan atas nama
// lansia ("Minta bantuan relawan"). Kolom trigger_type = TEXT, tanpa CHECK, jadi
// menambah nilai tidak perlu migrasi.
export const SOS_TRIGGER_TYPES = ["manual_button", "voice_command", "dead_man_switch", "caregiver"] as const;
export type SosTriggerType = (typeof SOS_TRIGGER_TYPES)[number];

export const SOS_STATUSES = ["active", "responded", "resolved", "cancelled", "false_alarm"] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];

export const SOS_RESPONSE_STATUSES = ["accepted", "en_route", "arrived", "declined"] as const;
export type SosResponseStatus = (typeof SOS_RESPONSE_STATUSES)[number];

export const SOS_CANCEL_REASONS = ["false_alarm", "resolved_myself", "other"] as const;
export type SosCancelReason = (typeof SOS_CANCEL_REASONS)[number];

// Radius bertingkat untuk pencarian relawan (BE-F-04-1). Dicocokkan terhadap
// VolunteerAvailability.centerPoint + radiusMeters (wilayah layanan relawan),
// BUKAN lokasi GPS real-time relawan -- skema belum menyimpan itu. Kalau tier
// pertama kosong, perbesar radius pencarian sampai tier terakhir.
export const VOLUNTEER_SEARCH_TIERS_M = [1000, 3000, 5000] as const;
