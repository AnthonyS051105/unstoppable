import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { buildingsRouter } from "./buildings.routes.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { prisma } from "../../config/prisma.js";
import type { BuildingRow, GraphStats } from "./buildings.types.js";

vi.mock("../../config/prisma.js", () => ({ prisma: { $queryRaw: vi.fn() } }));

const row: BuildingRow = {
  id: "11111111-1111-4111-8111-111111111111", name: "Gedung Uji", code: "G1", faculty: "Teknik",
  location: { type: "Point", coordinates: [110.37, -7.76] }, floorCount: 3, hasLift: true,
  hasAccessibleToilet: true, surveyedAt: new Date("2026-11-14T00:00:00Z"),
};
const stats: GraphStats = { entranceCount: 4, stairFreeEntranceCount: 2, liftFloorCount: 3, measuredEdgeCount: 10, compliantEdgeCount: 8 };
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use("/api/buildings", buildingsRouter);
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address missing");
  base = `http://127.0.0.1:${address.port}/api/buildings`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
beforeEach(() => vi.mocked(prisma.$queryRaw).mockReset());

it("exposes the same weighted score and evidence through public catalogue and score routes", async () => {
  const query = vi.mocked(prisma.$queryRaw);
  query.mockResolvedValueOnce([row]).mockResolvedValueOnce([stats]);
  const catalogue = await fetch(base);
  expect(catalogue.status).toBe(200);
  const { data: [building] } = await catalogue.json();
  expect(building.accessibilityScore).toBe(80);

  query.mockResolvedValueOnce([row]).mockResolvedValueOnce([stats]);
  const response = await fetch(`${base}/${row.id}/accessibility-score`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: {
    id: row.id, buildingId: row.id, name: row.name,
    accessibilityScore: building.accessibilityScore, scoreBreakdown: building.scoreBreakdown,
  } });
});

it("retains null scores for an unsurveyed building without scoring default facility flags", async () => {
  vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ ...row, surveyedAt: null, hasLift: false, hasAccessibleToilet: false }]);
  const response = await fetch(`${base}/${row.id}/accessibility-score`);
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({ accessibilityScore: null, scoreBreakdown: null });
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
});

it("retains known aspects but leaves the aggregate null when graph evidence is incomplete", async () => {
  vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([row]).mockResolvedValueOnce([{ ...stats, measuredEdgeCount: 0, compliantEdgeCount: 0 }]);
  const response = await fetch(`${base}/${row.id}/accessibility-score`);
  const body = await response.json();
  expect(body.data.accessibilityScore).toBeNull();
  expect(body.data.scoreBreakdown.paths.score).toBeNull();
  expect(body.data.scoreBreakdown.verticalAccess.score).toBe(100);
});

it("validates building ids before querying and returns 404 for unknown buildings", async () => {
  const invalid = await fetch(`${base}/invalid/accessibility-score`);
  expect(invalid.status).toBe(400);
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
  vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);
  const missing = await fetch(`${base}/${row.id}/accessibility-score`);
  expect(missing.status).toBe(404);
  expect((await missing.json()).error.code).toBe("NOT_FOUND");
});
