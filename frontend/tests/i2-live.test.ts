import { test } from 'node:test';
import assert from 'node:assert/strict';
import { live, loadBuildings, planRoute } from '../src/lib/live';
import { routesApi } from '../src/lib/api/routes';
import { ApiError } from '../src/lib/api-client';
import { PLACES } from '../src/lib/places';

const place = { id: 'test-building', name: 'Gedung uji', kind: 'Uji', icon: 'building-2', meta: '', surveyedAt: null, coord: [110.37, -7.76] as [number, number] };
test('catalogue clears unavailable server data and distinguishes empty from failure', async () => {
  routesApi.buildings = async () => [];
  await loadBuildings();
  assert.equal(live.catalogue.status, 'empty');
  assert.equal(PLACES.length, 0);
  routesApi.buildings = async () => { throw new ApiError('NETWORK', 'Terputus', 0); };
  await loadBuildings();
  assert.equal(live.catalogue.status, 'error');
  assert.equal(PLACES.length, 0);
});
test('planning requires an explicit origin and never chooses a gate', async () => {
  let called = false;
  routesApi.plan = async () => { called = true; throw new Error('unexpected'); };
  live.origin = null;
  await assert.rejects(planRoute(place, 'wheelchair'), /Pilih titik asal/);
  assert.equal(called, false);
});
test('unreachable clears an older route and preserves server reasons', async () => {
  live.origin = { label: 'Asal uji', point: { type: 'Point', coordinates: [110.37, -7.77] } };
  routesApi.plan = async () => { throw new ApiError('ROUTE_UNREACHABLE', 'Tidak terjangkau untuk profil ini', 422, { reasons: [{ type: 'stairs', message: 'Ada tangga' }] }); };
  assert.equal(await planRoute(place, 'wheelchair'), 'unreachable');
  assert.equal(live.plan, null);
  assert.equal(live.blocked?.details?.reasons?.[0].message, 'Ada tangga');
});

test('an old route response cannot replace a newer destination', async () => {
  let resolveOld!: (r: import('../src/types/api').RouteResult) => void;
  const route: import('../src/types/api').RouteResult = { reachable: true, profileId: 'wheelchair', totalDistanceM: 42, edgeIds: ['9007199254740993'], geometry: { type: 'LineString', coordinates: [[110.37,-7.77],[110.37,-7.76]] }, steps: [], barriers: [] };
  routesApi.plan = () => new Promise((resolve) => { resolveOld = resolve; });
  const pending = planRoute(place, 'wheelchair');
  routesApi.plan = async () => route;
  assert.equal(await planRoute({ ...place, id: 'new-destination' }, 'wheelchair'), 'ok');
  resolveOld(route);
  assert.equal(await pending, 'stale');
  assert.equal(live.plan?.placeId, 'new-destination');
  assert.deepEqual(live.plan?.route.edgeIds, ['9007199254740993']);
});

test('system failure clears the previous route and leaves a retryable error', async () => {
  routesApi.plan = async () => { throw new ApiError('NETWORK', 'Koneksi terputus', 0); };
  await assert.rejects(planRoute(place, 'wheelchair'), /Koneksi terputus/);
  assert.equal(live.plan, null);
  assert.equal(live.blocked, null);
  assert.equal(live.planning, false);
  assert.equal(live.planError, 'Koneksi terputus');
});

test('a failed comparison cannot leave a previous comparison visible', async () => {
  const { planCompare } = await import('../src/lib/live');
  routesApi.compare = async () => ({ results: [], differences: [] });
  await planCompare(place, ['wheelchair', 'blind']);
  assert.ok(live.compare);
  routesApi.compare = async () => { throw new ApiError('NETWORK', 'Pembanding terputus', 0); };
  await assert.rejects(planCompare(place, ['wheelchair', 'blind']), /Pembanding terputus/);
  assert.equal(live.compare, null);
});

test('unapproved facilities never enter the live catalogue', async () => {
  const { publishFacilities } = await import('../src/lib/live');
  const node = { id: '9007199254740993', name: 'Fasilitas uji', nodeType: 'accessible_toilet', location: { type: 'Point' as const, coordinates: [110.37, -7.76] as [number, number] }, status: 'approved' };
  publishFacilities([node, { ...node, id: 'draft', status: 'draft' }, { ...node, id: 'rejected', status: 'rejected' }]);
  assert.deepEqual(live.facilities.map((n) => n.id), ['9007199254740993']);
});
