import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { reportsApi, reportCategory, reportSeverity } from '../src/lib/api/reports';
import { tokens, ApiError } from '../src/lib/api-client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; tokens.clear(); });
const ok = (data: unknown) => Response.json({ success: true, data });

test('category and severity use explicit mappings and reject unknown labels', () => {
  assert.equal(reportCategory('Guiding block rusak'), 'guiding_block_rusak');
  assert.equal(reportCategory('Tanpa penyeberangan'), 'tanpa_penyeberangan');
  assert.equal(reportSeverity('Tinggi'), 'high');
  assert.throws(() => reportCategory('Kategori salah'));
  assert.throws(() => reportSeverity('Ekstrem'));
});

test('nearby sends lng lat and active status without swapping coordinates', async () => {
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.pathname, '/api/reports/nearby');
    assert.equal(u.searchParams.get('lng'), '110.375');
    assert.equal(u.searchParams.get('lat'), '-7.765');
    assert.equal(u.searchParams.get('radiusM'), '1000');
    assert.equal(u.searchParams.get('status'), 'active');
    assert.equal(init?.signal, controller.signal);
    return ok([]);
  };
  const controller = new AbortController();
  assert.deepEqual(await reportsApi.nearby([110.375, -7.765], controller.signal), []);
});

test('along-route preserves bigint string ids and does not fetch for empty route', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(new URL(String(url)).searchParams.get('edgeIds'), '9007199254740993,117');
    return ok([{ id: 'r1', edgeId: '9007199254740993', effect: 'degrade' }]);
  };
  assert.deepEqual(await reportsApi.alongRoute([]), []);
  assert.equal(calls, 0);
  const reports = await reportsApi.alongRoute(['9007199254740993', '117']);
  assert.equal(reports[0].edgeId, '9007199254740993');
  assert.equal(reports[0].effect, 'degrade');
});

test('corroborate waits for server count and retains 403/409 messages', async () => {
  tokens.set({ accessToken: 'dev-test', refreshToken: 'dev-test' });
  let resolve!: (r: Response) => void;
  let complete = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).pathname, '/api/reports/report-1/corroborate');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer dev-test');
    return new Promise<Response>(r => { resolve = r; });
  };
  const pending = reportsApi.corroborate('report-1').then(r => { complete = true; return r; });
  await new Promise(r => setImmediate(r));
  assert.equal(complete, false);
  resolve(ok({ corroborationCount: 2 }));
  assert.equal((await pending).corroborationCount, 2);
  for (const status of [403, 409]) {
    globalThis.fetch = async () => Response.json({ success: false, error: { code: status === 409 ? 'CONFLICT' : 'FORBIDDEN', message: 'Pesan server' } }, { status });
    await assert.rejects(reportsApi.corroborate('report-1'), e => e instanceof ApiError && e.status === status && e.message === 'Pesan server');
  }
});
