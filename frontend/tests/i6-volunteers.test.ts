import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { ApiError } from '../src/lib/api-client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const profile = { verificationStatus: 'pending', canCompanion: false, canMapData: false, isActive: false, ratingAvg: 0, totalHelps: 0 };
const modulePath = '../src/lib/api/volunteers';
async function adapter() {
  const loaded = await import(modulePath).catch(() => null);
  assert.ok(loaded?.volunteersApi, 'Adapter relawan belum tersedia');
  return loaded as typeof import('../src/lib/api/volunteers');
}
function reply(data: unknown, status = 200) { return new Response(JSON.stringify({ success: true, data }), { status }); }
function reject(status: number, code: string) { return new Response(JSON.stringify({ success: false, error: { code, message: 'Pesan server' } }), { status }); }

test('profil kosong dibedakan dari gangguan server dan penolakan akses', async () => {
  const { volunteersApi } = await adapter();
  globalThis.fetch = async () => reject(404, 'NOT_FOUND');
  assert.equal(await volunteersApi.profile(), null);
  for (const [status, code] of [[503, 'INTERNAL_ERROR'], [403, 'FORBIDDEN']] as const) {
    globalThis.fetch = async () => reject(status, code);
    await assert.rejects(volunteersApi.profile(), (e: unknown) => e instanceof ApiError && e.status === status);
  }
});
test('sakelar mengirim hanya isActive dan memakai status respons server', async () => {
  const { volunteersApi } = await adapter();
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/volunteers\/me$/);
    assert.equal(init?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(init?.body)), { isActive: false });
    return reply(profile);
  };
  assert.deepEqual(await volunteersApi.setActive(false), profile);
});
test('kapabilitas hanya berlaku bagi peran volunteer terverifikasi dengan izin server', async () => {
  const { canOfferCompanion } = await adapter();
  const verified = { ...profile, verificationStatus: 'verified' as const, canCompanion: true };
  assert.equal(canOfferCompanion('volunteer', verified), true);
  assert.equal(canOfferCompanion('volunteer', { ...verified, canCompanion: false }), false);
  assert.equal(canOfferCompanion('volunteer', { ...verified, verificationStatus: 'pending' }), false);
  assert.equal(canOfferCompanion('admin', verified), false);
  assert.equal(canOfferCompanion('volunteer', null), false);
});
test('availability mempertahankan longitude latitude dan kode hari Minggu nol', async () => {
  const { volunteersApi } = await adapter();
  const slot = { centerPoint: { type: 'Point' as const, coordinates: [110.37, -7.76] as [number, number] }, radiusMeters: 3000, dayOfWeek: 0, startTime: '08:00', endTime: '17:00' };
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/volunteers\/availability$/);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), slot);
    return reply({ ...slot, id: 'dev-slot', isActive: true });
  };
  assert.equal((await volunteersApi.addAvailability(slot)).dayOfWeek, 0);
});
test('hapus availability mendukung 204 dan kegagalan tidak dianggap sukses', async () => {
  const { volunteersApi } = await adapter();
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/volunteers\/availability\/dev%2Fslot$/);
    assert.equal(init?.method, 'DELETE');
    return new Response(null, { status: 204 });
  };
  await volunteersApi.removeAvailability('dev/slot');
  globalThis.fetch = async () => reject(503, 'INTERNAL_ERROR');
  await assert.rejects(volunteersApi.setActive(true), /Pesan server/);
});
