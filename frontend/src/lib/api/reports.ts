import { api, apiPaged, publicApi, ApiError } from '@/lib/api-client';
import type { LngLat } from '@/types/api';
import { REPORT_CATEGORIES, REPORT_SEVERITIES, type AlongRouteReport, type RoadReport, type CreateReport, type CreatedReport, type OwnReport } from '@/types/reports';

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

export function createReportData({ point, category, severity, description }: {
  point: LngLat | null; category: string; severity: string; description: string;
}): CreateReport {
  if (!point || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
    throw new ApiError('VALIDATION_ERROR', 'Pilih lokasi hambatan terlebih dahulu.', 400);
  }
  const text = description.trim();
  if (text.length > 1000) throw new ApiError('VALIDATION_ERROR', 'Deskripsi maksimal 1.000 karakter.', 400);
  return { location: { type: 'Point', coordinates: point }, category: reportCategory(category), severity: reportSeverity(severity), ...(text ? { description: text } : {}) };
}

export function validateReportPhotos(photos: File[]) {
  if (photos.length > 3) throw new ApiError('VALIDATION_ERROR', 'Maksimal 3 foto per laporan.', 400);
  if (photos.some(p => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(p.type))) {
    throw new ApiError('VALIDATION_ERROR', 'Pilih foto JPEG, PNG, WebP, atau GIF.', 400);
  }
  if (photos.some(p => p.size > 5 * 1024 * 1024 || p.size === 0)) {
    throw new ApiError('VALIDATION_ERROR', 'Ukuran setiap foto harus lebih dari 0 dan maksimal 5 MB.', 400);
  }
}

export const reportsApi = {
  create: async (input: CreateReport, photos: File[], signal?: AbortSignal): Promise<CreatedReport> => {
    validateReportPhotos(photos);
    const body = new FormData();
    body.append('data', JSON.stringify(input));
    photos.forEach(photo => body.append('photos', photo));
    const report = await api<CreatedReport>('/reports', { method: 'POST', body, signal });
    if (!report?.id || !Array.isArray(report.photoUrls) || !['active', 'resolved', 'rejected', 'expired'].includes(report.status)) {
      throw new ApiError('INTERNAL_ERROR', 'Konfirmasi laporan dari server belum lengkap.', 502);
    }
    return report;
  },
  mine: (page = 1, signal?: AbortSignal) => apiPaged<OwnReport[]>(`/reports/mine?${new URLSearchParams({ page: String(page), limit: '20' })}`, { signal, cache: 'no-store' }),
  nearby: (point: LngLat, signal?: AbortSignal) => publicApi<RoadReport[]>(
    `/reports/nearby?${new URLSearchParams({ lng: String(point[0]), lat: String(point[1]), radiusM: '1000', status: 'active' })}`,
    { signal, cache: 'no-store' },
  ),
  alongRoute: (edgeIds: string[], signal?: AbortSignal): Promise<AlongRouteReport[]> => edgeIds.length
    ? publicApi<AlongRouteReport[]>(`/reports/along-route?${new URLSearchParams({ edgeIds: edgeIds.join(',') })}`, { signal, cache: 'no-store' })
    : Promise.resolve([]),
  corroborate: (reportId: string) => api<{ corroborationCount: number }>(`/reports/${encodeURIComponent(reportId)}/corroborate`, { method: 'POST' }),
};
