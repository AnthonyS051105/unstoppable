import { maskPhoneNumber } from "../../shared/phone.js";

/** Konfigurasi gateway OpenWA dari environment variables. */
export interface OpenWaConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  dailyCap: number;
}

/** Rekam jejak pengiriman harian untuk pencegahan burst & spam. */
const dailyTracker = {
  dateString: new Date().toISOString().slice(0, 10),
  sentCount: 0,
};

let lastSentTimestamp = 0;
const MIN_INTERVAL_MS = 3000; // Delay minimum 3 detik antar pesan (anti-burst)

/** Mengambil konfigurasi OpenWA dari process.env. */
export function getOpenWaConfig(): OpenWaConfig {
  const enabled = process.env.WHATSAPP_GATEWAY_ENABLED === "true";
  const baseUrl = (process.env.OPENWA_BASE_URL || "http://localhost:2785").replace(/\/+$/, "");
  const apiKey = process.env.OPENWA_API_KEY || "";
  const sessionId = process.env.OPENWA_SESSION_ID || "default";
  const dailyCap = Number.parseInt(process.env.WHATSAPP_DAILY_CAP || "50", 10);

  return { enabled, baseUrl, apiKey, sessionId, dailyCap: Number.isFinite(dailyCap) ? dailyCap : 50 };
}

/**
 * Normalisasi nomor HP Indonesia ke format JID WhatsApp internasional (mis. 628123456789@c.us).
 */
export function formatPhoneNumberToJid(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "").trim();

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (!cleaned.startsWith("62") && cleaned.length > 0) {
    cleaned = "62" + cleaned;
  }

  return `${cleaned}@c.us`;
}

/**
 * Mengatur jeda keamanan anti-burst antar pemanggilan keluar.
 */
async function enforceCooldown(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSentTimestamp;
  if (elapsed < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastSentTimestamp = Date.now();
}

/**
 * Memeriksa dan memperbarui kuota harian pesan keluar.
 */
function checkDailyQuota(dailyCap: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyTracker.dateString !== today) {
    dailyTracker.dateString = today;
    dailyTracker.sentCount = 0;
  }

  if (dailyTracker.sentCount >= dailyCap) {
    console.warn(`[WHATSAPP-GATEWAY] Kuota harian (${dailyCap} pesan) telah tercapai. Beralih ke mode simulasi aman.`);
    return false;
  }

  dailyTracker.sentCount += 1;
  return true;
}

/** Reset internal tracker (khusus unit testing). */
export function resetTrackerForTesting() {
  dailyTracker.dateString = new Date().toISOString().slice(0, 10);
  dailyTracker.sentCount = 0;
  lastSentTimestamp = 0;
}

/**
 * Mengirimkan pesan OTP via OpenWA REST API.
 * Mengembalikan true jika pesan berhasil terkirim ke gateway, false jika fallback/non-aktif/gagal.
 */
export async function sendOtpViaWhatsApp(phoneNumber: string, otp: string): Promise<boolean> {
  const config = getOpenWaConfig();

  if (!config.enabled) {
    return false;
  }

  if (!config.apiKey) {
    console.warn("[WHATSAPP-GATEWAY] OPENWA_API_KEY belum dikonfigurasi. Pesan tidak dikirim via WhatsApp.");
    return false;
  }

  if (!checkDailyQuota(config.dailyCap)) {
    return false;
  }

  const jid = formatPhoneNumberToJid(phoneNumber);
  const messageText = `Halo! Kode verifikasi pendaftaran akun UNSTOPPABLE Anda adalah: *${otp}*.\n\nKode ini berlaku selama 5 menit. Jangan bagikan kode ini kepada siapa pun demi keamanan akun Anda.`;

  await enforceCooldown();

  const url = `${config.baseUrl}/api/sessions/${encodeURIComponent(config.sessionId)}/messages/send-text`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout 5 detik

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({
        chatId: jid,
        text: messageText,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(`[WHATSAPP-GATEWAY] Gagal mengirim pesan ke ${maskPhoneNumber(phoneNumber)}: HTTP ${response.status} ${errText}`);
      return false;
    }

    console.info(`[WHATSAPP-GATEWAY] Berhasil mengirim OTP ke ${maskPhoneNumber(phoneNumber)} via OpenWA.`);
    return true;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`[WHATSAPP-GATEWAY] Timeout saat memanggil OpenWA gateway untuk ${maskPhoneNumber(phoneNumber)}.`);
    } else {
      console.warn(`[WHATSAPP-GATEWAY] Gangguan jaringan saat memanggil OpenWA: ${error.message}`);
    }
    return false;
  }
}
