export type SosTriggerType = 'manual_button' | 'voice_command' | 'dead_man_switch' | 'caregiver';
export type SosIncidentStatus = 'active' | 'responded' | 'resolved' | 'cancelled' | 'false_alarm';
export type SosResponseStatus = 'accepted' | 'en_route' | 'arrived' | 'declined';
export type SosCancelReason = 'false_alarm' | 'resolved_myself' | 'other';

export type SosGeoPoint = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

export type SosTriggerInput = {
  sessionId?: string | null;
  triggerType: SosTriggerType;
  location?: SosGeoPoint;
  audioRecordingUrl?: string;
  onBehalfOfUserId?: string;
};

export type SosTriggerResult = {
  sosId: string;
  notifiedVolunteers: number;
  notifiedCaregivers: number;
  status: SosIncidentStatus;
};

export type SosCancelInput = {
  reason?: SosCancelReason;
};

export type SosResponder = {
  id: string;
  name: string | null;
  status: SosResponseStatus;
  respondedAt: string;
  distanceM: number | null;
  etaMin: number | null;
};

export type SosStatusResult = {
  id: string;
  status: SosIncidentStatus;
  escalationLevel: number;
  createdAt: string;
  resolvedAt: string | null;
  responders: SosResponder[];
};

export type SosResponse = {
  id: string;
  sosId: string;
  volunteerId: string;
  responseStatus: SosResponseStatus;
  respondedAt: string;
};

export type SosNewBroadcast = {
  sosId: string;
  user: {
    id: string;
    name: string | null;
  };
  coordinates: [number, number];
  distanceM: number;
  triggerType: string;
};

export type SosUpdateBroadcast = {
  sosId: string;
  status: SosIncidentStatus;
  escalationLevel: number;
  responders: SosResponder[];
};

export type SosResolvedBroadcast = {
  sosId: string;
  resolvedAt: string;
};
