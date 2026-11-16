import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, apiPaged, ApiError, tokens } from '../src/lib/api-client';

// [DEV] tokens + fetch/storage terinjeksi; tidak memakai backend atau DB.
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const storage = new Map<string, string>();
const pair = (name: string) => ({ accessToken: `[DEV] ${name}-access`, refreshToken: `[DEV] ${name}-refresh` });
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data, meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }), { status });
const expired = () => new Response(JSON.stringify({ success: false, error: { code: 'TOKEN_EXPIRED', message: '[DEV] Kedaluwarsa' } }), { status: 401 });
const changed = (error: unknown) => error instanceof ApiError && error.code === 'SESSION_CHANGED';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  tokens.clear();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else Reflect.deleteProperty(globalThis, 'navigator');
});

for (const call of [api, apiPaged]) {
  const name = call === api ? 'api' : 'apiPaged';
  test(`${name}: POST A yang kedaluwarsa setelah masuk B tidak direfresh atau dikirim ulang`, async () => {
    const first = deferred<Response>();
    const requests: { path: string; auth: string | null; body: BodyInit | null | undefined }[] = [];
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ path: String(url), auth: new Headers(init.headers).get('Authorization'), body: init.body });
      if (requests.length === 1) return first.promise;
      return response(String(url).endsWith('/auth/refresh') ? pair('B-rotated') : { owner: '[DEV] B' });
    };
    tokens.set(pair('A'));
    const pending = call('/reports', { method: 'POST', body: JSON.stringify({ description: '[DEV] Payload milik A' }) });
    tokens.set(pair('B'));
    first.resolve(expired());
    await assert.rejects(pending, changed);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].auth, `Bearer ${pair('A').accessToken}`);
    assert.equal(tokens.access(), pair('B').accessToken);
  });

  for (const status of [200, 204]) {
    test(`${name}: respons sukses lama ${status} tidak diteruskan ke state akun B`, async () => {
      const first = deferred<Response>();
      globalThis.fetch = async () => first.promise;
      tokens.set(pair('A'));
      let state = '[DEV] B';
      const pending = call('/users/me').then(() => { state = '[DEV] A'; });
      tokens.set(pair('B'));
      first.resolve(status === 204 ? new Response(null, { status }) : response({ name: '[DEV] A' }));
      await assert.rejects(pending, changed);
      assert.equal(state, '[DEV] B');
    });
  }

  test(`${name}: pergantian akun saat json dibaca membatalkan hasil lama`, async () => {
    const body = deferred<unknown>();
    const reading = deferred<void>();
    globalThis.fetch = async () => ({ status: 200, json: () => { reading.resolve(); return body.promise; } }) as Response;
    tokens.set(pair('A'));
    const pending = call('/users/me');
    await reading.promise;
    tokens.set(pair('B'));
    body.resolve({ success: true, data: { name: '[DEV] A' } });
    await assert.rejects(pending, changed);
  });

  test(`${name}: request lama yang menunggu refresh awal tidak dikirim memakai token B`, async () => {
    const refresh = deferred<Response>();
    let count = 0;
    globalThis.fetch = async () => ++count === 1 ? refresh.promise : response({ owner: '[DEV] B' });
    storage.set('unstoppable-refresh-v1', pair('A').refreshToken);
    const pending = call('/reports', { method: 'POST', body: '[DEV] A' });
    tokens.set(pair('B'));
    refresh.resolve(response(pair('A-rotated')));
    await assert.rejects(pending, changed);
    assert.equal(count, 1);
  });

  test(`${name}: pergantian akun selama refresh retry membatalkan pengiriman ulang`, async () => {
    const refresh = deferred<Response>();
    const refreshing = deferred<void>();
    let count = 0;
    globalThis.fetch = async () => {
      count++;
      if (count === 1) return expired();
      if (count === 2) { refreshing.resolve(); return refresh.promise; }
      return response({ owner: '[DEV] B' });
    };
    tokens.set(pair('A'));
    const pending = call('/reports', { method: 'POST', body: '[DEV] A' });
    await refreshing.promise;
    tokens.set(pair('B'));
    refresh.resolve(response(pair('A-rotated')));
    await assert.rejects(pending, changed);
    assert.equal(count, 2);
  });

  test(`${name}: hasil retry lama tidak diteruskan setelah logout`, async () => {
    const retried = deferred<void>();
    const result = deferred<Response>();
    let count = 0;
    globalThis.fetch = async () => {
      count++;
      if (count === 1) return expired();
      if (count === 2) return response(pair('A-rotated'));
      retried.resolve(); return result.promise;
    };
    tokens.set(pair('A'));
    const pending = call('/users/me');
    await retried.promise;
    tokens.clear();
    result.resolve(response({ name: '[DEV] A' }));
    await assert.rejects(pending, changed);
    assert.equal(tokens.access(), null);
  });

  test(`${name}: sesi yang sama tetap refresh sekali dan mempertahankan data/paginasi`, async () => {
    const auth: (string | null)[] = [];
    globalThis.fetch = async (url, init = {}) => {
      auth.push(new Headers(init.headers).get('Authorization'));
      if (auth.length === 1) return expired();
      if (String(url).endsWith('/auth/refresh')) return response(pair('A-rotated'));
      return response([{ id: '[DEV] A' }]);
    };
    tokens.set(pair('A'));
    const result = await call('/reports');
    assert.deepEqual(result, call === api ? [{ id: '[DEV] A' }] : {
      data: [{ id: '[DEV] A' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    assert.deepEqual(auth, [`Bearer ${pair('A').accessToken}`, null, `Bearer ${pair('A-rotated').accessToken}`]);
  });
}
