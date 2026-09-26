import type { Request, Response } from "express";
import { requireRole } from "../middleware/rbac.js";

async function runRbacSmokeTest() {
  console.log("Starting RBAC Middleware smoke test...\n");

  const isDev = process.env.NODE_ENV !== "production";
  const mapperGuard = requireRole(["mapper", "admin"]);

  let status1 = 0;
  let response1: any = null;
  const req1 = { headers: {} } as Request;
  const res1 = {
    status(code: number) { status1 = code; return this; },
    json(data: any) { response1 = data; return this; },
  } as Response;
  mapperGuard(req1, res1, () => { status1 = 200; });

  console.assert(status1 === 401, `Test 1 Failed: Expected 401, got ${status1}`);
  console.log(`[PASS] Case 1: Unauthenticated request rejected with status 401.`);

  let status2 = 0;
  let response2: any = null;
  const req2 = { headers: { "x-user-role": "volunteer" } } as Request;
  const res2 = {
    status(code: number) { status2 = code; return this; },
    json(data: any) { response2 = data; return this; },
  } as Response;
  mapperGuard(req2, res2, () => { status2 = 200; });

  console.assert(status2 === 403, `Test 2 Failed: Expected 403, got ${status2}`);
  console.log(`[PASS] Case 2: Volunteer attempting mapper route rejected with status 403.`);

  let nextCalled = false;
  const req3 = { headers: { "x-user-role": "mapper" } } as Request;
  const res3 = {
    status(code: number) { return this; },
    json(data: any) { return this; },
  } as Response;
  mapperGuard(req3, res3, () => { nextCalled = true; });

  console.assert(nextCalled === true, "Test 3 Failed: Next should be called for mapper role");
  console.log(`[PASS] Case 3: Authorized mapper role granted access successfully.`);

  console.log("\n[SUCCESS] All RBAC middleware test cases passed successfully.");
}

runRbacSmokeTest().catch((err) => {
  console.error("[FAIL] RBAC test failed with error:", err);
  process.exit(1);
});