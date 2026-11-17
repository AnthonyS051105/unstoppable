import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistanceInviteHref,
  buildAssistancePrefill,
  buildPlanAssessment,
  shouldUseManualFallback,
} from "../src/lib/planner-recommendations";
import type { AvailableVolunteer, RouteResult } from "../src/types/api";

const basePoint = { type: "Point" as const, coordinates: [110.37, -7.76] as [number, number] };

const sampleRoute: RouteResult = {
  reachable: true,
  profileId: "wheelchair",
  totalDistanceM: 420.4,
  estimatedDurationMin: 9,
  edgeIds: ["edge-1", "edge-2"],
  geometry: { type: "LineString", coordinates: [[110.37, -7.76], [110.372, -7.762]] },
  steps: [{ order: 1, instruction: "Jalan lurus", distanceM: 420, edgeId: "edge-1" }],
  barriers: [],
  dataFreshness: { surveyedAt: "2026-09-05" },
};

const volunteers: AvailableVolunteer[] = [
  { id: "vol-1", name: "Sari Pratama", ratingAvg: 4.9, totalHelps: 12, distanceM: 250, verificationStatus: "verified" },
  { id: "vol-2", name: "Pending Volunteer", ratingAvg: 4.0, totalHelps: 1, distanceM: 100, verificationStatus: "pending" },
];

test("buildPlanAssessment reports honest transit gap and allows pedestrian trip only when route is reachable with edges", () => {
  const assessment = buildPlanAssessment({
    destinationName: "Gedung PAU",
    destinationLocation: basePoint,
    matchSource: "building",
    profileId: "wheelchair",
    plannedTime: "2026-11-17T09:30:00+07:00",
    contextNotes: null,
    routeStatus: "ok",
    route: sampleRoute,
    volunteers,
  });

  assert.equal(assessment.transitSupported, false);
  assert.match(assessment.transitNotice, /transportasi umum/i);
  assert.equal(assessment.plannedTimeWib, "09.30 WIB");
  assert.match(assessment.plannedTimeDisclaimer ?? "", /bukan jadwal transportasi/i);
  assert.equal(assessment.canStartPedestrianTrip, true);
  assert.equal(assessment.companionRecommended, false);
  assert.equal(assessment.verifiedVolunteers.length, 1);
  assert.equal(assessment.verifiedVolunteers[0].id, "vol-1");
});

test("buildPlanAssessment blocks pedestrian trip start when route is unreachable and recommends verified companion", () => {
  const assessment = buildPlanAssessment({
    destinationName: "Balai Warga",
    destinationLocation: basePoint,
    matchSource: "manual",
    profileId: "wheelchair",
    routeStatus: "unreachable",
    unreachable: {
      message: "Jalur memiliki tangga curam.",
      details: {
        reasons: [{ type: "stairs", message: "Ada tangga tanpa ramp" }],
        nearestReachablePoint: basePoint,
      },
    },
    volunteers,
  });

  assert.equal(assessment.canStartPedestrianTrip, false);
  assert.equal(assessment.companionRecommended, true);
  assert.deepEqual(assessment.pedestrianSummary.unreachableReasons, ["Ada tangga tanpa ramp"]);
  assert.equal(assessment.pedestrianSummary.hasNearestReachablePoint, true);
  assert.ok(assessment.companionReasons.length >= 1);
});

test("buildPlanAssessment triggers companion suggestion on barriers, unsurveyed coverage, or assistance notes", () => {
  const barrierRoute: RouteResult = {
    ...sampleRoute,
    barriers: [{ edgeId: "edge-1", message: "Konstruksi trotoar", severity: "high" }],
    dataFreshness: { surveyedAt: null },
  };
  const assessment = buildPlanAssessment({
    destinationName: "Puskesmas",
    destinationLocation: basePoint,
    matchSource: "preference",
    profileId: "blind",
    contextNotes: "Butuh pendamping untuk menyeberang",
    routeStatus: "ok",
    route: barrierRoute,
    surveyedAt: null,
  });

  assert.equal(assessment.companionRecommended, true);
  assert.equal(assessment.companionReasons.length, 3);
  assert.equal(assessment.canStartPedestrianTrip, true);
});

test("buildAssistancePrefill and assistanceInviteHref produce safe non-booking prefill payloads", () => {
  const prefill = buildAssistancePrefill({
    destinationName: "Gedung PAU",
    destinationLocation: basePoint,
    address: "Fakultas Teknik",
    contextNotes: "Pakai kursi roda",
  });
  assert.deepEqual(prefill, {
    name: "Gedung PAU",
    address: "Fakultas Teknik",
    coord: [110.37, -7.76],
    note: "Pakai kursi roda",
    source: "place",
  });
  assert.equal(assistanceInviteHref(volunteers[0]), "assistance-form?volunteer=vol-1&name=Sari+Pratama");
  assert.equal(assistanceInviteHref(null), "assistance-form");
});

test("shouldUseManualFallback triggers on backend 503 manual_destination, network errors, and unauthenticated errors", () => {
  assert.equal(shouldUseManualFallback({ status: 503, code: "INTERNAL_ERROR", details: { fallback: "manual_destination" } }), true);
  assert.equal(shouldUseManualFallback({ status: 0, code: "NETWORK" }), true);
  assert.equal(shouldUseManualFallback({ status: 401, code: "UNAUTHENTICATED" }), true);
  assert.equal(shouldUseManualFallback({ status: 400, code: "VALIDATION_ERROR" }), false);
});
