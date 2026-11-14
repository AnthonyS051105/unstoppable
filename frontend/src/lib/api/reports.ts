import { api, publicApi } from '@/lib/api-client';
import type { LngLat } from '@/types/api';
import { REPORT_CATEGORIES, REPORT_SEVERITIES, type AlongRouteReport, type RoadReport } from '@/types/reports';

export function reportCategory(label: string) {
  const option = REPORT_CATEGORIES.find(c => c.label === label);
  if (!option) throw new Error('Pilih kategori hambatan yang tersedia.');
  return option.value;
}
export function reportSeverity(label: string) {
  const option = REPORT_SEVERITIES.find(s => s.label === label);
  if (!option) throw new Error('Pilih tingkat keparahan hambatan.');
  return option.value;
}

export const reportsApi = {
  nearby: (point: LngLat, signal?: AbortSignal) => publicApi<RoadReport[]>(
    `/reports/nearby?${new URLSearchParams({ lng: String(point[0]), lat: String(point[1]), radiusM: '1000', status: 'active' })}`,
    { signal, cache: 'no-store' },
  ),
  alongRoute: (edgeIds: string[], signal?: AbortSignal): Promise<AlongRouteReport[]> => edgeIds.length
    ? publicApi<AlongRouteReport[]>(`/reports/along-route?${new URLSearchParams({ edgeIds: edgeIds.join(',') })}`, { signal, cache: 'no-store' })
    : Promise.resolve([]),
  corroborate: (reportId: string) => api<{ corroborationCount: number }>(`/reports/${encodeURIComponent(reportId)}/corroborate`, { method: 'POST' }),
};
