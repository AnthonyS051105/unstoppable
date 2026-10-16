import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import * as sessionsService from "./sessions.service.js";

async function runFeedbackSmokeTest() {
  console.log("Starting Travel Session feedback smoke test...\n");

  const phoneNumber = `08${Date.now().toString().slice(-10)}`;
  const user = await prisma.user.create({
    data: {
      phoneNumber,
      name: "B12a Feedback Smoke User",
      role: "blind_user",
    },
  });

  try {
    const active = await sessionsService.startSession({
      userId: user.id,
      origin: { lat: -7.7710, lng: 110.3695 },
      destination: { lat: -7.7680, lng: 110.3780 },
      destinationName: "Feedback Active Session",
      edgeIds: [],
      profileId: "blind",
    });

    await assert.rejects(
      () => sessionsService.submitSessionFeedback(active.session.id, user.id, 5),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT" && error.httpStatus === 409,
    );
    console.log("[PASS] Active sessions cannot receive feedback.");

    const ended = await sessionsService.endSession(
      active.session.id,
      user.id,
      "completed",
      undefined,
      "user",
    );
    assert.equal(ended?.status, "completed");

    const first = await sessionsService.submitSessionFeedback(active.session.id, user.id, 5);
    assert.deepEqual(first, { sessionId: active.session.id, rating: 5 });
    console.log("[PASS] Owner can submit feedback for a completed session.");

    await assert.rejects(
      () => sessionsService.submitSessionFeedback(active.session.id, user.id, 3),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT" && error.httpStatus === 409,
    );
    console.log("[PASS] Duplicate feedback is rejected with 409 CONFLICT.");

    const otherUser = await prisma.user.create({
      data: {
        phoneNumber: `08${(Date.now() + 1).toString().slice(-10)}`,
        name: "B12a Other User",
        role: "blind_user",
      },
    });

    try {
      await assert.rejects(
        () => sessionsService.submitSessionFeedback(active.session.id, otherUser.id, 5),
        (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND" && error.httpStatus === 404,
      );
      console.log("[PASS] Non-owner cannot submit feedback.");
    } finally {
      await prisma.user.delete({ where: { id: otherUser.id } });
    }

    console.log("\n[SUCCESS] Travel Session feedback smoke test passed.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    console.log("[CLEANUP] Feedback smoke user cleaned up.");
  }
}

runFeedbackSmokeTest().catch((err) => {
  console.error("[FAIL] Travel Session feedback smoke test failed:", err);
  process.exit(1);
});
