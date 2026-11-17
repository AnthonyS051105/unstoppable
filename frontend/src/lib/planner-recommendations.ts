import type {
  AvailableVolunteer,
  GeoPoint,
  ProfileId,
  RouteResult,
  UnreachableDetails,
} from "@/types/api";
import type { LocationValue } from "./geocode";

export type PlanRouteStatus = "idle" | "planning" | "ok" | "unreachable" | "error";

export interface PlanAssessmentInput {
  destinationName: string;
  destinationLocation: GeoPoint;
  matchSource: "preference" | "building" | "node" | "manual" | null;
  profileId: ProfileId;
  plannedTime?: string | null;
  contextNotes?: string | null;
  routeStatus: PlanRouteStatus;
  route?: RouteResult | null;
  unreachable?: { message: string; details?: UnreachableDetails } | null;
  surveyedAt?: string | null;
  volunteers?: AvailableVolunteer[];
}

export interface PlanAssessment {
  destinationName: string;
  matchSourceLabel: string;
  transitSupported: false;
  transitNotice: string;
  plannedTimeWib: string | null;
  plannedTimeDisclaimer: string | null;
  pedestrianSummary: {
    status: PlanRouteStatus;
    distanceM: number | null;
    durationMin: number | null;
    barrierCount: number;
    barrierMessages: string[];
    surveyedAtLabel: string | null;
    unreachableReasons: string[];
    hasNearestReachablePoint: boolean;
  };
  companionRecommended: boolean;
  companionReasons: string[];
  verifiedVolunteers: AvailableVolunteer[];
  canStartPedestrianTrip: boolean;
}

const MATCH_SOURCE_LABEL: Record<NonNullable<PlanAssessmentInput["matchSource"]>, string> = {
  preference: "Riwayat tujuan tersimpan",
  building: "Data gedung kampus",
  node: "Titik jalur terdata",
  manual: "Pilihan manual pengguna",
};

const COMPANION_CONTEXT_RE =
  /\b(pendamping|relawan|bantuan|teman|dampingi|memandu|kursi roda|lelah|gelap|malam|lansia)\b/i;

export function formatWibClock(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (
    new Date(ms).toLocaleTimeString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

/** Builds a reviewable trip assessment purely from verified graph, coverage, profile, and volunteer inputs. */
export function buildPlanAssessment(input: PlanAssessmentInput): PlanAssessment {
  const route = input.routeStatus === "ok" ? input.route ?? null : null;
  const barriers = route?.barriers ?? [];
  const surveyedAtLabel = route?.dataFreshness?.surveyedAt ?? input.surveyedAt ?? null;
  const unreachableReasons = (input.unreachable?.details?.reasons ?? []).map((r) => r.message).filter(Boolean);
  if (input.routeStatus === "unreachable" && !unreachableReasons.length && input.unreachable?.message) {
    unreachableReasons.push(input.unreachable.message);
  }

  const companionReasons: string[] = [];
  if (input.routeStatus === "unreachable") {
    companionReasons.push("Rute pejalan kaki belum dapat dijangkau sepenuhnya untuk profil Anda.");
  }
  if (barriers.length > 0) {
    companionReasons.push(`Terdapat ${barriers.length} laporan hambatan di jalur ini.`);
  }
  if (input.routeStatus === "ok" && !surveyedAtLabel) {
    companionReasons.push("Sebagian jalur atau tujuan belum memiliki tanggal survei aksesibilitas terbaru.");
  }
  if (input.contextNotes && COMPANION_CONTEXT_RE.test(input.contextNotes)) {
    companionReasons.push("Catatan perjalanan Anda menyebut kebutuhan pendampingan atau bantuan khusus.");
  }

  const verifiedVolunteers = (input.volunteers ?? []).filter(
    (v) => v.verificationStatus === "verified",
  );
  const plannedTimeWib = formatWibClock(input.plannedTime);

  return {
    destinationName: input.destinationName,
    matchSourceLabel: input.matchSource ? MATCH_SOURCE_LABEL[input.matchSource] : "Pencarian tujuan",
    transitSupported: false,
    transitNotice:
      "Integrasi transportasi umum (halte, rute bus, dan jadwal) belum terhubung ke penyedia transit. Rute yang dihitung hanya mencakup jalur pejalan kaki terverifikasi.",
    plannedTimeWib,
    plannedTimeDisclaimer: plannedTimeWib
      ? "Waktu ini adalah rencana keberangkatan Anda, bukan jadwal transportasi umum."
      : null,
    pedestrianSummary: {
      status: input.routeStatus,
      distanceM: route ? Math.round(route.totalDistanceM) : null,
      durationMin: route?.estimatedDurationMin ?? null,
      barrierCount: barriers.length,
      barrierMessages: barriers.map((b) => b.message).filter(Boolean),
      surveyedAtLabel,
      unreachableReasons,
      hasNearestReachablePoint: Boolean(input.unreachable?.details?.nearestReachablePoint),
    },
    companionRecommended: companionReasons.length > 0,
    companionReasons,
    verifiedVolunteers,
    canStartPedestrianTrip: Boolean(
      input.routeStatus === "ok" && route && route.reachable && route.edgeIds.length > 0,
    ),
  };
}

/** Builds a safe prefill object for AssistanceFormScreen without creating or broadcasting any booking. */
export function buildAssistancePrefill(params: {
  destinationName: string;
  destinationLocation: GeoPoint;
  address?: string;
  contextNotes?: string | null;
}): LocationValue {
  return {
    name: params.destinationName,
    address: params.address || "Yogyakarta",
    coord: params.destinationLocation.coordinates,
    note: params.contextNotes?.trim() || undefined,
    source: "place",
  };
}

export function assistanceInviteHref(volunteer?: Pick<AvailableVolunteer, "id" | "name"> | null): string {
  if (!volunteer) return "assistance-form";
  return `assistance-form?${new URLSearchParams({ volunteer: volunteer.id, name: volunteer.name })}`;
}

export function shouldUseManualFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { status?: unknown; code?: unknown; details?: unknown };
  const status = typeof err.status === "number" ? err.status : 0;
  const code = typeof err.code === "string" ? err.code : "";
  const details = err.details && typeof err.details === "object" ? (err.details as { fallback?: unknown }) : null;
  return (
    details?.fallback === "manual_destination" ||
    status === 503 ||
    status === 502 ||
    status === 401 ||
    code === "INTERNAL_ERROR" ||
    code === "NETWORK" ||
    code === "UNAUTHENTICATED"
  );
}
