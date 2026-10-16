import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import * as sessionsService from "./sessions.service.js";

async function runLifecycleSmokeTest() {
  console.log("Starting Travel Session lifecycle smoke test...\n");

  const phoneNumber = `08${Date.now().toString().slice(-10)}`;
  const user = await prisma.user.create({
    data: {
      phoneNumber,
      name: "B10 Lifecycle Smoke User",
      role: "blind_user",
    },
  });

  try {
    const first = await sessionsService.startSession({
      userId: user.id,
      origin: { lat: -7.7710, lng: 110.3695 },
      destination: { lat: -7.7680, lng: 110.3780 },
      destinationName: "B10 Destination",
      edgeIds: [],
      profileId: "blind",
    });

    const second = await sessionsService.startSession({
      userId: user.id,
      origin: { lat: -7.7710, lng: 110.3695 },
      destination: { lat: -7.7680, lng: 110.3780 },
      destinationName: "B10 Replacement Destination",
      edgeIds: [],
      profileId: "blind",
    });

    const replaced = await prisma.travelSession.findUnique({
      where: { id: first.session.id },
      select: { status: true, endedReason: true },
    });
    assert.deepEqual(replaced, { status: "cancelled", endedReason: "replaced" });
    assert.equal(second.session.status, "active");
    console.log("[PASS] Starting a new session replaces the previous active session.");

    const paused = await sessionsService.pauseSession(second.session.id, user.id);
    assert.ok(paused?.pausedAt);

    await prisma.$executeRaw`
      UPDATE travel_sessions
      SET last_ping_at = now() - interval '10 minutes'
      WHERE id = ${second.session.id}::uuid
    `;
    const staleWhilePaused = await sessionsService.findStaleSessions(3);
    assert.equal(
      staleWhilePaused.some((candidate) => candidate.id === second.session.id),
      false,
    );
    console.log("[PASS] Paused sessions are excluded from dead-man-switch candidates.");

    const resumed = await sessionsService.resumeSession(second.session.id, user.id);
    assert.ok(resumed?.lastPingAt);
    console.log("[PASS] Pause/resume changes session state and refreshes last ping.");

    const firstArrivalPing = await sessionsService.recordLocationPing({
      sessionId: second.session.id,
      userId: user.id,
      lat: -7.7680,
      lng: 110.3780,
      accuracyM: 8,
    });
    assert.ok(firstArrivalPing?.arrivalCheck);
    assert.equal(firstArrivalPing?.arrivalCheck?.sessionId, second.session.id);
    console.log("[PASS] Location inside the clamped arrival radius creates one arrival prompt.");

    const snoozed = await sessionsService.respondToArrival(second.session.id, user.id, false);
    assert.equal(snoozed.type, "snoozed");
    assert.ok(snoozed.session?.arrivalSnoozeUntil);

    await prisma.$executeRaw`
      UPDATE travel_sessions
      SET arrival_snooze_until = now() - interval '1 minute'
      WHERE id = ${second.session.id}::uuid
    `;

    const secondArrivalPing = await sessionsService.recordLocationPing({
      sessionId: second.session.id,
      userId: user.id,
      lat: -7.7680,
      lng: 110.3780,
      accuracyM: 8,
    });
    assert.ok(secondArrivalPing?.arrivalCheck);

    const ended = await sessionsService.respondToArrival(second.session.id, user.id, true);
    assert.equal(ended.type, "ended");
    assert.equal(ended.session?.status, "completed");
    assert.equal(ended.session?.endedReason, "user");
    console.log("[PASS] Arrival snooze and explicit arrival completion work.");

    console.log("\n[SUCCESS] Travel Session lifecycle smoke test passed.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    console.log("[CLEANUP] Lifecycle smoke user cleaned up.");
  }
}

runLifecycleSmokeTest().catch((err) => {
  console.error("[FAIL] Travel Session lifecycle smoke test failed:", err);
  process.exit(1);
});
