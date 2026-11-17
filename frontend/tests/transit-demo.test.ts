import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistanceInviteHref,
  buildCompanionHandoffNote,
  buildMultimodalSpeechSummary,
  buildWibDepartureIso,
  formatCurrencyIdr,
  formatWibHHMMFromIso,
  shouldDefaultDemoTransit,
} from "../src/lib/planner-recommendations";
import type { MultimodalRecommendationResponse } from "../src/types/api";

test("buildWibDepartureIso and formatWibHHMMFromIso preserve explicit +07:00 WIB offsets", () => {
  const iso = buildWibDepartureIso("09:15", "2026-11-17");
  assert.equal(iso, "2026-11-17T09:15:00+07:00");
  assert.equal(formatWibHHMMFromIso(iso), "09:15");
  assert.equal(buildWibDepartureIso("invalid"), undefined);
});

test("formatCurrencyIdr and shouldDefaultDemoTransit distinguish demo vs real labels", () => {
  assert.equal(formatCurrencyIdr(0), "Gratis (Rp 0)");
  assert.equal(formatCurrencyIdr(null), "Tarif belum diketahui");
  assert.match(formatCurrencyIdr(3500), /3\.500/);
  assert.equal(shouldDefaultDemoTransit({ userName: "[DEMO] Lansia Kursi Roda" }), true);
  assert.equal(shouldDefaultDemoTransit({ userName: "Budi Santoso", destinationName: "Gedung PAU" }), false);
});

test("assistanceInviteHref carries optional time without altering volunteer invite contract", () => {
  assert.equal(
    assistanceInviteHref({ id: "vol-1", name: "Sari" }, { timeHHMM: "09:30" }),
    "assistance-form?volunteer=vol-1&name=Sari&time=09%3A30",
  );
  assert.equal(assistanceInviteHref(null, { timeHHMM: "09:30" }), "assistance-form?time=09%3A30");
  const note = buildCompanionHandoffNote({
    contextNotes: "Butuh kursi roda",
    recommendedTitle: "Pendamping Relawan Terverifikasi",
    rationale: "Tidak ada jalur mandiri.",
  });
  assert.match(note ?? "", /Butuh kursi roda/);
  assert.match(note ?? "", /Pendamping Relawan Terverifikasi/);
});

test("buildMultimodalSpeechSummary announces demo label and departure intent disclaimer", () => {
  const rec: MultimodalRecommendationResponse = {
    profileId: "wheelchair",
    maxWalkMeters: 800,
    demoContext: true,
    providerStatus: {
      adapterName: "DemoStaticTransitAdapter",
      fixtureTag: "demo-release-v1",
      synthetic: true,
      verifiedFeed: false,
      active: true,
      reason: "active_demo_od",
      disclaimer: "SYNTHETIC demo",
      message: "Aktif",
    },
    departureIntent: {
      requestedIso: "2026-11-17T09:00:00+07:00",
      wibClock: "09:00 WIB",
      isDepartureIntentOnly: true,
      disclaimer: "Niat keberangkatan bukan jadwal resmi.",
    },
    recommended: {
      id: "transit-0-demo-bus-a",
      kind: "transit_0_transfer",
      mode: "transit",
      title: "[DEMO] Bus A",
      synthetic: true,
      verifiedFeed: false,
      eligible: true,
      disqualificationReasons: [],
      warnings: [],
      accessibilityUnknown: false,
      hasStaleSchedule: false,
      totalDurationMin: 34,
      totalWalkM: 145.7,
      totalFareIdr: 3500,
      transfers: 0,
      score: 79,
      rationale: "Jalan kaki 146 m terverifikasi dan naik [DEMO] Bus A pukul 09:15 WIB.",
      legs: [],
      previewWalkRoute: null,
    },
    alternatives: [],
    companionRecommendation: {
      recommended: false,
      reasons: [],
      verifiedVolunteers: [
        {
          id: "vol-1",
          name: "[DEMO] Relawan Pendamping",
          ratingAvg: 4.9,
          totalHelps: 12,
          distanceM: 250,
          verificationStatus: "verified",
        },
      ],
    },
  };
  const speech = buildMultimodalSpeechSummary(rec, "[DEMO] Pusat Layanan Lansia Selatan");
  assert.match(speech, /^Data transportasi demo\./);
  assert.match(speech, /34 menit/);
  assert.match(speech, /Niat keberangkatan bukan jadwal resmi/);
});
