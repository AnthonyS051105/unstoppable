import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { AppError } from "../shared/errors.js";
import {
  requireRole,
  requireCapability,
  assertCanViewLocation,
} from "../middleware/rbac.js";

async function runRbacSmokeTest() {
  console.log("Starting RBAC and Location Access (BE-N-04) smoke test...\n");

  const res = {} as Response;
  const adminGuard = requireRole("admin");

  let err1: unknown = null;
  adminGuard({ headers: {} } as Request, res, (err) => {
    err1 = err;
  });
  console.assert(
    err1 instanceof AppError && err1.httpStatus === 401 && err1.code === "UNAUTHENTICATED",
    "Test 1 Failed: Expected 401 UNAUTHENTICATED",
  );
  console.log("[PASS] Case 1: Unauthenticated request rejected with 401 UNAUTHENTICATED.");

  let err2: unknown = null;
  adminGuard(
    { user: { id: "u1", role: "volunteer" }, headers: {} } as unknown as Request,
    res,
    (err) => {
      err2 = err;
    },
  );
  console.assert(
    err2 instanceof AppError && err2.httpStatus === 403 && err2.code === "FORBIDDEN",
    "Test 2 Failed: Expected 403 FORBIDDEN",
  );
  console.log("[PASS] Case 2: Non-admin rejected with 403 FORBIDDEN.");

  const mapGuard = requireCapability("canMapData");
  let adminMapAllowed = false;
  await mapGuard(
    { user: { id: "admin-1", role: "admin" }, headers: {} } as unknown as Request,
    res,
    (err) => {
      if (!err) adminMapAllowed = true;
    },
  );
  console.assert(adminMapAllowed === true, "Test 3 Failed: Admin should pass canMapData");
  console.log("[PASS] Case 3: Admin automatically granted canMapData capability.");

  const blindUser = await prisma.user.create({
    data: {
      phoneNumber: "+6281299990021",
      name: "Smoke Blind User",
      role: "blind_user",
    },
  });
  const caregiver = await prisma.user.create({
    data: {
      phoneNumber: "+6281299990022",
      name: "Smoke Caregiver",
      role: "caregiver",
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      phoneNumber: "+6281299990023",
      name: "Smoke Admin",
      role: "admin",
    },
  });

  try {
    let adminBlocked = false;
    try {
      await assertCanViewLocation(adminUser.id, blindUser.id);
    } catch (err) {
      if (err instanceof AppError && err.code === "FORBIDDEN") {
        adminBlocked = true;
      }
    }
    console.assert(adminBlocked === true, "Admin must not be allowed to view user location");
    console.log("[PASS] Case 4a: Admin blocked from viewing user location (SDD 12.2).");

    await prisma.caregiverRelationship.create({
      data: {
        blindUserId: blindUser.id,
        caregiverId: caregiver.id,
        relationshipType: "primary",
        locationSharingMode: "always",
      },
    });

    await assertCanViewLocation(caregiver.id, blindUser.id);
    console.log("[PASS] Case 4b: Linked caregiver with 'always' mode allowed to view location.");
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [blindUser.id, caregiver.id, adminUser.id] } },
    });
    await prisma.$disconnect();
    console.log("[CLEANUP] Test users cleaned up.");
  }

  console.log("\n[SUCCESS] All RBAC and Location Access (BE-N-04) tests passed.");
}

runRbacSmokeTest().catch((err) => {
  console.error("[FAIL] RBAC test failed with error:", err);
  process.exit(1);
});