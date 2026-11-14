import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { reportsRouter } from "./reports.routes.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { signAccessToken } from "../auth/token.js";
import * as service from "./reports.service.js";

vi.mock("./reports.service.js", () => ({ findOwnReports: vi.fn() }));
vi.mock("../../config/prisma.js", () => ({ prisma: {} }));
vi.mock("../sessions/sessions.service.js", () => ({}));
vi.mock("../../realtime/index.js", () => ({}));
vi.mock("../../realtime/report.handlers.js", () => ({}));
let server: Server;
let base: string;
const owner = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  process.env.JWT_SECRET = "dev-unit-secret-only";
  const app = express(); app.use("/reports", reportsRouter); app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
beforeEach(() => vi.clearAllMocks());
const headers = (role = "mobility_user", sub = owner) => ({ Authorization: `Bearer ${signAccessToken({ sub, role })}` });
it("requires authentication before querying personal reports", async () => {
  for (const h of [{}, { Authorization: "Bearer invalid" }]) {
    const r = await fetch(`${base}/reports/mine`, { headers: h });
    expect(r.status).toBe(401);
  }
  expect(service.findOwnReports).not.toHaveBeenCalled();
});
it.each(["page=0", "page=1.5", "page=1000001", "limit=101", "limit=0", "userId=other", "reporterId=other"])("rejects invalid or ownership query %s", async query => {
  const r = await fetch(`${base}/reports/mine?${query}`, { headers: headers() });
  expect(r.status).toBe(400); expect(service.findOwnReports).not.toHaveBeenCalled();
});
it.each(["mobility_user", "blind_user", "caregiver", "volunteer", "admin"])("uses token owner for %s and preserves top-level pagination", async role => {
  const page = { data: [], meta: { page: 2, perPage: 5, total: 0, totalPages: 0 } };
  vi.mocked(service.findOwnReports).mockResolvedValue(page);
  const r = await fetch(`${base}/reports/mine?page=2&limit=5`, { headers: headers(role) });
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ success: true, ...page });
  expect(service.findOwnReports).toHaveBeenCalledWith(owner, { page: 2, limit: 5 });
});
it("uses a different token owner without accepting a caller supplied identity", async () => {
  vi.mocked(service.findOwnReports).mockResolvedValue({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } });
  await fetch(`${base}/reports/mine`, { headers: headers("volunteer", "22222222-2222-4222-8222-222222222222") });
  expect(service.findOwnReports).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", { page: 1, limit: 20 });
});
