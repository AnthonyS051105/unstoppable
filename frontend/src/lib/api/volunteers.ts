import { api, ApiError, jsonBody } from '@/lib/api-client';
import type { CreateVolunteerAvailability, VolunteerApplication, VolunteerAvailability, VolunteerProfile } from '@/types/volunteers';

export const volunteersApi = {
  profile: async (): Promise<VolunteerProfile | null> => {
    try {
      return await api<VolunteerProfile>('/volunteers/me');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && e.code === 'NOT_FOUND') return null;
      throw e;
    }
  },
  apply: ({ motivation, idCardUrl, serviceAreaNote }: VolunteerApplication) =>
    api<VolunteerProfile>('/volunteers/apply', jsonBody({ motivation, idCardUrl, ...(serviceAreaNote ? { serviceAreaNote } : {}) })),
  setActive: (isActive: boolean) => api<VolunteerProfile>('/volunteers/me', { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  availability: () => api<VolunteerAvailability[]>('/volunteers/availability'),
  addAvailability: (slot: CreateVolunteerAvailability) => api<VolunteerAvailability>('/volunteers/availability', jsonBody(slot)),
  removeAvailability: (id: string) => api<void>(`/volunteers/availability/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Mirrors requireCapability('canCompanion'); isActive controls new requests separately. */
export const canOfferCompanion = (role: string | undefined, profile: VolunteerProfile | null | undefined) =>
  role === 'volunteer' && profile?.verificationStatus === 'verified' && profile.canCompanion;
