// Public building catalogue and aggregate scores (F14, API_DOCS §11).
import { publicApi } from "@/lib/api-client";
import type { Building, BuildingAccessibilityScore, BuildingBarrier, BuildingScoreBreakdown } from "@/types/api";

export const buildingsApi = {
  list: (faculty?: string, signal?: AbortSignal) =>
    publicApi<Building[]>(`/buildings${faculty ? `?faculty=${encodeURIComponent(faculty)}` : ""}`, { signal, cache: "no-store" }),
  get: (id: string, signal?: AbortSignal) =>
    publicApi<Building>(`/buildings/${encodeURIComponent(id)}`, { signal, cache: "no-store" }),
  accessibilityScore: (id: string, signal?: AbortSignal) =>
    publicApi<BuildingAccessibilityScore>(`/buildings/${encodeURIComponent(id)}/accessibility-score`, { signal, cache: "no-store" }),
  barriers: (id: string, signal?: AbortSignal) =>
    publicApi<BuildingBarrier[]>(`/buildings/${encodeURIComponent(id)}/barriers`, { signal, cache: "no-store" }),
};

type FacilityStatus = "verified" | "partial" | "unmet" | "unverified";
export type FacilityScoreItem = {
  key: string;
  label: string;
  score: number | null;
  status: FacilityStatus;
  statusLabel: string;
  note: string;
  recommendation?: string;
};

const FACILITIES: { key: keyof BuildingScoreBreakdown; label: string; context?: string; recommendation: string }[] = [
  { key: "paths", label: "Guiding block & jalur", context: "Guiding block belum dinilai secara khusus; skor jalur mengukur lebar dan kelandaian.", recommendation: "Survei guiding block dan perbaiki lebar serta kelandaian jalur yang belum memadai." },
  { key: "entrance", label: "Ramp & akses masuk", context: "Ramp belum dinilai secara khusus; skor akses masuk menghitung pintu dengan jalur tanpa tangga.", recommendation: "Evaluasi akses masuk tanpa tangga dan kebutuhan ramp bersama pengelola gedung." },
  { key: "facilities", label: "Toilet ramah lansia / difabel", context: "Data mencatat ketersediaan toilet difabel; kelengkapan untuk lansia perlu diverifikasi di lapangan.", recommendation: "Prioritaskan penyediaan toilet aksesibel dan verifikasi kelengkapannya untuk lansia." },
  { key: "verticalAccess", label: "Lift & akses antarlantai", recommendation: "Tinjau penyediaan lift aksesibel dan jangkauannya ke seluruh lantai." },
];

/** Keep unknown survey aspects null; default building flags are not field evidence. */
export function extractFacilityScores(building: Pick<BuildingAccessibilityScore, "scoreBreakdown">): FacilityScoreItem[] {
  return FACILITIES.map(facility => {
    const aspect = building.scoreBreakdown?.[facility.key];
    const score = aspect?.score ?? null;
    const status: FacilityStatus = score === null ? "unverified" : score === 100 ? "verified" : score === 0 ? "unmet" : "partial";
    return {
      key: facility.key, label: facility.label, score, status,
      statusLabel: status === "unverified" ? "Data belum tersedia" : status === "verified" ? "Aspek terpenuhi" : status === "unmet" ? "Perlu peningkatan" : "Sebagian terpenuhi",
      note: [aspect?.note || "Belum ada data survei untuk aspek ini.", facility.context].filter(Boolean).join(" "),
      recommendation: status !== "verified" && status !== "unverified" ? facility.recommendation : undefined,
    };
  });
}

export function getBuildingAdvocacySummary(building: Pick<BuildingAccessibilityScore, "accessibilityScore" | "scoreBreakdown">): {
  scoreFormatted: string;
  badgeText: string;
  badgeKind: string;
  recommendations: string[];
} {
  const score = building.accessibilityScore;
  const facilities = extractFacilityScores(building);
  const recommendations = facilities.flatMap(f => f.recommendation ? [f.recommendation] : []);
  if (score === null) {
    recommendations.unshift(building.scoreBreakdown ? "Lengkapi survei aspek yang belum memiliki data agar skor agregat dapat dihitung." : "Jadwalkan survei lapangan untuk memetakan fasilitas gedung ini.");
  }
  return {
    scoreFormatted: score === null ? "—" : `${score}/100`,
    badgeText: score === null ? (building.scoreBreakdown ? "Skor belum lengkap" : "Belum disurvei") : score >= 80 ? "Skor tinggi" : score >= 50 ? "Perlu peningkatan" : "Prioritas peningkatan",
    badgeKind: score === null ? "" : score >= 80 ? "green" : score >= 50 ? "yellow" : "red",
    recommendations: recommendations.length ? recommendations : ["Pertahankan fasilitas dan lakukan survei berkala bersama pengguna lansia dan difabel."],
  };
}
