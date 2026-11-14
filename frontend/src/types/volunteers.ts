import type { GeoPoint, MeVolunteerProfile } from './api';

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
