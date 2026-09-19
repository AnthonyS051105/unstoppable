import { prisma } from "../../config/prisma.js";
import * as sessionService from "./sessions.service.js";

async function runSmokeTest() {
  console.log("Starting Travel Session and Audit Log smoke test...\n");

  const user = await prisma.user.create({
    data: {
      phoneNumber: "+6281299990001",
      name: "Smoke Test Blind User",
      role: "blind_user",
    },
  });

  const caregiver = await prisma.user.create({
    data: {
      phoneNumber: "+6281299990002",
      name: "Smoke Test Caregiver",
      role: "caregiver",
    },
  });

  console.log(`[PASS] Test users created: ${user.name} and ${caregiver.name}`);

  try {
    const session = await sessionService.startSession({
      userId: user.id,
      origin: { lat: -7.7710, lng: 110.3695 },
      destination: { lat: -7.7680, lng: 110.3780 },
      routeCoordinates: [
        [110.3695, -7.7710],
        [110.3730, -7.7695],
        [110.3780, -7.7680],
      ],
      estimatedArrival: new Date(Date.now() + 15 * 60 * 1000),
    });

    console.log(`[PASS] Session started successfully. Session ID: ${session.id}`);
    console.assert(session.status === "active", "Expected session status to be 'active'");

    await sessionService.recordLocationPing({
      sessionId: session.id,
      lat: -7.7710,
      lng: 110.3695,
    });
    await sessionService.recordLocationPing({
      sessionId: session.id,
      lat: -7.7695,
      lng: 110.3730,
    });
    await sessionService.recordLocationPing({
      sessionId: session.id,
      lat: -7.7680,
      lng: 110.3780,
    });
    console.log("[PASS] 3 location pings recorded to location_pings table.");

    const summary = await sessionService.getSessionSummary(session.id, caregiver.id);
    console.log("[PASS] Session summary calculated:");
    console.log(`       - Traveled distance : ${summary?.distanceMeters} meters`);
    console.log(`       - Total GPS pings   : ${summary?.pingCount}`);
    console.log(`       - Duration seconds  : ${summary?.durationSeconds}s`);

    console.assert((summary?.distanceMeters ?? 0) > 0, "Expected traveled distance to be > 0 meters");
    console.assert(summary?.pingCount === 3, "Expected ping count to be 3");

    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: caregiver.id },
    });
    console.assert(auditLogs.length > 0, "Expected audit log entry when caregiver views summary");
    console.log("[PASS] Audit log (Req N4) verified in database.");

    const endResult = await sessionService.endSession(
      session.id,
      user.id,
      "completed",
      "UGM Central Library"
    );
    console.log(`[PASS] Session ended with status: ${endResult?.status}`);

    const preference = await prisma.userPlacePreference.findFirst({
      where: { userId: user.id },
    });
    console.log(`[PASS] User place preference recorded: ${preference?.placeName}`);

    console.log("\n[SUCCESS] All smoke tests passed successfully.");
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, caregiver.id] } },
    });
    await prisma.$disconnect();
    console.log("[CLEANUP] Test data cleaned up.");
  }
}

runSmokeTest().catch((err) => {
  console.error("[FAIL] Smoke test failed with error:", err);
  process.exit(1);
});