import type { AssistanceType, GeoPoint, MeVolunteerProfile } from './api';

export type VolunteerProfile = MeVolunteerProfile;
export type VolunteerApplication = { motivation: string; idCardUrl: string; serviceAreaNote?: string };
export type CreateVolunteerAvailability = {
  centerPoint: GeoPoint;
  radiusMeters: number;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
};
export type VolunteerAvailability = {
  id: string;
  centerPoint: GeoPoint;
  radiusMeters: number;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
};

/** Existing GET /companions/open DTO; no requester identity before selection. */
export type OpenCompanionRequest = {
  id: string;
  destinationName: string;
  destinationLocation: GeoPoint;
  meetingPointLocation: GeoPoint | null;
  meetingPointNote: string | null;
  scheduledStart: string;
  estimatedDurationMin: number | null;
  assistanceTypes: AssistanceType[];
  notes: string | null;
  status: 'open';
  distanceM: number;
};

export type CompanionAssignment = {
  id: string;
  destinationName: string;
  scheduledStart: string;
  estimatedDurationMin: number | null;
  assistanceTypes: AssistanceType[];
  status: 'confirmed' | 'completed' | 'cancelled';
  requester: { id: string; name: string } | null;
  meetingPointNote: string | null;
  notes: string | null;
  checkins: {
    requester: { meet: boolean; complete: boolean };
    volunteer: { meet: boolean; complete: boolean };
  };
};

export type IdentityUploadResult = {
  idCardUrl: string;
  mimeType: string;
  sizeBytes: number;
};
