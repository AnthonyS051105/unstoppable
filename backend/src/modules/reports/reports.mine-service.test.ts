import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma.js";
import * as service from "./reports.service.js";
vi.mock("../../config/prisma.js", () => ({ prisma: { $queryRaw: vi.fn(), $transaction: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
it("filters both count and page by token owner and returns stable photos, geojson and graph string IDs", async () => {
  const query = vi.mocked(prisma.$queryRaw);
  query.mockResolvedValueOnce([{ total: 21n }]).mockResolvedValueOnce([{
    id: "own", category: "genangan", severity: "low", status: "resolved", description: null,
    corroborationCount: 1, createdAt: new Date("2026-11-14T00:00:00Z"), expiresAt: null,
    photoUrls: ["https://example.test/dev.png"], linkedEdgeId: 9007199254740993n,
    geojson: '{"type":"Point","coordinates":[110.375,-7.765]}',
  }]);
  vi.mocked(prisma.$transaction).mockImplementation(async (queries: unknown) => Promise.all(queries as Promise<unknown>[]) as never);
  const result = await service.findOwnReports("owner-token", { page: 2, limit: 20 });
  expect(result.meta).toEqual({ page: 2, perPage: 20, total: 21, totalPages: 2 });
  expect(result.data[0]).toMatchObject({ id: "own", status: "resolved", linkedEdgeId: "9007199254740993", photoUrls: ["https://example.test/dev.png"], location: { type: "Point", coordinates: [110.375, -7.765] } });
  for (const call of query.mock.calls) {
    const sql = (call[0] as unknown as TemplateStringsArray).join("?");
    expect(sql).toMatch(/WHERE rr.reporter_id =/);
    expect(call.slice(1)).toContain("owner-token");
    expect(sql).not.toContain("rr.status =");
  }
  const pageSql = (query.mock.calls[1][0] as unknown as TemplateStringsArray).join("?");
  expect(pageSql).toContain("ORDER BY rr.created_at DESC, rr.id DESC");
  expect(query.mock.calls[1].slice(1)).toEqual(["owner-token", 20, 20]);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: "RepeatableRead" });
});
it("returns an empty page without losing the actual total", async () => {
  vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ total: 1n }]).mockResolvedValueOnce([]);
  vi.mocked(prisma.$transaction).mockImplementation(async (queries: unknown) => Promise.all(queries as Promise<unknown>[]) as never);
  expect(await service.findOwnReports("other-token", { page: 9, limit: 20 })).toEqual({ data: [], meta: { page: 9, perPage: 20, total: 1, totalPages: 1 } });
});
