import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { companionsApi } from '../src/lib/api/companions';
import { ApiError } from '../src/lib/api-client';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('permintaan open menggunakan wilayah server tanpa koordinat demo', async () => {
  assert.equal(typeof companionsApi.open, 'function', 'Daftar open belum terhubung');
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/companions\/open$/);
    return new Response(JSON.stringify({success:true,data:[]}));
  };
  assert.deepEqual(await companionsApi.open(), []);
});
test('penawaran hanya mengirim pesan dan mempertahankan penolakan server', async () => {
  assert.equal(typeof companionsApi.offer, 'function', 'Penawaran belum terhubung');
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/companions\/requests\/dev%2Frequest\/offer$/);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {message:'[DEV] Saya bersedia'});
    return new Response(JSON.stringify({success:false,error:{code:'CONFLICT',message:'Permintaan sudah ditutup.'}}),{status:409});
  };
  await assert.rejects(companionsApi.offer('dev/request','[DEV] Saya bersedia'), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
});
test('check-in complete mempertahankan confirmed sampai server menyatakan completed', async () => {
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {checkinType:'complete'});
    return new Response(JSON.stringify({success:true,data:{status:'confirmed'}}));
  };
  assert.equal((await companionsApi.checkin('dev-id','complete')).status,'confirmed');
});
