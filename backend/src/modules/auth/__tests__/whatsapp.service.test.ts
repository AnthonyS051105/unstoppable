import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPhoneNumberToJid, getOpenWaConfig, resetTrackerForTesting, sendOtpViaWhatsApp } from "../whatsapp.service.js";

describe("WhatsApp Service - OpenWA Integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    resetTrackerForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("formatPhoneNumberToJid", () => {
    it("memformat nomor lokal 08xxx menjadi format JID 628xxx@c.us", () => {
      expect(formatPhoneNumberToJid("081234567890")).toBe("6281234567890@c.us");
    });

    it("memformat nomor internasional +62xxx menjadi format JID 628xxx@c.us", () => {
      expect(formatPhoneNumberToJid("+6281234567890")).toBe("6281234567890@c.us");
    });

    it("memformat nomor dengan spasi dan strip dengan benar", () => {
      expect(formatPhoneNumberToJid("0812-3456-7890")).toBe("6281234567890@c.us");
      expect(formatPhoneNumberToJid("+62 812 3456 7890")).toBe("6281234567890@c.us");
    });

    it("mempertahankan prefix 62 jika sudah ada", () => {
      expect(formatPhoneNumberToJid("6281234567890")).toBe("6281234567890@c.us");
    });
  });

  describe("getOpenWaConfig", () => {
    it("mengembalikan konfigurasi default saat environment kosong", () => {
      delete process.env.WHATSAPP_GATEWAY_ENABLED;
      delete process.env.OPENWA_API_KEY;
      const config = getOpenWaConfig();
      expect(config.enabled).toBe(false);
      expect(config.baseUrl).toBe("http://localhost:2785");
      expect(config.dailyCap).toBe(50);
    });

    it("membaca environment variabel dengan benar saat diaktifkan", () => {
      process.env.WHATSAPP_GATEWAY_ENABLED = "true";
      process.env.OPENWA_BASE_URL = "https://wa.unstoppable.id/";
      process.env.OPENWA_API_KEY = "secret-token-123";
      process.env.OPENWA_SESSION_ID = "demo-session";
      process.env.WHATSAPP_DAILY_CAP = "25";

      const config = getOpenWaConfig();
      expect(config.enabled).toBe(true);
      expect(config.baseUrl).toBe("https://wa.unstoppable.id");
      expect(config.apiKey).toBe("secret-token-123");
      expect(config.sessionId).toBe("demo-session");
      expect(config.dailyCap).toBe(25);
    });
  });

  describe("sendOtpViaWhatsApp", () => {
    it("mengembalikan false jika gateway tidak diaktifkan", async () => {
      process.env.WHATSAPP_GATEWAY_ENABLED = "false";
      const result = await sendOtpViaWhatsApp("081234567890", "123456");
      expect(result).toBe(false);
    });

    it("mengembalikan false jika API key belum diisi", async () => {
      process.env.WHATSAPP_GATEWAY_ENABLED = "true";
      delete process.env.OPENWA_API_KEY;

      const result = await sendOtpViaWhatsApp("081234567890", "123456");
      expect(result).toBe(false);
    });

    it("berhasil mengirim pesan dan mengembalikan true saat gateway merespon 200", async () => {
      process.env.WHATSAPP_GATEWAY_ENABLED = "true";
      process.env.OPENWA_API_KEY = "test-key";
      process.env.OPENWA_BASE_URL = "http://openwa:2785";
      process.env.OPENWA_SESSION_ID = "main";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendOtpViaWhatsApp("081234567890", "654321");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("http://openwa:2785/api/sessions/main/messages/send-text");
      expect(calledInit.method).toBe("POST");
      expect(calledInit.headers["X-API-Key"]).toBe("test-key");

      const body = JSON.parse(calledInit.body);
      expect(body.chatId).toBe("6281234567890@c.us");
      expect(body.text).toContain("654321");
    });

    it("mengembalikan false dengan anggun jika gateway merespon error HTTP 500", async () => {
      process.env.WHATSAPP_GATEWAY_ENABLED = "true";
      process.env.OPENWA_API_KEY = "test-key";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendOtpViaWhatsApp("081234567890", "112233");
      expect(result).toBe(false);
    });

    it("menahan pengiriman jika kuota harian (daily cap) telah tercapai", async () => {
      process.env.WHATSAPP_GATEWAY_ENABLED = "true";
      process.env.OPENWA_API_KEY = "test-key";
      process.env.WHATSAPP_DAILY_CAP = "2";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      const r1 = await sendOtpViaWhatsApp("081234567890", "111111");
      const r2 = await sendOtpViaWhatsApp("081234567891", "222222");
      const r3 = await sendOtpViaWhatsApp("081234567892", "333333");

      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(r3).toBe(false); // Kuota ke-3 terblokir daily cap
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
