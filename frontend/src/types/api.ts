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
/** GET /users/me/dependents — the REST counterpart of the session:* events (§3, §15.4). */
export type DependentSession = {
  id: string;
  status: "active";
  destinationName: string | null;
  startedAt: string;
  estimatedArrival: string | null;
  lastPingAt: string | null;
  /** Set while the senior's app is hidden or the screen is locked: shown as information, never as an alarm. */
  pausedAt: string | null;
};
export type Dependent = {
  userId: string;
  name: string;
  phoneNumber: string;
  relationshipType: RelationshipType;
  locationSharingMode: LocationSharingMode;
  activeSession: DependentSession | null;
};

// §13 Travel sessions
/** 5 = sesuai dan nyaman · 3 = ada hambatan kecil · 1 = perlu diperbaiki. */
export type FeedbackRating = 1 | 3 | 5;
export type FeedbackResult = { sessionId: string; rating: FeedbackRating };
export type SessionStatus = "active" | "completed" | "cancelled" | "sos_triggered";
export type SessionEndedReason = "user" | "arrived_auto" | "timeout" | "replaced" | "sos";
/** Fields of GET /sessions/:id/summary the client reads. */
export type SessionSummary = { id: string; status: SessionStatus; destinationName: string | null; durationMin: number; distanceM: number };
export type ArrivalResult = { status: SessionStatus; endedReason?: SessionEndedReason | null; arrivalSnoozeUntil?: string };
// §15.3 socket payloads
export type ArrivalCheck = { sessionId: string; destinationName: string; autoEndAt: string };
export type SessionEnded = {
  sessionId: string;
  user: { id: string; name: string };
  destinationName: string | null;
  status: SessionStatus;
  endedReason: SessionEndedReason | null;
  endedAt: string;
};
// `user` is optional on overdue/stalled: the contract lists it, but match on sessionId first.
export type SessionStarted = {
  sessionId: string;
  user: { id: string; name: string };
  destinationName: string | null;
  startedAt: string;
  estimatedArrival: string | null;
};
export type SessionOverdue = { sessionId: string; user?: { id: string; name: string }; destinationName: string | null; estimatedArrival: string | null };
export type SessionStalled = { sessionId: string; user?: { id: string; name: string }; reason: "app_hidden" | "no_signal"; lastSeenAt: string | null };

// §14 SOS
export type SosTriggerResult = { sosId: string; notifiedVolunteers: number; notifiedCaregivers: number; status: string };

// §17 Geocoding
export type GeocodeResult = { name: string; address: string; location: GeoPoint };

// §16 Health — flat shape, no envelope, served outside /api.
export type Health = { status: "ok"; db: "ok" | "down"; speech: "ok" | "down"; uptimeSec: number; version: string };
