import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { sessionsApi } from '../src/lib/api/sessions';
import { ApiError } from '../src/lib/api-client';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('sessionsApi.start memanggil POST /sessions/start dengan payload lengkap', async () => {
  assert.equal(typeof sessionsApi.start, 'function', 'sessionsApi.start harus berupa fungsi');

  const mockPayload = {
    origin: { type: 'Point' as const, coordinates: [110.3759, -7.7653] as [number, number] },
    destination: { type: 'Point' as const, coordinates: [110.3800, -7.7700] as [number, number] },
    destinationName: 'Stasiun Tugu',
    edgeIds: ['101', '102'],
    profileId: 'blind',
    estimatedArrival: '2026-11-14T14:30:00.000Z',
    plannedTripId: '123e4567-e89b-12d3-a456-426614174000',
  };

  const mockResponse = {
    id: 'session-uuid-1',
    userId: 'user-uuid-1',
    destinationName: 'Stasiun Tugu',
    profileId: 'blind',
    status: 'active',
    startedAt: '2026-11-14T14:00:00.000Z',
    estimatedArrival: '2026-11-14T14:30:00.000Z',
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/sessions\/start$/);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), mockPayload);
    return new Response(JSON.stringify({ success: true, data: mockResponse }), { status: 201 });
  };

  const result = await sessionsApi.start(mockPayload);
  assert.deepEqual(result, mockResponse);
});

test('sessionsApi.location memanggil POST /sessions/:id/location dengan GeoJSON dan accuracy', async () => {
  assert.equal(typeof sessionsApi.location, 'function', 'sessionsApi.location harus berupa fungsi');

  const mockPingResult = {
    id: 'ping-1',
    sessionId: 'session-uuid-1',
    recordedAt: '2026-11-14T14:05:00.000Z',
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/sessions\/session-uuid-1\/location$/);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      location: { type: 'Point', coordinates: [110.376, -7.766] },
      accuracyM: 5,
    });
    return new Response(JSON.stringify({ success: true, data: mockPingResult }), { status: 201 });
  };

  const result = await sessionsApi.location('session-uuid-1', [110.376, -7.766], 5);
  assert.deepEqual(result, mockPingResult);
});

test('sessionsApi.heartbeat memanggil POST /sessions/:id/heartbeat', async () => {
  assert.equal(typeof sessionsApi.heartbeat, 'function', 'sessionsApi.heartbeat harus berupa fungsi');

  const mockHeartbeatResult = {
    sessionId: 'session-uuid-1',
    status: 'active',
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/sessions\/session-uuid-1\/heartbeat$/);
    assert.equal(init?.method, 'POST');
    return new Response(JSON.stringify({ success: true, data: mockHeartbeatResult }), { status: 200 });
  };

  const result = await sessionsApi.heartbeat('session-uuid-1');
  assert.deepEqual(result, mockHeartbeatResult);
});

test('sessionsApi.end memanggil POST /sessions/:id/end dengan payload completed', async () => {
  assert.equal(typeof sessionsApi.end, 'function', 'sessionsApi.end harus berupa fungsi');

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/sessions\/session-uuid-1\/end$/);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), { status: 'completed' });
    return new Response(JSON.stringify({ success: true, data: { sessionId: 'session-uuid-1', status: 'completed' } }), { status: 200 });
  };

  const result = await sessionsApi.end('session-uuid-1');
  assert.deepEqual(result, { sessionId: 'session-uuid-1', status: 'completed' });
});

test('sessionsApi.summary memanggil GET /sessions/:id/summary dan mengembalikan ringkasan perjalanan', async () => {
  assert.equal(typeof sessionsApi.summary, 'function', 'sessionsApi.summary harus berupa fungsi');

  const mockSummary = {
    id: 'session-uuid-1',
    status: 'completed' as const,
    destinationName: 'Stasiun Tugu',
    durationMin: 18,
    distanceM: 1250,
  };

  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/sessions\/session-uuid-1\/summary$/);
    return new Response(JSON.stringify({ success: true, data: mockSummary }), { status: 200 });
  };

  const result = await sessionsApi.summary('session-uuid-1');
  assert.deepEqual(result, mockSummary);
});

test('sessionsApi menangani penolakan server dan melempar ApiError', async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan atau sudah berakhir.' },
      }),
      { status: 404 },
    );
  };

  await assert.rejects(
    sessionsApi.heartbeat('session-invalid'),
    (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND' && e.status === 404,
  );
});
