import { api, jsonBody } from '@/lib/api-client';
import type {
  SosTriggerInput,
  SosTriggerResult,
  SosStatusResult,
  SosResponse,
  SosResponseStatus,
} from '@/types/sos';

export const sosApi = {
  trigger: (input: SosTriggerInput) =>
    api<SosTriggerResult>('/sos/trigger', jsonBody(input)),
  cancel: (id: string, reason: string = 'false_alarm') =>
    api<{ status: string }>(`/sos/${encodeURIComponent(id)}/cancel`, jsonBody({ reason })),
  respond: (id: string, responseStatus: SosResponseStatus) =>
    api<SosResponse>(`/sos/${encodeURIComponent(id)}/respond`, jsonBody({ responseStatus })),
  status: (id: string) =>
    api<SosStatusResult>(`/sos/${encodeURIComponent(id)}/status`),
};
