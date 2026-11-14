import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
import { prisma } from '../../config/prisma.js';
import { listSessionHistory } from './sessions.service.js';
import { historyQuerySchema } from './sessions.schema.js';

afterEach(() => vi.resetAllMocks());
describe('session history', () => {
  it('validates bounded pagination', () => {
    expect(historyQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(historyQuerySchema.parse({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10 });
    for (const query of [{ page: '0' }, { limit: '101' }, { page: '1.5' }, { page: 'NaN' }]) {
      expect(() => historyQuerySchema.parse(query)).toThrow();
    }
  });
  it('scopes both queries to the signed in owner, orders newest first and keeps GeoJSON', async () => {
    const row = { id: 'session-1', destinationName: 'Tujuan', profileId: 'blind', status: 'completed', startedAt: new Date('2026-11-14T01:00:00Z'), endedAt: new Date('2026-11-14T01:20:00Z'), originGeojson: '{"type":"Point","coordinates":[110,-7]}', destinationGeojson: '{"type":"Point","coordinates":[111,-8]}', durationMin: 20, distanceM: 500 };
    const query = vi.mocked(prisma.$queryRaw);
    query.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ total: 21 }]);
    const result = await listSessionHistory('owner-id', 2, 20);
    expect(result.meta).toEqual({ page: 2, perPage: 20, total: 21, totalPages: 2 });
    expect(result.data[0]).toMatchObject({ id: row.id, origin: { type: 'Point', coordinates: [110, -7] }, destination: { type: 'Point', coordinates: [111, -8] }, startedAt: row.startedAt.toISOString(), durationMin: 20 });
    const [sql, ...params] = query.mock.calls[0];
    expect((sql as unknown as string[]).join(' ')).toMatch(/WHERE.*user_id.*ORDER BY.*started_at DESC/s);
    expect((sql as unknown as string[]).join(' ')).toContain("status <> 'active'");
    expect(params).toEqual(['owner-id', 20, 20]);
    expect(query.mock.calls[1].slice(1)).toEqual(['owner-id']);
  });
  it('returns an empty successful page for accounts with no finished sessions', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
    expect(await listSessionHistory('owner-id', 1, 20)).toEqual({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } });
  });
});
