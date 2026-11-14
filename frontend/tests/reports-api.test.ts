import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { reportsApi, reportCategory, reportSeverity, createReportData } from '../src/lib/api/reports';
import { tokens, ApiError } from '../src/lib/api-client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; tokens.clear(); });
const ok = (data: unknown) => Response.json({ success: true, data });

test('category and severity use explicit mappings and reject unknown labels', () => {
  assert.equal(reportCategory('Guiding block rusak'), 'guiding_block_rusak');
  assert.equal(reportCategory('Tanpa penyeberangan'), 'tanpa_penyeberangan');
  assert.equal(reportSeverity('Tinggi'), 'high');
  assert.throws(() => reportCategory('Kategori salah'), e => e instanceof ApiError && e.code === 'VALIDATION_ERROR');
  assert.throws(() => reportSeverity('Ekstrem'), e => e instanceof ApiError && e.code === 'VALIDATION_ERROR');
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

const draft = { location: { type: 'Point' as const, coordinates: [110.375, -7.765] as [number, number] }, category: 'genangan' as const, severity: 'medium' as const };
const confirmed = { id: 'confirmed-server-id', category: 'genangan', severity: 'medium', status: 'active', corroborationCount: 1, createdAt: '2026-11-14T00:00:00Z', expiresAt: null, photoUrls: ['https://example.test/dev.png'], linkedEdgeId: '9007199254740993' };
test('create uses repeated photos and JSON data, waits for acknowledgement and never sets multipart content type', async () => {
  tokens.set({ accessToken: 'dev-test', refreshToken: 'dev-test' });
  let resolve!: (r: Response) => void;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).pathname, '/api/reports');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Content-Type'), null);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer dev-test');
    assert.ok(init?.body instanceof FormData);
    assert.deepEqual(JSON.parse(String(init.body.get('data'))), draft);
    assert.equal(init.body.getAll('photos').length, 2);
    assert.equal(init.body.has('photos[]'), false);
    return new Promise<Response>(r => { resolve = r; });
  };
  let settled = false;
  const pending = reportsApi.create(draft, [new File(['dev'], 'dev.png', { type: 'image/png' }), new File(['dev'], 'dev.jpg', { type: 'image/jpeg' })]).then(r => { settled = true; return r; });
  await new Promise(r => setImmediate(r)); assert.equal(settled, false);
  resolve(ok(confirmed)); assert.deepEqual(await pending, confirmed);
});
test('ambiguous upload failure is surfaced once without automatically resubmitting', async () => {
  let count = 0;
  globalThis.fetch = async () => { count++; throw new TypeError('offline'); };
  await assert.rejects(reportsApi.create(draft, []), e => e instanceof ApiError && e.status === 0);
  assert.equal(count, 1);
  globalThis.fetch = async () => { count++; return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyimpan foto' } }, { status: 500 }); };
  await assert.rejects(reportsApi.create(draft, []), /Gagal menyimpan foto/);
  assert.equal(count, 2);
});
test('invalid count, oversized or nonimage files are rejected before a network call', async () => {
  let count = 0; globalThis.fetch = async () => { count++; return ok(confirmed); };
  const small = new File(['dev'], 'dev.png', { type: 'image/png' });
  for (const files of [[small, small, small, small], [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'dev.png', { type: 'image/png' })], [new File(['dev'], 'dev.txt', { type: 'text/plain' })]]) {
    await assert.rejects(reportsApi.create(draft, files), e => e instanceof ApiError && e.code === 'VALIDATION_ERROR');
  }
  assert.equal(count, 0);
});
test('builds server enums and optional description without inventing a location', () => {
  assert.deepEqual(createReportData({ point: draft.location.coordinates, category: 'Genangan', severity: 'Sedang', description: '   ' }), draft);
  assert.throws(() => createReportData({ point: null, category: 'Genangan', severity: 'Sedang', description: '' }), /lokasi/);
  assert.throws(() => createReportData({ point: [NaN, 110], category: 'Genangan', severity: 'Sedang', description: '' }), /lokasi/);
  assert.throws(() => createReportData({ point: draft.location.coordinates, category: 'Genangan', severity: 'Sedang', description: 'x'.repeat(1001) }), /1.000/);
});
test('does not treat a malformed success envelope as a confirmed report', async () => {
  globalThis.fetch = async () => ok({});
  await assert.rejects(reportsApi.create(draft, []), e => e instanceof ApiError && e.code === 'INTERNAL_ERROR');
});
test('mine uses authenticated endpoint and retains server pagination without nearby substitution', async () => {
  tokens.set({ accessToken: 'dev-test', refreshToken: 'dev-test' });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url)); assert.equal(u.pathname, '/api/reports/mine');
    assert.equal(u.search, '?page=2&limit=20'); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer dev-test');
    assert.equal(init?.cache, 'no-store');
    return Response.json({ success: true, data: [confirmed], meta: { page: 2, perPage: 20, total: 21, totalPages: 2 } });
  };
  const page = await reportsApi.mine(2); assert.equal(page.data[0].id, confirmed.id);
  assert.deepEqual(page.meta, { page: 2, perPage: 20, total: 21, totalPages: 2 });
});
