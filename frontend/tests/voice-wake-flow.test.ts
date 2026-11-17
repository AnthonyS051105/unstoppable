import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  gateWakeCommand,
  isSensitiveVoiceCommand,
  MAX_EMPTY_VOICE_ENDS,
  normalizeVoiceCommand,
  shouldRetryRecognition,
  VOICE_WAKE_WINDOW_MS,
} from '../src/lib/voice-command';

test('normalizeVoiceCommand strips punctuation and extra spaces without altering command words', () => {
  assert.equal(normalizeVoiceCommand('  “Halo Unstoppable”,   buka AI Planner!  '), 'halo unstoppable buka ai planner');
  assert.equal(normalizeVoiceCommand('Buka-perencana (AI)?'), 'buka perencana ai');
});

test('wake gate ignores ambient commands and accepts combined wake + command', () => {
  assert.deepEqual(gateWakeCommand('buka beranda', 0, 100), { command: null, armedUntil: 0 });
  assert.deepEqual(gateWakeCommand('Halo Unstoppable, buka beranda!', 0, 100), { command: 'buka beranda', armedUntil: 0 });
  assert.equal(gateWakeCommand('katanya halo unstoppable buka beranda', 0, 100).command, null);
});

test('separate wake arms one command for eight seconds then re-arms', () => {
  const wake = gateWakeCommand('halo unstoppable', 0, 100);
  assert.equal(wake.armedUntil, 100 + VOICE_WAKE_WINDOW_MS);
  assert.deepEqual(gateWakeCommand('cari perpustakaan', wake.armedUntil, 500), { command: 'cari perpustakaan', armedUntil: 0 });
  assert.equal(gateWakeCommand('buka beranda', wake.armedUntil, 8100).command, null);
  assert.equal(gateWakeCommand('halo unstoppable buka bantuan', wake.armedUntil, 9000).command, 'buka bantuan');
});

test('stop works before wake and unconfirmed speech cannot trigger SOS, booking, or consent forms', () => {
  assert.equal(gateWakeCommand('matikan mikrofon', 0, 100).command, 'matikan mikrofon');
  assert.equal(gateWakeCommand('hentikan suara', 0, 100).command, 'hentikan suara');
  for (const text of [
    'kirim formulir',
    'kirim',
    'lanjut',
    'lanjutkan',
    'konfirmasi',
    'konfirmasi rute',
    'setuju',
    'kirim sos',
    'aktifkan sos',
    'picu sos',
    'mulai sos',
    'pesan relawan',
    'pesan pendamping',
    'kirim permintaan',
    'pilih relawan',
    'hapus data',
  ]) {
    assert.equal(isSensitiveVoiceCommand(text), true, text);
  }
  assert.equal(isSensitiveVoiceCommand('buka sos'), false);
  assert.equal(isSensitiveVoiceCommand('buka ai planner'), false);
  assert.equal(isSensitiveVoiceCommand('lanjutkan perjalanan'), false);
});

test('shouldRetryRecognition halts retries when hidden, speaking, unwanted, or past empty-end cap', () => {
  assert.equal(shouldRetryRecognition({ wanted: true, speaking: false, hidden: false, emptyEnds: 0 }), true);
  assert.equal(shouldRetryRecognition({ wanted: true, speaking: false, hidden: false, emptyEnds: MAX_EMPTY_VOICE_ENDS - 1 }), true);
  assert.equal(shouldRetryRecognition({ wanted: true, speaking: false, hidden: false, emptyEnds: MAX_EMPTY_VOICE_ENDS }), false);
  assert.equal(shouldRetryRecognition({ wanted: true, speaking: false, hidden: true, emptyEnds: 0 }), false);
  assert.equal(shouldRetryRecognition({ wanted: true, speaking: true, hidden: false, emptyEnds: 0 }), false);
  assert.equal(shouldRetryRecognition({ wanted: false, speaking: false, hidden: false, emptyEnds: 0 }), false);
});

