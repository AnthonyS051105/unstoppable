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
/** Answers to the wellbeing push (§13): arrived ends the session, ok snoozes 15 minutes, help is a normal SOS. */
export type WellbeingStatus = "arrived" | "ok" | "help";

// §18 Web Push
export type PushPublicKey = { publicKey: string };
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

// §18 Notifications
export type NotificationType = "session" | "companion" | "sos" | "community" | "trip";
export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};
/** `sos` has no key: SOS alerts cannot be turned off (§18). */
export type NotificationPreferences = { companion: boolean; session: boolean; community: boolean; trip: boolean };
export type NotificationPreferenceKey = keyof NotificationPreferences;

// §19 Planned trips. The backend also returns destination, profileId and (for family) userId.
export type PlannedTripStatus = "planned" | "started" | "missed" | "cancelled";
export type PlannedTrip = {
  id: string;
  destinationName: string;
  departAt: string;
  status: PlannedTripStatus;
  companionRequestId: string | null;
  sessionId: string | null;
  destination?: GeoPoint;
  profileId?: string | null;
  userId?: string;
};
export type CreatePlannedTrip = {
  destinationName: string;
  destination: GeoPoint;
  departAt: string;
  profileId?: string;
  forUserId?: string;
};
/** trip:reminder (§15.4), 15 minutes before departAt. */
export type TripReminder = { plannedTripId: string; destinationName: string; departAt: string };
/** trip:not-started, 30 minutes after departAt while still planned. */
export type TripNotStarted = TripReminder & { user: { id: string; name: string } };

// §11, §12 Companion service (direct invitations: §12.1)
export type AssistanceType = "memandu_jalan" | "bantu_kursi_roda" | "bacakan_informasi" | "dampingi_acara";
export type CompanionStatus =
  | "invited"
  | "invite_declined"
  | "invite_expired"
  | "open"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "expired";
export type PersonRef = { id: string; name: string };
/** GET /companions/requests (own requests). */
export type CompanionRequest = {
  id: string;
  destinationName: string;
  scheduledStart: string;
  status: CompanionStatus;
  offerCount: number;
  selectedVolunteer: PersonRef | null;
  invitedVolunteer: PersonRef | null;
  inviteExpiresAt: string | null;
  checkins: { requester: boolean; volunteer: boolean };
};
export type CreateCompanionRequest = {
  destinationName: string;
  destinationLocation: GeoPoint;
  meetingPointLocation: GeoPoint;
  meetingPointNote?: string;
  scheduledStart: string;
  estimatedDurationMin: number;
  assistanceTypes: AssistanceType[];
  notes?: string;
  invitedVolunteerId?: string;
};
/** GET /volunteers/available — no phone number or exact location. */
export type AvailableVolunteer = {
  id: string;
  name: string;
  ratingAvg: number;
  totalHelps: number;
  distanceM: number;
  verificationStatus: VolunteerVerificationStatus;
};
export type CompanionOffer = {
  offerId: string;
  volunteer: { id: string; name: string; ratingAvg: number; totalHelps: number; verificationStatus: VolunteerVerificationStatus | null };
  message: string | null;
  createdAt: string;
};
/** GET /companions/invites — first name of the requester only, no contact or location (§12.1). */
export type CompanionInvite = {
  id: string;
  destinationName: string;
  scheduledStart: string;
  estimatedDurationMin: number | null;
  assistanceTypes: AssistanceType[];
  inviteExpiresAt: string;
  requester: { name: string };
};
/** companion:invite (§15.3). */
export type CompanionInviteEvent = {
  requestId: string;
  requester: { name: string };
  destinationName: string;
  scheduledStart: string;
  inviteExpiresAt: string;
};
export type CompanionInviteAnswerEvent = { requestId: string; volunteer: PersonRef; reason?: string };

// §5 Routes, §7 graph nodes, §10 buildings
export type Building = {
  id: string;
  name: string;
  code: string;
  faculty: string;
  location: GeoPoint;
  floorCount: number;
  hasLift: boolean;
  hasAccessibleToilet: boolean;
  surveyedAt: string | null;
  accessibilityScore: number | null;
  scoreBreakdown: Record<string, { score: number; note: string }> | null;
};
export type GraphNodeDto = { id: string; nodeType: string; name: string | null; location: GeoPoint; status: string };
export type RouteStep = {
  order: number;
  edgeId: string;
  instruction: string;
  distanceM: number;
  warnings?: { type: string; severity: string; message: string }[];
};
export type RouteBarrier = { edgeId: string; message: string; category?: string; severity?: string };
export type RouteResult = {
  reachable: boolean;
  profileId: ProfileId;
  totalDistanceM: number;
  estimatedDurationMin?: number;
  edgeIds: string[];
  geometry: { type: "LineString"; coordinates: LngLat[] };
  steps: RouteStep[];
  barriers: RouteBarrier[];
  dataFreshness?: { surveyedAt: string | null };
};
export type CompareResult = { profileId: ProfileId; label: string; reachable: boolean } & Partial<Omit<RouteResult, "reachable" | "profileId">>;
export type CompareResponse = {
  results: CompareResult[];
  differences: { type: string; reason: string; profileId?: ProfileId; avoidedByProfileId?: ProfileId }[];
};
export type UnreachableDetails = { reasons?: { type: string; message: string }[]; nearestReachablePoint?: GeoPoint; suggestion?: string };

// §20 Communities
export type CommunityRole = "member" | "moderator";
export type Community = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  memberCount: number;
  /** List only. */
  joined?: boolean;
  distanceM?: number;
  /** Detail only: null when the user has not joined. */
  myRole?: CommunityRole | null;
};
export type CommunityPost = { id: string; title: string | null; body: string; author: { name: string }; createdAt: string; isMine: boolean };
export type CommunityEvent = { id: string; title: string; description: string | null; startsAt: string; locationNote: string | null; location: GeoPoint | null };
export type CreateCommunityEvent = { title: string; description?: string; startsAt: string; locationNote?: string };
/** Same shape as GET /reports/nearby (§9). */
export type NearbyReport = {
  id: string;
  category: string;
  severity: string;
  status: string;
  description: string | null;
  corroborationCount: number;
  distanceM: number;
  location: GeoPoint;
  createdAt: string;
};
export type CommunityEventNotice = { communityId: string; eventId: string; title: string; startsAt: string; cancelledAt?: string };
