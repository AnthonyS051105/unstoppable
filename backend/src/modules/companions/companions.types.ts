export const ASSISTANCE_TYPES = [
  "memandu_jalan",
  "bantu_kursi_roda",
  "bacakan_informasi",
  "dampingi_acara",
] as const;

// String persis seperti komentar schema.prisma. assertCanViewLocation (rbac.ts)
// bergantung pada "confirmed", jadi jangan buat varian lain.
export const REQUEST_STATUS = {
  invited: "invited",
  inviteDeclined: "invite_declined",
  inviteExpired: "invite_expired",
  open: "open",
  confirmed: "confirmed",
  completed: "completed",
  cancelled: "cancelled",
  expired: "expired",
} as const;

// Status yang masih bisa dibatalkan atau dikedaluwarsakan oleh pemilik permintaan.
export const PENDING_STATUSES = [
  REQUEST_STATUS.invited,
  REQUEST_STATUS.inviteDeclined,
  REQUEST_STATUS.inviteExpired,
  REQUEST_STATUS.open,
] as const;

export const OFFER_STATUS = {
  offered: "offered",
  selected: "selected",
  notSelected: "not_selected",
} as const;

export const CHECKIN_TYPES = ["meet", "complete"] as const;

export const DEFAULT_DURATION_MIN = 60;
