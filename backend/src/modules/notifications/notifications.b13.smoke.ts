import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import { notify } from "../../shared/notify.js";
import * as service from "./notifications.service.js";

async function runNotificationSmokeTest() {
  console.log("Starting B13 notification smoke test...\n");

  const user = await prisma.user.create({
    data: {
      phoneNumber: `08${Date.now().toString().slice(-10)}`,
      name: "B13 Notification Smoke User",
      role: "blind_user",
    },
  });

  try {
    const subscription = await service.upsertPushSubscription(user.id, {
      endpoint: "https://push.example.test/subscription-b13",
      keys: { p256dh: "p256dh-test", auth: "auth-test" },
      userAgent: "B13 smoke",
    });
    assert.ok(subscription.id);
    console.log("[PASS] Push subscription upserted.");

    const defaultPreferences = await service.getNotificationPreferences(user.id);
    assert.deepEqual(defaultPreferences, {
      companion: true,
      session: true,
      community: true,
      trip: true,
    });
    console.log("[PASS] Notification preferences default to enabled.");

    const updatedPreferences = await service.updateNotificationPreferences(user.id, {
      companion: true,
      session: false,
      community: true,
      trip: false,
    });
    assert.deepEqual(updatedPreferences, {
      companion: true,
      session: false,
      community: true,
      trip: false,
    });
    console.log("[PASS] Notification preferences update atomically.");

    await notify([user.id], {
      type: "community",
      event: "community:event",
      title: "Agenda baru",
      body: "Survei jalur komunitas",
      payload: { communityId: "community-b13", eventId: "event-b13" },
    });

    const listed = await service.listNotifications(user.id, { page: 1, perPage: 20 });
    assert.equal(listed.meta.total, 1);
    assert.equal(listed.data[0]?.type, "community");
    console.log("[PASS] notify() persists an inbox notification without VAPID/socket delivery.");

    const notificationId = listed.data[0]!.id;
    await service.markNotificationRead(user.id, notificationId);
    const readAll = await service.markAllNotificationsRead(user.id);
    assert.equal(readAll.markedCount, 0);
    console.log("[PASS] Notification read operations are idempotent.");

    const deleted = await service.deletePushSubscription(user.id, {
      endpoint: "https://push.example.test/subscription-b13",
    });
    assert.equal(deleted.deleted, true);
    console.log("[PASS] Push subscription can be removed.");

    console.log("\n[SUCCESS] B13 notification smoke test passed.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    console.log("[CLEANUP] B13 smoke user cleaned up.");
  }
}

runNotificationSmokeTest().catch((error) => {
  console.error("[FAIL] B13 notification smoke test failed:", error);
  process.exit(1);
});
