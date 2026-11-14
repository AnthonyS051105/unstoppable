import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sosApi } from '../src/lib/api/sos';
import { sosStore } from '../src/lib/sos-state';
import { tokens, ApiError } from '../src/lib/api-client';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  tokens.clear();
  sosStore.clear();
});

const ok = (data: unknown) => Response.json({ success: true, data });

test('trigger mengirimkan lokasi GPS [lng, lat] GeoJSON Point dan sessionId, serta mengembalikan respons server', async () => {
  tokens.set({ accessToken: 'test-token', refreshToken: 'test-refresh' });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.pathname, '/api/sos/trigger');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    
    const body = JSON.parse(String(init?.body));
    assert.equal(body.triggerType, 'manual_button');
    assert.deepEqual(body.location, {
      type: 'Point',
      coordinates: [110.3753222, -7.8101201],
    });
    assert.equal(body.sessionId, 'sess-uuid-123');

    return ok({
      sosId: 'sos-uuid-999',
      notifiedVolunteers: 3,
      notifiedCaregivers: 1,
      status: 'active',
    });
  };

  const res = await sosApi.trigger({
    triggerType: 'manual_button',
    location: {
      type: 'Point',
      coordinates: [110.3753222, -7.8101201],
    },
    sessionId: 'sess-uuid-123',
  });

  assert.equal(res.sosId, 'sos-uuid-999');
  assert.equal(res.notifiedVolunteers, 3);
  assert.equal(res.notifiedCaregivers, 1);
  assert.equal(res.status, 'active');
});

test('trigger dengan notifiedVolunteers: 0 mengembalikan data server secara valid', async () => {
  tokens.set({ accessToken: 'test-token', refreshToken: 'test-refresh' });
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/sos\/trigger$/);
    return ok({
      sosId: 'sos-uuid-empty',
      notifiedVolunteers: 0,
      notifiedCaregivers: 0,
      status: 'active',
    });
  };

  const res = await sosApi.trigger({
    triggerType: 'manual_button',
    location: {
      type: 'Point',
      coordinates: [110.375, -7.81],
    },
    sessionId: null,
  });

  assert.equal(res.notifiedVolunteers, 0);
  assert.equal(res.sosId, 'sos-uuid-empty');
});

test('cancel memanggil POST /sos/:id/cancel dengan reason yang sesuai', async () => {
  tokens.set({ accessToken: 'test-token', refreshToken: 'test-refresh' });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.pathname, '/api/sos/sos-test-id/cancel');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');

    const body = JSON.parse(String(init?.body));
    assert.equal(body.reason, 'false_alarm');

    return ok({ status: 'cancelled' });
  };

  const res = await sosApi.cancel('sos-test-id', 'false_alarm');
  assert.equal(res.status, 'cancelled');
});

test('respond memanggil POST /sos/:id/respond dengan responseStatus valid relawan', async () => {
  tokens.set({ accessToken: 'volunteer-token', refreshToken: 'volunteer-refresh' });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.pathname, '/api/sos/sos-test-id/respond');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer volunteer-token');

    const body = JSON.parse(String(init?.body));
    assert.equal(body.responseStatus, 'en_route');

    return ok({
      id: 'resp-123',
      sosId: 'sos-test-id',
      volunteerId: 'vol-456',
      responseStatus: 'en_route',
      respondedAt: '2026-11-14T13:00:00.000Z',
    });
  };

  const res = await sosApi.respond('sos-test-id', 'en_route');
  assert.equal(res.id, 'resp-123');
  assert.equal(res.responseStatus, 'en_route');
  assert.equal(res.sosId, 'sos-test-id');
});

test('status memanggil GET /sos/:id/status dan mengembalikan data responder', async () => {
  tokens.set({ accessToken: 'test-token', refreshToken: 'test-refresh' });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.pathname, '/api/sos/sos-test-id/status');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');

    return ok({
      id: 'sos-test-id',
      status: 'responded',
      escalationLevel: 1,
      createdAt: '2026-11-14T13:00:00.000Z',
      resolvedAt: null,
      responders: [
        {
          id: 'vol-1',
          name: 'Relawan Budi',
          status: 'en_route',
          distanceM: 320,
          etaMin: null,
          respondedAt: '2026-11-14T13:01:00.000Z',
        },
      ],
    });
  };

  const res = await sosApi.status('sos-test-id');
  assert.equal(res.id, 'sos-test-id');
  assert.equal(res.status, 'responded');
  assert.equal(res.responders.length, 1);
  assert.equal(res.responders[0].name, 'Relawan Budi');
  assert.equal(res.responders[0].distanceM, 320);
});

test('sosStore mengelola state SOS aktif dan pembaruan responder', () => {
  sosStore.set({
    sosId: 'sos-store-1',
    status: 'active',
    notifiedVolunteers: 2,
    notifiedCaregivers: 1,
    responders: [],
  });

  const state1 = sosStore.get();
  assert.equal(state1?.sosId, 'sos-store-1');
  assert.equal(state1?.notifiedVolunteers, 2);

  sosStore.updateResponders(
    [
      {
        id: 'vol-1',
        name: 'Relawan A',
        status: 'en_route',
        distanceM: 150,
        etaMin: null,
        respondedAt: '2026-11-14T13:00:00.000Z',
      },
    ],
    'responded',
  );

  const state2 = sosStore.get();
  assert.equal(state2?.status, 'responded');
  assert.equal(state2?.responders.length, 1);
  assert.equal(state2?.responders[0].name, 'Relawan A');

  sosStore.clear();
  assert.equal(sosStore.get(), null);
});
