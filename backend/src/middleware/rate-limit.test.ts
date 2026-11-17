import http from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { errorHandler } from "./error-handler.js";
import { authLimiter } from "./rate-limit.js";

function startAuthTestServer() {
  const app = express();
  app.use(express.json());
  app.post("/api/auth/login", authLimiter, (req, res) => {
    if (req.body?.ok === true) {
      return res.status(200).json({ success: true });
    }
    return res.status(401).json({
      success: false,
      error: { code: "INVALID_CREDENTIALS", message: "Kredensial tidak valid." },
    });
  });
  app.use(errorHandler);

  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("Expected TCP address");
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe("authLimiter HTTP behavior", () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          }),
      ),
    );
  });

  it("allows repeated successful logins without consuming the 5-failure cap, then limits on the 6th failed attempt", async () => {
    const { server, baseUrl } = await startAuthTestServer();
    servers.push(server);

    const postLogin = (ok: boolean) =>
      fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok }),
      });

    for (let i = 0; i < 7; i += 1) {
      const res = await postLogin(true);
      expect(res.status).toBe(200);
      expect(res.headers.get("ratelimit-limit")).toBe("5");
    }

    for (let i = 0; i < 5; i += 1) {
      const res = await postLogin(false);
      expect(res.status).toBe(401);
    }

    const blocked = await postLogin(false);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("ratelimit-limit")).toBe("5");
    expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
    const body = (await blocked.json()) as {
      success: boolean;
      error: { code: string; message: string; details?: { retryAfterSec?: number } };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("Terlalu banyak percobaan masuk");
    expect(body.error.details?.retryAfterSec).toBe(900);
  });
});
