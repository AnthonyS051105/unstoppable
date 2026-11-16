import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { routesApi } from '../src/lib/api/routes';
import { sessionsApi } from '../src/lib/api/sessions';
import { ApiError, tokens } from '../src/lib/api-client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; tokens.clear(); });
const origin = { type: 'Point' as const, coordinates: [110.37, -7.77] as [number, number] };
const destination = { type: 'Point' as const, coordinates: [110.38, -7.76] as [number, number] };
const saved = { id: 'saved-1', name: 'Nama khusus', origin, destination, edgeIds: ['9007199254740993'], profileId: 'blind', createdAt: '2026-11-14T00:00:00Z' };
const ok = (data: unknown) => Response.json({ success: true, data });

test('saved routes use authenticated GET/POST/DELETE and preserve GeoJSON and bigint ids', async () => {
  tokens.set({ accessToken: 'test', refreshToken: 'test' });
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test');
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (init?.method === 'POST') {
      assert.deepEqual(JSON.parse(String(init.body)), { name: saved.name, origin, destination, edgeIds: saved.edgeIds, profileId: 'blind' });
      return ok(saved);
    }
    if (init?.method === 'DELETE') return ok({ deleted: true, id: saved.id });
    assert.equal(init?.cache, 'no-store');
    return ok([saved]);
  };
  assert.deepEqual(await routesApi.saved(), [saved]);
  assert.deepEqual(await routesApi.save({ name: saved.name, origin, destination, edgeIds: saved.edgeIds, profileId: 'blind' }), saved);
  await routesApi.deleteSaved(saved.id);
  assert.deepEqual(calls, ['GET /api/routes/saved', 'POST /api/routes/saved', 'DELETE /api/routes/saved/saved-1']);
});

test('history retains pagination metadata and uses the history endpoint', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).pathname + new URL(String(url)).search, '/api/sessions/history?page=2&limit=20');
    assert.equal(init?.cache, 'no-store');
    return Response.json({ success: true, data: [], meta: { page: 2, perPage: 20, total: 21, totalPages: 2 } });
  };
  assert.deepEqual(await sessionsApi.history(2), { data: [], meta: { page: 2, perPage: 20, total: 21, totalPages: 2 } });
});

test('save and delete failures are surfaced without acknowledgement or automatic resubmission', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('offline'); };
  await assert.rejects(routesApi.save({ name: saved.name, origin, destination, edgeIds: saved.edgeIds }), e => e instanceof ApiError && e.code === 'NETWORK');
  assert.equal(calls, 1);
  globalThis.fetch = async () => Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'Bukan rute Anda' } }, { status: 403 });
  await assert.rejects(routesApi.deleteSaved(saved.id), /Bukan rute Anda/);
});

test('reopening a stored custom route restores its origin and exact destination for map planning', async () => {
  const { prepareStoredRoute } = await import('../src/lib/stored-routes');
  const { live, planRoute } = await import('../src/lib/live');
  const { placeByName } = await import('../src/lib/places');
  const place = prepareStoredRoute(saved);
  assert.deepEqual(live.origin?.point, origin);
  assert.deepEqual(placeByName(saved.name), place);
  assert.deepEqual(place.coord, destination.coordinates);
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { origin, destination, profileId: 'blind', includeNarration: true });
    return ok({ reachable: true, profileId: 'blind', totalDistanceM: 12, edgeIds: saved.edgeIds, geometry: { type: 'LineString', coordinates: [origin.coordinates, destination.coordinates] }, steps: [], barriers: [] });
  };
  assert.equal(await planRoute(place, 'blind'), 'ok');
  assert.deepEqual(live.plan?.route.geometry.coordinates, [origin.coordinates, destination.coordinates]);
});

test('local fallback is reserved for guests and network failures, not permission/server failures', async () => {
  const { canUseLocalRoutes } = await import('../src/lib/stored-routes');
  assert.equal(canUseLocalRoutes(false, null), true);
  assert.equal(canUseLocalRoutes(true, null), false);
  assert.equal(canUseLocalRoutes(true, new ApiError('NETWORK', 'Offline', 0)), true);
  assert.equal(canUseLocalRoutes(true, new ApiError('FORBIDDEN', 'Tidak diizinkan', 403)), false);
  assert.equal(canUseLocalRoutes(true, new ApiError('INTERNAL_ERROR', 'Gagal', 500)), false);
});
