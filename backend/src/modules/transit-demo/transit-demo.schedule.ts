import type { ScheduleLookupResult, TransitCorridorSpec } from "./transit-demo.types.js";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_TZ_RE = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;

export interface WibDateParts {
  dateStr: string; // YYYY-MM-DD in Asia/Jakarta
  hhmm: string;    // HH:MM in Asia/Jakarta
  minutesOfDay: number;
}

/** Parses an ISO string strictly requiring an explicit timezone designator. */
export function parseStrictTimestampMs(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (!ISO_TZ_RE.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/** Formats an epoch timestamp in Asia/Jakarta (UTC+7 fixed offset). */
export function getWibParts(epochMs: number): WibDateParts {
  const shifted = new Date(epochMs + WIB_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  return {
    dateStr: `${year}-${month}-${day}`,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minutesOfDay: hour * 60 + minute,
  };
}

export function formatWibClock(epochMs: number): string {
  return `${getWibParts(epochMs).hhmm} WIB`;
}

export function toWibIso(dateStr: string, minutesOfDay: number): string {
  const clampedMin = ((minutesOfDay % 1440) + 1440) % 1440;
  const hh = String(Math.floor(clampedMin / 60)).padStart(2, "0");
  const mm = String(clampedMin % 60).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:00+07:00`;
}

export function wibClockToEpochMs(dateStr: string, hhmm: string): number | null {
  const match = HHMM_RE.exec(hhmm.trim());
  if (!match) return null;
  const iso = `${dateStr}T${match[1]}:${match[2]}:00+07:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Evaluates feed freshness and looks up the earliest catchable synthetic departure
 * on the same Asia/Jakarta service day as earliestReadyEpochMs.
 * Never invents catchability when timestamps or timetable strings are invalid.
 */
export function lookupCorridorDeparture(params: {
  corridor: TransitCorridorSpec;
  earliestReadyEpochMs: number | null;
  nowEpochMs: number;
  fixtureFallbackLastUpdatedIso?: string;
  fixtureFallbackStaleAfterMinutes?: number;
}): ScheduleLookupResult {
  const { corridor, earliestReadyEpochMs, nowEpochMs } = params;

  const lastUpdatedIso = corridor.lastUpdatedIso || params.fixtureFallbackLastUpdatedIso;
  const lastUpdatedMs = parseStrictTimestampMs(lastUpdatedIso);
  const staleAfterMinutes =
    typeof corridor.staleAfterMinutes === "number" && corridor.staleAfterMinutes > 0
      ? corridor.staleAfterMinutes
      : params.fixtureFallbackStaleAfterMinutes ?? 1440;

  if (lastUpdatedMs === null) {
    return {
      scheduleValid: false,
      isStale: true,
      staleAgeMinutes: null,
      serviceAvailableToday: false,
      catchable: false,
      departureIso: null,
      departureWib: null,
      arrivalIso: null,
      arrivalWib: null,
      waitMinutes: null,
      reason: `Timestamp pembaruan jadwal ${corridor.routeShortName} tidak valid; keberangkatan tidak dapat dijamin.`,
    };
  }

  const staleAgeMinutes = Math.max(0, Math.round((nowEpochMs - lastUpdatedMs) / 60_000));
  const isStale = nowEpochMs - lastUpdatedMs > staleAfterMinutes * 60_000;

  if (earliestReadyEpochMs === null || !Number.isFinite(earliestReadyEpochMs)) {
    return {
      scheduleValid: false,
      isStale,
      staleAgeMinutes,
      serviceAvailableToday: false,
      catchable: false,
      departureIso: null,
      departureWib: null,
      arrivalIso: null,
      arrivalWib: null,
      waitMinutes: null,
      reason: "Waktu kesiapan naik tidak valid; keterkejaran jadwal tidak dapat dipastikan.",
    };
  }

  if (!Array.isArray(corridor.syntheticDeparturesWib) || corridor.syntheticDeparturesWib.length === 0) {
    return {
      scheduleValid: false,
      isStale,
      staleAgeMinutes,
      serviceAvailableToday: false,
      catchable: false,
      departureIso: null,
      departureWib: null,
      arrivalIso: null,
      arrivalWib: null,
      waitMinutes: null,
      reason: `Daftar keberangkatan ${corridor.routeShortName} kosong.`,
    };
  }

  const wibDate = getWibParts(earliestReadyEpochMs).dateStr;
  const departureEpochs: number[] = [];
  for (const hhmm of corridor.syntheticDeparturesWib) {
    const depMs = wibClockToEpochMs(wibDate, hhmm);
    if (depMs === null) {
      return {
        scheduleValid: false,
        isStale,
        staleAgeMinutes,
        serviceAvailableToday: false,
        catchable: false,
        departureIso: null,
        departureWib: null,
        arrivalIso: null,
        arrivalWib: null,
        waitMinutes: null,
        reason: `Format jam keberangkatan "${hhmm}" pada ${corridor.routeShortName} tidak valid.`,
      };
    }
    departureEpochs.push(depMs);
  }
  departureEpochs.sort((a, b) => a - b);

  // Round readiness up to the whole minute threshold only if there are leftover seconds?
  // Strict physical guarantee: departureMs >= earliestReadyEpochMs.
  const nextDepMs = departureEpochs.find((ms) => ms >= earliestReadyEpochMs);
  if (nextDepMs === undefined) {
    return {
      scheduleValid: true,
      isStale,
      staleAgeMinutes,
      serviceAvailableToday: false,
      catchable: false,
      departureIso: null,
      departureWib: null,
      arrivalIso: null,
      arrivalWib: null,
      waitMinutes: null,
      reason: `Di luar jam layanan demo ${corridor.routeShortName} (${corridor.operatingHoursWib} WIB) untuk tanggal ${wibDate}.`,
    };
  }

  const durationMs = corridor.estimatedTransitDurationMin * 60_000;
  const arrivalMs = nextDepMs + durationMs;
  const waitMinutes = Math.max(0, Math.ceil((nextDepMs - earliestReadyEpochMs) / 60_000));

  return {
    scheduleValid: true,
    isStale,
    staleAgeMinutes,
    serviceAvailableToday: true,
    catchable: true,
    departureIso: toWibIsoFromEpoch(nextDepMs),
    departureWib: formatWibClock(nextDepMs),
    arrivalIso: toWibIsoFromEpoch(arrivalMs),
    arrivalWib: formatWibClock(arrivalMs),
    waitMinutes,
    reason: isStale
      ? `Jadwal demo ${corridor.routeShortName} kedaluwarsa (${Math.round(staleAgeMinutes / 60)} jam sejak pembaruan terakhir).`
      : null,
  };
}

export function toWibIsoFromEpoch(epochMs: number): string {
  const p = getWibParts(epochMs);
  const shifted = new Date(epochMs + WIB_OFFSET_MS);
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${p.dateStr}T${p.hhmm}:${ss}+07:00`;
}
