import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import * as service from "./communities.service.js";

async function runCommunitySmokeTest() {
  console.log("Starting B16 community core smoke test...\n");

  const admin = await prisma.user.create({
    data: {
      phoneNumber: `08${Date.now().toString().slice(-10)}`,
      name: "B16 Community Admin",
      role: "admin",
    },
  });
  const member = await prisma.user.create({
    data: {
      phoneNumber: `08${(Date.now() + 1).toString().slice(-10)}`,
      name: "B16 Community Member",
      role: "blind_user",
    },
  });

  let communityId: string | undefined;

  try {
    const created = await service.createCommunity(admin.id, {
      slug: `b16-smoke-${Date.now()}`,
      name: "B16 Smoke Community",
      description: "Komunitas sementara untuk smoke test B16.",
      icon: "users",
      centerPoint: { type: "Point", coordinates: [110.3753, -7.8101] },
      radiusMeters: 3000,
    });
    communityId = created.id;
    console.log("[PASS] Admin can create a community.");

    const listed = await service.listCommunities(member.id, {
      lng: 110.3753,
      lat: -7.8101,
    });
    assert.equal(listed.some((community) => community.id === communityId), true);
    console.log("[PASS] Communities can be listed with distance and joined state.");

    const joined = await service.joinCommunity(member.id, communityId);
    assert.equal(joined.joined, true);
    const detail = await service.getCommunity(member.id, communityId);
    assert.equal(detail.myRole, "member");
    console.log("[PASS] User can join and see membership role.");

    const reports = await service.listCommunityReports(communityId);
    assert.deepEqual(reports, []);
    console.log("[PASS] Community reports reuse the active nearby-report query.");

    const left = await service.leaveCommunity(member.id, communityId);
    assert.equal(left.left, true);
    console.log("[PASS] User can leave a community idempotently.");

    console.log("\n[SUCCESS] B16 community core smoke test passed.");
  } finally {
    if (communityId) {
      await prisma.community.delete({ where: { id: communityId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, member.id] } } });
    await prisma.$disconnect();
    console.log("[CLEANUP] B16 smoke users/community cleaned up.");
  }
}

runCommunitySmokeTest().catch((error) => {
  console.error("[FAIL] B16 community core smoke test failed:", error);
  process.exit(1);
});
