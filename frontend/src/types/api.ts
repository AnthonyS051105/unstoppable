// Types mirrored from docs/API_CONTRACT.md (v1.4.2). Only the shapes the
// frontend consumes are listed; add new ones per integration wave (I2+), never `any`.

// §1.1 Envelope
export type PageMeta = { page: number; perPage: number; total: number; totalPages: number };
export type ApiErrorBody = { code: ApiErrorCode | (string & {}); message: string; details?: unknown };
export type Envelope<T> = { success: true; data: T; meta?: PageMeta } | { success: false; error: ApiErrorBody };

// §1.5 — "NETWORK" is client-only (fetch failed before any response).
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "NOT_VERIFIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVITE_EXPIRED"
  | "ROUTE_UNREACHABLE"
  | "VOLUNTEER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SPEECH_UNAVAILABLE"
  | "GEOCODER_UNAVAILABLE"
  | "NETWORK";

/** Per-field detail of 400 VALIDATION_ERROR as sent by middleware/validate.ts. */
export type FieldError = { field: string; message: string };

// §1.2 Coordinates: always [lng, lat]. Convert for Leaflet only in lib/geo.ts.
export type LngLat = [number, number];
export type GeoPoint = { type: "Point"; coordinates: LngLat };
export type GeoLineString = { type: "LineString"; coordinates: LngLat[] };

// §2 Auth
export type ApiRole = "blind_user" | "mobility_user" | "caregiver" | "volunteer" | "admin";
export type RegisterRole = Exclude<ApiRole, "admin">;
export type RegisterRequest = { phoneNumber: string; name: string; role: RegisterRole; password: string };
export type RegisterResult = { userId: string; otpSentTo: string; expiresInSec: number };
export type AuthUser = { id: string; name: string; role: ApiRole; phoneVerified: boolean };
export type AuthResult = { accessToken: string; refreshToken: string; user: AuthUser };
export type TokenPair = { accessToken: string; refreshToken: string };

// §4 Accessibility profiles
export type ProfileId = "blind" | "low_vision" | "wheelchair" | "crutches";
export type AccessibilityProfile = {
  id: ProfileId;
  label: string;
  primaryChannel: "audio" | "visual";
  displayOrder: number;
};
export type ToleranceOverrides = {
  max_steps?: number;
  max_slope_percent?: number;
  min_width_cm?: number;
  avoid_uncovered?: boolean;
};
export type UserAccessibilityProfile = {
  profileId: ProfileId;
  label: string;
  isPrimary: boolean;
  toleranceOverrides: ToleranceOverrides | null;
};
export type AccessibilitySelection = { profileId: ProfileId; isPrimary: boolean; toleranceOverrides?: ToleranceOverrides };

// §3 Users
export type VolunteerVerificationStatus = "pending" | "verified" | "rejected";
export type MeVolunteerProfile = {
  verificationStatus: VolunteerVerificationStatus;
  canCompanion: boolean;
  canMapData: boolean;
  ratingAvg: number;
  totalHelps: number;
  isActive: boolean;
};
export type MeBlindProfile = {
  ttsSpeedPercent: number;
  ttsVoiceLang: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  onboardingCompleted: boolean;
  motionCalibrationData: Record<string, unknown> | null;
};
export type Me = {
  id: string;
  name: string;
  phoneNumber: string;
  role: ApiRole;
  profilePhotoUrl: string | null;
  accessibilityProfiles: UserAccessibilityProfile[];
  volunteerProfile: MeVolunteerProfile | null;
  blindProfile: MeBlindProfile | null;
};
export type PatchMeRequest = Partial<{ name: string; profilePhotoUrl: string | null; blindProfile: Partial<MeBlindProfile> }>;

export type LocationSharingMode = "during_trip" | "sos_only" | "off";
export type RelationshipType = "primary" | "secondary";
export type CaregiverLink = {
  id: string;
  relationshipType: RelationshipType;
  locationSharingMode: LocationSharingMode;
  createdAt: string;
  caregiver: { id: string; name: string; phoneNumber: string };
};

// §16 Health — flat shape, no envelope, served outside /api.
export type Health = { status: "ok"; db: "ok" | "down"; speech: "ok" | "down"; uptimeSec: number; version: string };
