// User & accessibility profile endpoints (API_CONTRACT §3–4).
import { api } from "@/lib/api-client";
import type {
  AccessibilitySelection,
  CaregiverLink,
  Dependent,
  LocationSharingMode,
  Me,
  PatchMeRequest,
  ProfileId,
  ToleranceOverrides,
  UserAccessibilityProfile,
} from "@/types/api";

export const patchMe = (body: PatchMeRequest) => api<Me>("/users/me", { method: "PATCH", body: JSON.stringify(body) });

export const listCaregivers = () => api<CaregiverLink[]>("/users/me/caregivers");

export const addCaregiver = (caregiverPhone: string, locationSharingMode: LocationSharingMode) =>
  api<CaregiverLink>("/users/me/caregivers", {
    method: "POST",
    body: JSON.stringify({ caregiverPhone, relationshipType: "primary", locationSharingMode }),
  });

export const removeCaregiver = (linkId: string) => api<void>(`/users/me/caregivers/${encodeURIComponent(linkId)}`, { method: "DELETE" });

export const patchCaregiver = (linkId: string, locationSharingMode: LocationSharingMode) =>
  api<CaregiverLink>(`/users/me/caregivers/${encodeURIComponent(linkId)}`, {
    method: "PATCH",
    body: JSON.stringify({ locationSharingMode }),
  });

/** Caregiver side: seniors who linked this account, each with their active session (if any). */
export const listDependents = () => api<Dependent[]>("/users/me/dependents");

export const putAccessibility = (profiles: AccessibilitySelection[]) =>
  api<{ profiles: UserAccessibilityProfile[] }>("/users/me/accessibility", { method: "PUT", body: JSON.stringify({ profiles }) });

// Onboarding and "Kondisi Anda" offer word choices; the API takes numbers
// (DATA_MODEL §3). Slope: 5% ≈ 1:20, 8% ≈ PUPR outdoor ramp 1:12, 10% = PUPR indoor ramp 1:10.
// Stairs "Lebih dari 8" = the API maximum (30). Empty string = no personal override.
const STAIRS: Record<string, number> = { "0": 0, "1–3": 3, "4–8": 8, "Lebih dari 8": 30 };
const SLOPE: Record<string, number> = { Landai: 5, Sedang: 8, Curam: 10 };

const reverse = (map: Record<string, number>, n: number | undefined) =>
  n === undefined ? "" : (Object.entries(map).find(([, v]) => n <= v)?.[0] ?? Object.keys(map).at(-1)!);

export function toleranceFromChoices(stairs: string, slope: string): ToleranceOverrides | undefined {
  const t: ToleranceOverrides = {};
  if (stairs in STAIRS) t.max_steps = STAIRS[stairs];
  if (slope in SLOPE) t.max_slope_percent = SLOPE[slope];
  return Object.keys(t).length ? t : undefined;
}

export function choicesFromTolerance(t: ToleranceOverrides | null | undefined) {
  return { stairs: reverse(STAIRS, t?.max_steps), slope: reverse(SLOPE, t?.max_slope_percent) };
}

/** First selected profile is primary; the personal tolerance applies to every selected profile. */
export function accessibilitySelection(profiles: ProfileId[], stairs: string, slope: string): AccessibilitySelection[] {
  const toleranceOverrides = toleranceFromChoices(stairs, slope);
  return profiles.map((profileId, i) => ({ profileId, isPrimary: i === 0, ...(toleranceOverrides ? { toleranceOverrides } : {}) }));
}
