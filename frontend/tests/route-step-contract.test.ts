import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RouteStep as BackendStep } from '../../backend/src/modules/routes/routes.types';
import type { RouteStep, RouteResult } from '../src/types/api';
import { live, planRoute, planCompare } from '../src/lib/live';
import { routesApi } from '../src/lib/api/routes';
import { STEPS } from '../src/lib/data';

const instruction = 'Asal dan tujuan terpetakan ke titik yang sama. Periksa kembali titik yang Anda pilih.';
const point = { type: 'Point' as const, coordinates: [110.37, -7.77] as [number, number] };
const withoutEdge: BackendStep = { order: 1, edgeId: null, attributes: null, instruction, distanceM: 0, startPoint: point, warnings: [] };
const frontendStep: RouteStep = withoutEdge;
const attributes = { surfaceType: 'paving', isIndoor: false, hasStairs: false, slopePercent: 0 };
const normal: BackendStep = { ...withoutEdge, edgeId: '9007199254740993', attributes };
const normalFrontend: RouteStep = normal;

// Kompilasi wajib menolak pasangan ID/atribut yang tidak sesuai kontrak.
// @ts-expect-error langkah tanpa ruas tidak boleh mengarang atribut fisik
const invalidBackend: BackendStep = { ...withoutEdge, attributes };
// @ts-expect-error langkah beruas wajib mempunyai objek atribut
const invalidBackendEdge: BackendStep = { ...normal, attributes: null };
// @ts-expect-error langkah tanpa ruas wajib menyatakan atribut null
const invalidFrontend: RouteStep = { ...frontendStep, attributes };
// @ts-expect-error langkah beruas tidak boleh mempunyai atribut null
const invalidFrontendEdge: RouteStep = { ...normalFrontend, attributes: null };
void [invalidBackend, invalidBackendEdge, invalidFrontend, invalidFrontendEdge];

const route: RouteResult = {
  reachable: true, profileId: 'wheelchair', totalDistanceM: 0, estimatedDurationMin: 0,
  edgeIds: [], geometry: { type: 'LineString', coordinates: [point.coordinates, point.coordinates] },
  steps: [frontendStep], barriers: [], dataFreshness: { surveyedAt: null },
};
const place = { id: 'dev-same-node', name: '[DEV] Titik uji', kind: 'Uji', icon: 'building-2', meta: '', surveyedAt: null, coord: point.coordinates };

test('preview menerima langkah tanpa ruas dan mempertahankan pesan server serta null', async () => {
  const previousPlan = routesApi.plan;
  try {
    live.origin = { label: '[DEV] Asal uji', point };
    routesApi.plan = async () => route;
    assert.equal(await planRoute(place, 'wheelchair'), 'ok');
    assert.deepEqual(live.plan?.route, route);
    assert.equal(live.plan?.route.steps[0].instruction, instruction);
    assert.equal(STEPS[0][0], instruction);
    assert.equal(STEPS[0][1], '0 m');
    assert.deepEqual(JSON.parse(JSON.stringify(live.plan?.route.steps)), [withoutEdge]);
  } finally {
    routesApi.plan = previousPlan;
  }
});

test('compare mempertahankan langkah nullable tanpa membuat ID atau perbedaan ruas', async () => {
  const previousCompare = routesApi.compare;
  try {
    live.origin = { label: '[DEV] Asal uji', point };
    const response = { results: [{ ...route, label: '[DEV] Kursi roda' }], differences: [] };
    routesApi.compare = async () => response;
    await planCompare(place, ['wheelchair', 'blind']);
    assert.deepEqual(live.compare?.data, response);
  } finally {
    routesApi.compare = previousCompare;
  }
});
