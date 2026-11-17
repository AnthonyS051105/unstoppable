/** Speech recognition is an input method; consent-sensitive actions need a button. */
export const WAKE_PHRASE = "Halo Unstoppable";
export const VOICE_WAKE_WINDOW_MS = 8000;
export const MAX_EMPTY_VOICE_ENDS = 3;

export const normalizeVoiceCommand = (raw: string) =>
  raw
    .toLocaleLowerCase("id-ID")
    .replace(/[.,;:!?'"“”‘’()/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function gateWakeCommand(
  raw: string,
  armedUntil: number,
  now: number,
): { command: string | null; armedUntil: number } {
  const text = normalizeVoiceCommand(raw);
  if (/^(berhenti mendengarkan|matikan mikrofon|hentikan suara|stop)$/.test(text)) {
    return { command: text, armedUntil: 0 };
  }
  const wake = text.match(/^halo unstoppable(?:\s+(.*))?$/);
  if (wake) {
    return wake[1] ? { command: wake[1], armedUntil: 0 } : { command: null, armedUntil: now + VOICE_WAKE_WINDOW_MS };
  }
  if (text && armedUntil > now) {
    return { command: text, armedUntil: 0 };
  }
  return { command: null, armedUntil: 0 };
}

export function isSensitiveVoiceCommand(raw: string): boolean {
  const text = normalizeVoiceCommand(raw);
  return (
    /^(kirim formulir|kirim|submit|lanjut|lanjutkan|konfirmasi|konfirmasi rute|setuju|setujui)$/.test(text) ||
    /^(kirim sos|aktifkan sos|picu sos|mulai sos|kirim darurat|darurat sekarang)$/.test(text) ||
    /^(pesan relawan|pesan pendamping|kirim permintaan|ajukan permintaan|pilih relawan|batalkan pendampingan)$/.test(text) ||
    /^(hapus data|reset data)$/.test(text)
  );
}

export function shouldRetryRecognition(params: {
  wanted: boolean;
  speaking: boolean;
  hidden: boolean;
  emptyEnds: number;
  maxEmptyEnds?: number;
}): boolean {
  const limit = params.maxEmptyEnds ?? MAX_EMPTY_VOICE_ENDS;
  return params.wanted && !params.speaking && !params.hidden && params.emptyEnds < limit;
}
