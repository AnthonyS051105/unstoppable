import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingsApi, extractFacilityScores, getBuildingAdvocacySummary } from '../src/lib/api/buildings';
import { ApiError, tokens } from '../src/lib/api-client';
import type { BuildingAccessibilityScore } from '../src/types/api';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; tokens.clear(); });
const reply = (data: unknown) => Response.json({ success: true, data });
const score: BuildingAccessibilityScore = {
  id: 'campus-building', buildingId: 'campus-building', name: 'Gedung kampus', accessibilityScore: 52.5,
  scoreBreakdown: {
    entrance: { score: 50, note: '1 dari 2 pintu tanpa tangga.' },
    verticalAccess: { score: 0, note: 'Tidak ada lift; gedung memiliki 3 lantai.' },
    paths: { score: 100, note: 'Seluruh jalur memenuhi lebar dan kelandaian.' },
    facilities: { score: 100, note: 'Toilet difabel tersedia.' },
  },
};

test('public catalogue encodes faculty, forwards cancellation and never sends an account token', async () => {
  tokens.set({ accessToken: 'dev-token', refreshToken: 'dev-refresh' });
  const controller = new AbortController();
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, '/api/buildings');
    assert.equal(parsed.searchParams.get('faculty'), 'Teknik & Sains');
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.equal(init?.signal, controller.signal);
    return reply([]);
  };
  assert.deepEqual(await buildingsApi.list('Teknik & Sains', controller.signal), []);
});

test('dedicated score endpoint encodes building id and preserves server scores and notes', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).pathname, '/api/buildings/campus%2Fbuilding/accessibility-score');
    assert.equal(init?.signal, controller.signal);
    return reply(score);
  };
  assert.deepEqual(await buildingsApi.accessibilityScore('campus/building', controller.signal), score);
});

test('null scores and errors are retained rather than converted into zero or an empty catalogue', async () => {
  globalThis.fetch = async () => reply({ ...score, accessibilityScore: null, scoreBreakdown: null });
  assert.equal((await buildingsApi.accessibilityScore('campus-building')).accessibilityScore, null);
  for (const status of [404, 503]) {
    globalThis.fetch = async () => Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Pesan server' } }, { status });
    await assert.rejects(buildingsApi.list(), error => error instanceof ApiError && error.status === status && error.message === 'Pesan server');
  }
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(buildingsApi.accessibilityScore('campus-building'), error => error instanceof ApiError && error.code === 'NETWORK');
});

test('facility presentation retains backend evidence without claiming guiding blocks or ramps were inspected', () => {
  const facilities = extractFacilityScores(score);
  assert.deepEqual(facilities.map(f => f.score), [100, 50, 100, 0]);
  assert.match(facilities[0].note, /guiding block belum dinilai/i);
  assert.match(facilities[1].note, /ramp belum dinilai/i);
  assert.match(facilities[3].note, /Tidak ada lift/);
  assert.equal(facilities[3].status, 'unmet');
  assert.equal(getBuildingAdvocacySummary(score).scoreFormatted, '52.5/100');
  assert.ok(getBuildingAdvocacySummary(score).recommendations.some(r => /lift/i.test(r)));
});

test('unknown facilities stay unknown, even for default flags or an unsurveyed one-floor building', () => {
  const unknown = { ...score, accessibilityScore: null, scoreBreakdown: null, floorCount: 1, hasLift: false, hasAccessibleToilet: false, surveyedAt: null };
  const facilities = extractFacilityScores(unknown);
  assert.ok(facilities.every(f => f.score === null && f.status === 'unverified'));
  assert.equal(getBuildingAdvocacySummary(unknown).badgeText, 'Belum disurvei');
  assert.equal(getBuildingAdvocacySummary(unknown).scoreFormatted, '—');
});

test('partial surveys retain known facilities and distinguish incomplete aggregate scores', () => {
  const partial = { ...score, accessibilityScore: null, scoreBreakdown: { ...score.scoreBreakdown!, paths: { score: null, note: 'Belum diukur.' } } };
  assert.equal(extractFacilityScores(partial)[0].score, null);
  assert.equal(extractFacilityScores(partial)[3].score, 0);
  const summary = getBuildingAdvocacySummary(partial);
  assert.equal(summary.badgeText, 'Skor belum lengkap');
  assert.ok(summary.recommendations.some(r => /lift/i.test(r)));
});
