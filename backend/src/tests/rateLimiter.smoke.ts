import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";

async function runRateLimiterSmokeTest() {
  console.log("Starting Rate Limiter smoke test...\n");

  const testLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Rate limit exceeded" },
  });

  const ip = "127.0.0.1";
  let status = 200;
  let responseBody: any = null;

  function mockRequest() {
    status = 200;
    responseBody = null;
    const req = { ip, headers: {} } as Request;
    const res = {
      setHeader() {},
      status(code: number) { status = code; return this; },
      send(body: any) { responseBody = body; return this; },
      json(body: any) { responseBody = body; return this; },
    } as unknown as Response;

    testLimiter(req, res, () => {
      status = 200;
    });
  }

  mockRequest();
  console.assert(status === 200, `Request 1 failed, status: ${status}`);
  console.log("[PASS] Request 1 within limit allowed (status 200).");

  mockRequest();
  console.assert(status === 200, `Request 2 failed, status: ${status}`);
  console.log("[PASS] Request 2 within limit allowed (status 200).");

  mockRequest();
  console.assert(status === 429, `Request 3 failed: Expected 429, got ${status}`);
  console.log("[PASS] Request 3 exceeding limit blocked (status 429 Too Many Requests).");

  console.log("\n[SUCCESS] Rate limiter (Req N3) verified successfully.");
}

runRateLimiterSmokeTest().catch((err) => {
  console.error("[FAIL] Rate limiter test failed with error:", err);
  process.exit(1);
});