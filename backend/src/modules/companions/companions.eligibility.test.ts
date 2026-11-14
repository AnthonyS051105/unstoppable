import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), available: vi.fn() }));
vi.mock('../../config/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../volunteers/volunteers.service.js', () => ({ isAvailableForSlot: mocks.available }));
vi.mock('../trips/trips.service.js', () => ({ createFromCompanion: vi.fn() }));
import { createOffer, selectVolunteer, respond } from './companions.service.js';

const request = { id: 'dev-request', requesterId: 'dev-requester', selectedVolunteerId: null, invitedVolunteerId: null, inviteExpiresAt: null, scheduledStart: new Date(Date.now() + 3600000), status: 'open' };
const offer = { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
const raw = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  offer.findUnique.mockResolvedValue(null);
  offer.findMany.mockResolvedValue([{id:'dev-offer',volunteerId:'dev-volunteer'}]);
  offer.create.mockResolvedValue({ id: 'dev-offer', volunteer: {id:'dev-volunteer',name:'[DEV] Relawan'}, message: '[DEV]', createdAt: new Date() });
  raw.mockImplementation(async () => [{ ...request, lng: 110.37, lat: -7.76, durationMin: 60, clash: false }]);
  mocks.transaction.mockImplementation(async (fn) => fn({$queryRaw: raw, companionOffer: offer, companionRequest:{update:vi.fn().mockResolvedValue({scheduledStart:request.scheduledStart})},user:{findUniqueOrThrow:vi.fn().mockResolvedValue({id:'dev-volunteer',name:'[DEV] Relawan'})},caregiverRelationship:{findMany:vi.fn().mockResolvedValue([])}}));
});
it('relawan di luar eligibility server tidak dapat menawar lewat ID permintaan', async () => {
  mocks.available.mockResolvedValue(false);
  await expect(createOffer('dev-volunteer', request.id, {message:'[DEV]'})).rejects.toMatchObject({code:'CONFLICT',httpStatus:409});
  expect(offer.create).not.toHaveBeenCalled();
});
it('permintaan lewat jadwal tidak dapat ditawar melalui endpoint langsung', async () => {
  raw.mockResolvedValue([{...request, scheduledStart:new Date(0), clash:false}]);
  mocks.available.mockResolvedValue(true);
  await expect(createOffer('dev-volunteer', request.id, {})).rejects.toMatchObject({code:'CONFLICT'});
  expect(offer.create).not.toHaveBeenCalled();
});

it('pilihan pengguna tidak mengaktifkan kembali relawan yang tidak lagi eligible', async () => {
  mocks.available.mockResolvedValue(false);
  await expect(selectVolunteer('dev-requester', request.id, 'dev-offer')).rejects.toMatchObject({code:'CONFLICT',httpStatus:409});
  expect(offer.update).not.toHaveBeenCalled();
});
it('penerimaan undangan mengecek availability lagi setelah perubahan profil', async () => {
  raw.mockResolvedValue([{...request, status:'invited', invitedVolunteerId:'dev-volunteer', inviteExpiresAt:new Date(Date.now()+1800000), lng:110.37,lat:-7.76,durationMin:60,clash:false}]);
  mocks.available.mockResolvedValue(false);
  await expect(respond('dev-volunteer',request.id,{accept:true})).rejects.toMatchObject({code:'CONFLICT',httpStatus:409});
});
