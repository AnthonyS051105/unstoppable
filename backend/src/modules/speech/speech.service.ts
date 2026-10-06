// Speech Service -- proxy ber-autentikasi internal ke microservice Python
// (voice-microservices/), docs/API_CONTRACT.md §6 & backend/docs/SDD.md §11.
// Microservice TIDAK diekspos publik; hanya backend ini yang boleh
// memanggilnya, diamankan header X-Internal-Key (SDD §11, AD-06 ARCHITECTURE.md).
import { AppError } from "../../shared/errors.js";

const SYNTHESIZE_TIMEOUT_MS = 5000; // SDD §11: timeout 5 detik untuk synthesize
const TRANSCRIBE_TIMEOUT_MS = 15000; // SDD §11: timeout 15 detik untuk transcribe

function speechServiceUrl(): string {
  const url = process.env.SPEECH_SERVICE_URL;
  if (!url) {
    throw new AppError("INTERNAL_ERROR", "Konfigurasi server tidak lengkap.", 500);
  }
  return url;
}

function speechServiceApiKey(): string {
  const key = process.env.SPEECH_SERVICE_API_KEY;
  if (!key) {
    throw new AppError("INTERNAL_ERROR", "Konfigurasi server tidak lengkap.", 500);
  }
  return key;
}

async function callSpeechService(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    const res = await fetch(`${speechServiceUrl()}${path}`, {
      ...init,
      headers: { ...init.headers, "X-Internal-Key": speechServiceApiKey() },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`speech service responded ${res.status}`);
    }
    return res;
  } catch (err) {
    if (err instanceof AppError) throw err;
    // SDD §11: kegagalan apa pun (timeout, network, non-2xx) -> 503
    // SPEECH_UNAVAILABLE. FE wajib jatuh ke Web Speech API browser --
    // request TIDAK boleh gagal total/hang tanpa respons yang jelas.
    throw new AppError("SPEECH_UNAVAILABLE", "Layanan suara sedang tidak tersedia.", 503);
  }
}

export interface SynthesizeResult {
  buffer: Buffer;
  contentType: string;
}

export async function synthesize(text: string, speedPercent: number, lang: string): Promise<SynthesizeResult> {
  const res = await callSpeechService(
    "/synthesize",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speedPercent, lang }),
    },
    SYNTHESIZE_TIMEOUT_MS,
  );
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType: res.headers.get("content-type") ?? "audio/mpeg" };
}

export interface TranscribeResult {
  text: string;
  confidence: number | null;
}

export async function transcribe(audioBuffer: Buffer, filename: string): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audioBuffer)]), filename);

  const res = await callSpeechService("/transcribe", { method: "POST", body: form }, TRANSCRIBE_TIMEOUT_MS);
  const data = (await res.json()) as { text: string; confidence?: number | null };
  return { text: data.text, confidence: data.confidence ?? null };
}
