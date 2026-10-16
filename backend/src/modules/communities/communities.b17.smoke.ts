import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import * as service from "./communities.service.js";

async function runCommunityDiscussionSmokeTest() {
  console.log("Starting B17 community discussion smoke test...\n");

  const suffix = Date.now().toString().slice(-10);
  const users = await Promise.all(
    ["admin", "volunteer", "blind_user", "blind_user", "blind_user"].map((role, index) =>
      prisma.user.create({
        data: {
          phoneNumber: `08${suffix}${index}`,
          name: `B17 Smoke ${index}`,
          role,
        },
      }),
    ),
  );
  const [admin, author, flagger1, flagger2, flagger3] = users;

  await prisma.volunteerProfile.create({
    data: {
      userId: author.id,
      verificationStatus: "verified",
      canCompanion: true,
      canMapData: false,
      isActive: true,
    },
  });

  let communityId: string | undefined;
  try {
    const community = await service.createCommunity(admin.id, {
      slug: `b17-smoke-${suffix}`,
      name: "B17 Smoke Community",
      description: "Komunitas sementara untuk smoke test B17.",
      icon: "users",
      centerPoint: { type: "Point", coordinates: [110.3753, -7.8101] },
      radiusMeters: 3000,
    });
    communityId = community.id;

    await service.joinCommunity(author.id, communityId);
    await prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId: author.id } },
      data: { role: "moderator" },
    });
    await service.joinCommunity(flagger1.id, communityId);
    await service.joinCommunity(flagger2.id, communityId);
    await service.joinCommunity(flagger3.id, communityId);

    const post = await service.createPost(author.id, communityId, {
      title: "Info jalur",
      body: "Ada survei jalur baru minggu ini.",
    });
    assert.ok(post.id);
    console.log("[PASS] Member can create a plain-text post.");

    await assert.rejects(
      () => service.createPost(author.id, communityId!, { body: "Hubungi saya 081234567890" }),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
    console.log("[PASS] Phone numbers/unsafe contacts are rejected.");

    await service.flagPost(flagger1.id, post.id, { reason: "Perlu diperiksa" });
    await service.flagPost(flagger2.id, post.id, { reason: "Informasi meragukan" });
    const flagged = await service.flagPost(flagger3.id, post.id, { reason: "Mohon ditinjau" });
    assert.equal(flagged.status, "hidden");
    assert.equal(flagged.flagCount, 3);
    console.log("[PASS] Three distinct flags automatically hide a post.");

    await assert.rejects(
      () => service.flagPost(flagger1.id, post.id, { reason: "Laporan ulang" }),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    );
    console.log("[PASS] Duplicate flag is rejected with 409 CONFLICT.");

    const moderated = await service.moderatePost(admin.id, "admin", post.id, {
      status: "visible",
      reason: "Sudah ditinjau moderator.",
    });
    assert.equal(moderated.status, "visible");
    console.log("[PASS] Admin can moderate a community post with audit logging.");

    const event = await service.createEvent(author.id, "volunteer", communityId, {
      title: "Survei jalur komunitas",
      description: "Agenda smoke test.",
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      locationNote: "Pintu utama",
      location: { type: "Point", coordinates: [110.3753, -7.8101] },
    });
    assert.ok(event.id);
    const events = await service.listEvents(communityId);
    assert.equal(events.some((item) => item.id === event.id), true);
    await service.cancelEvent(author.id, "volunteer", communityId, event.id);
    console.log("[PASS] Authorized member can create/list/cancel an event.");

    console.log("\n[SUCCESS] B17 community discussion smoke test passed.");
  } finally {
    if (communityId) {
      await prisma.community.delete({ where: { id: communityId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.$disconnect();
    console.log("[CLEANUP] B17 smoke users/community cleaned up.");
  }
}

runCommunityDiscussionSmokeTest().catch((error) => {
  console.error("[FAIL] B17 community discussion smoke test failed:", error);
  process.exit(1);
});
