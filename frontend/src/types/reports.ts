import type { GeoPoint, NearbyReport } from './api';

export const REPORT_CATEGORIES = [
  { value: 'guiding_block_rusak', label: 'Guiding block rusak', icon: 'footprints' },
  { value: 'guiding_block_hilang', label: 'Guiding block hilang', icon: 'footprints' },
  { value: 'terhalang', label: 'Terhalang', icon: 'construction' },
  { value: 'konstruksi', label: 'Konstruksi', icon: 'traffic-cone' },
  { value: 'lift_rusak', label: 'Lift rusak', icon: 'arrow-up-down' },
  { value: 'ramp_terhalang', label: 'Ramp terhalang', icon: 'accessibility' },
  { value: 'permukaan_rusak', label: 'Permukaan rusak', icon: 'route' },
  { value: 'genangan', label: 'Genangan', icon: 'waves' },
  { value: 'tanpa_penyeberangan', label: 'Tanpa penyeberangan', icon: 'signpost' },
  { value: 'lainnya', label: 'Lainnya', icon: 'ellipsis' },
] as const;
export const REPORT_SEVERITIES = [
  { value: 'low', label: 'Ringan' }, { value: 'medium', label: 'Sedang' }, { value: 'high', label: 'Tinggi' },
] as const;
export type ReportCategory = typeof REPORT_CATEGORIES[number]['value'];
export type ReportSeverity = typeof REPORT_SEVERITIES[number]['value'];
export type ReportStatus = 'active' | 'resolved' | 'rejected' | 'expired';
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  active: 'Aktif', resolved: 'Selesai', rejected: 'Ditolak', expired: 'Kedaluwarsa',
};
export const REPORT_EFFECT_LABEL = { block: 'Memblokir jalur', degrade: 'Menambah penalti rute', info: 'Informasi jalur' } as const;
export type CreateReport = { location: GeoPoint; category: ReportCategory; severity: ReportSeverity; description?: string; edgeId?: string };
export type CreatedReport = {
  id: string; category: ReportCategory; severity: ReportSeverity; status: ReportStatus;
  corroborationCount: number; expiresAt: string | null; createdAt: string; photoUrls: string[]; linkedEdgeId: string | null;
};
export type RoadReport = Omit<NearbyReport, 'category' | 'severity' | 'status'> & {
  category: ReportCategory; severity: ReportSeverity; status: ReportStatus;
};
export type AlongRouteReport = Pick<RoadReport, 'id' | 'category' | 'severity' | 'status' | 'createdAt'> & {
  edgeId: string; effect: keyof typeof REPORT_EFFECT_LABEL;
};
export const categoryLabel = (value: string) => REPORT_CATEGORIES.find(c => c.value === value)?.label ?? value;
export const severityLabel = (value: string) => REPORT_SEVERITIES.find(s => s.value === value)?.label ?? value;
