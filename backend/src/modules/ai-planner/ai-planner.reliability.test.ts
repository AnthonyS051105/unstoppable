import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn() },
  extraction: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
  query: vi.fn(), execute: vi.fn(),
}));
vi.mock('@google/genai', () => ({ Type: { OBJECT: 'OBJECT', STRING: 'STRING' }, GoogleGenAI: class { models = { generateContent: mocks.generateContent }; } }));
vi.mock('../../config/prisma.js', () => ({ prisma: {
  aiPlannerConversation: mocks.conversation, aiPlannerMessage: mocks.message, aiPlannerExtraction: mocks.extraction,
  $queryRaw: mocks.query, $executeRaw: mocks.execute, userPlacePreference: { findFirst: vi.fn().mockResolvedValue(null) },
} }));
import { sendMessage, startConversation, confirmConversation } from './ai-planner.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GEMINI_API_KEY', 'test-backend-key');
  mocks.conversation.findUnique.mockResolvedValue({ id: 'conversation', userId: 'traveler', status: 'active' });
  mocks.conversation.create.mockResolvedValue({ id: 'conversation', status: 'active' });
  mocks.message.create.mockImplementation(async ({ data }) => ({ id: 'message', ...data }));
  mocks.message.findMany.mockResolvedValue([]);
  mocks.extraction.count.mockResolvedValue(0);
  mocks.extraction.create.mockResolvedValue({ id: 'extraction' });
});
afterEach(() => vi.unstubAllEnvs());

describe('AI planner failure boundaries', () => {
  it('reports absent backend key as a retriable 503 before persisting a failed message', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(sendMessage('conversation', 'traveler', { content: 'Ke PAU' })).rejects.toMatchObject({ httpStatus: 503, details: { fallback: 'manual_destination' } });
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.message.create).not.toHaveBeenCalled();
  });
  it('sanitizes provider failure and does not save an incomplete turn', async () => {
    mocks.generateContent.mockRejectedValue(new Error('provider exposes test-backend-key'));
    await expect(sendMessage('conversation', 'traveler', { content: 'Ke PAU' })).rejects.toMatchObject({ httpStatus: 503, message: expect.not.stringContaining('test-backend-key') });
    expect(mocks.message.create).not.toHaveBeenCalled();
  });
  it.each(['not json', '{"destinationQuery":17,"plannedTimeHHMM":null,"contextNotes":null}', '{"destinationQuery":"PAU","plannedTimeHHMM":"29:00","contextNotes":null}'])('rejects malformed model output: %s', async (text) => {
    mocks.generateContent.mockResolvedValue({ text });
    await expect(sendMessage('conversation', 'traveler', { content: 'PAU' })).rejects.toMatchObject({ httpStatus: 503 });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('checks ownership before using Gemini', async () => {
    await expect(sendMessage('conversation', 'stranger', { content: 'PAU' })).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
});

describe('conversation flow', () => {
  it('matches a known building, keeps WIB time, and includes prior turns for clarification', async () => {
    await expect(startConversation('traveler')).resolves.toMatchObject({ status: 'active' });
    mocks.message.findMany.mockResolvedValue([{ sender: 'user', content: 'Saya mau ke PAU' }, { sender: 'assistant', content: 'Jam berapa?' }]);
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ destinationQuery: 'PAU', plannedTimeHHMM: '09:30', contextNotes: 'kursi roda' }) });
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ name: 'Gedung PAU', geojson: { type: 'Point', coordinates: [110.37, -7.76] } }]).mockResolvedValueOnce([{ id: 'extraction' }]);
    const result = await sendMessage('conversation', 'traveler', { content: 'Jam 9.30', inputMode: 'voice' });
    expect(result.readyToConfirm).toBe(true);
    expect(result.extraction.matchSource).toBe('building');
    expect(result.extraction.plannedTime?.getUTCHours()).toBe(2);
    expect(mocks.generateContent.mock.calls[0][0].contents).toContain('Saya mau ke PAU');
    expect(mocks.message.create).toHaveBeenCalledTimes(2);
    expect(mocks.conversation.update).not.toHaveBeenCalled();
  });
  it('keeps unmatched destination unconfirmed and never invents coordinates', async () => {
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ destinationQuery: 'Tidak Ada', plannedTimeHHMM: null, contextNotes: null }) });
    mocks.query.mockResolvedValue([]);
    const result = await sendMessage('conversation', 'traveler', { content: 'Ke Tidak Ada' });
    expect(result.readyToConfirm).toBe(false);
    expect(result.extraction.destinationLocation).toBeNull();
  });
  it('rejects invalid explicit planned time before conversation writes', async () => {
    await expect(confirmConversation('conversation', 'traveler', { plannedTime: 'yesterday' })).rejects.toMatchObject({ httpStatus: 400 });
    expect(mocks.conversation.update).not.toHaveBeenCalled();
  });
  it('uses gemini-3.5-flash-lite by default and allows GEMINI_MODEL override', async () => {
    vi.stubEnv('GEMINI_MODEL', '');
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ destinationQuery: 'PAU', plannedTimeHHMM: null, contextNotes: null }) });
    mocks.query.mockResolvedValue([]);
    await sendMessage('conversation', 'traveler', { content: 'Ke PAU' });
    expect(mocks.generateContent.mock.calls[0][0].model).toBe('gemini-3.5-flash-lite');

    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
    await sendMessage('conversation', 'traveler', { content: 'Ke PAU' });
    expect(mocks.generateContent.mock.calls[1][0].model).toBe('gemini-2.5-flash');
  });
  it('filters path_nodes to approved operational nodes and escapes SQL LIKE wildcards', async () => {
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ destinationQuery: '100%_test', plannedTimeHHMM: null, contextNotes: null }) });
    mocks.query.mockResolvedValue([]);
    await sendMessage('conversation', 'traveler', { content: 'Ke 100%_test' });
    const nodeQueryCall = mocks.query.mock.calls[2];
    const templateStrings = nodeQueryCall[0].join(' ');
    expect(templateStrings).toContain("status = 'approved'");
    expect(templateStrings).toContain('is_operational = TRUE');
    expect(nodeQueryCall[1]).toBe('%100\\%\\_test%');
  });
  it('supports manual fallback confirmation with explicit coordinates when AI extraction is absent', async () => {
    mocks.conversation.findUnique.mockResolvedValue({ id: 'conversation', userId: 'traveler', status: 'active', messages: [] });
    mocks.conversation.update.mockResolvedValue({ id: 'conversation', status: 'completed' });
    mocks.query.mockResolvedValueOnce([]);
    const res = await confirmConversation('conversation', 'traveler', {
      destinationText: 'Puskesmas Mergangsan',
      destinationLocation: { type: 'Point', coordinates: [110.374, -7.813] },
      plannedTime: '2026-11-17T09:00:00+07:00',
    });
    expect(res.confirmedDestination.destinationText).toBe('Puskesmas Mergangsan');
    expect(res.confirmedDestination.destinationLocation.coordinates).toEqual([110.374, -7.813]);
    expect(mocks.conversation.update).toHaveBeenCalledTimes(1);
  });
});

