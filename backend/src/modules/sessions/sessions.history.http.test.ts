import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
vi.mock('./sessions.service.js', () => ({ listSessionHistory: vi.fn() }));
vi.mock('../auth/token.js', () => ({ verifyAccessToken: () => ({ sub: 'signed-in-owner', role: 'blind_user' }) }));
import { listSessionHistory } from './sessions.service.js';
import router from './sessions.routes.js';
import { errorHandler } from '../../middleware/error-handler.js';

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use('/api/sessions', router);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  base = `http://127.0.0.1:${address.port}/api/sessions/history`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); });
beforeEach(() => vi.resetAllMocks());

describe('GET /api/sessions/history', () => {
  it('rejects guests before querying history', async () => {
    expect((await fetch(base)).status).toBe(401);
    expect(listSessionHistory).not.toHaveBeenCalled();
  });
  it('uses the token owner instead of any userId supplied in the query', async () => {
    const result = { data: [], meta: { page: 2, perPage: 10, total: 0, totalPages: 0 } };
    vi.mocked(listSessionHistory).mockResolvedValue(result);
    const response = await fetch(`${base}?page=2&limit=10&userId=another-owner`, { headers: { Authorization: 'Bearer test' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, ...result });
    expect(listSessionHistory).toHaveBeenCalledExactlyOnceWith('signed-in-owner', 2, 10);
  });
  it('rejects invalid pagination without reaching the database', async () => {
    const response = await fetch(`${base}?limit=101`, { headers: { Authorization: 'Bearer test' } });
    expect(response.status).toBe(400);
    expect(listSessionHistory).not.toHaveBeenCalled();
  });
});
