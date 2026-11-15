import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getResendConfig, maskEmail, sendOtpViaEmail } from "../email.service.js";

describe("Email Service - Resend OTP Integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("maskEmail", () => {
    it("menyamarkan bagian depan alamat email dengan aman", () => {
      expect(maskEmail("anthony@gmail.com")).toBe("an****@gmail.com");
      expect(maskEmail("budi.santoso@ugm.ac.id")).toBe("bu****@ugm.ac.id");
    });

    it("menangani email pendek dengan tepat", () => {
      expect(maskEmail("ab@domain.com")).toBe("a*@domain.com");
    });

    it("mengembalikan string asli jika bukan format email valid", () => {
      expect(maskEmail("081234567890")).toBe("081234567890");
    });
  });

  describe("getResendConfig", () => {
    it("mengembalikan nilai default saat environment kosong", () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;
      delete process.env.RESEND_DEFAULT_RECIPIENT;

      const config = getResendConfig();
      expect(config.apiKey).toBe("");
      expect(config.fromEmail).toBe("UNSTOPPABLE <onboarding@resend.dev>");
      expect(config.defaultRecipient).toBe("");
    });

    it("membaca variabel environment yang ditentukan", () => {
      process.env.RESEND_API_KEY = "re_test_123456";
      process.env.RESEND_FROM_EMAIL = "UNSTOPPABLE Team <auth@unstoppable.id>";
      process.env.RESEND_DEFAULT_RECIPIENT = "demo-tester@example.com";

      const config = getResendConfig();
      expect(config.apiKey).toBe("re_test_123456");
      expect(config.fromEmail).toBe("UNSTOPPABLE Team <auth@unstoppable.id>");
      expect(config.defaultRecipient).toBe("demo-tester@example.com");
    });
  });

  describe("sendOtpViaEmail", () => {
    it("mengembalikan false tanpa network call jika RESEND_API_KEY kosong", async () => {
      delete process.env.RESEND_API_KEY;
      const result = await sendOtpViaEmail("user@example.com", "123456");
      expect(result).toBe(false);
    });

    it("mengembalikan false jika recipient bukan email dan RESEND_DEFAULT_RECIPIENT kosong", async () => {
      process.env.RESEND_API_KEY = "re_test_123";
      delete process.env.RESEND_DEFAULT_RECIPIENT;

      const result = await sendOtpViaEmail("081234567890", "123456");
      expect(result).toBe(false);
    });

    it("berhasil mengirim email via Resend API dan mengembalikan true saat HTTP 200", async () => {
      process.env.RESEND_API_KEY = "re_live_test_api_key";
      process.env.RESEND_FROM_EMAIL = "UNSTOPPABLE <onboarding@resend.dev>";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "email_12345" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendOtpViaEmail("pengguna@example.com", "789012");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("https://api.resend.com/emails");
      expect(calledInit.method).toBe("POST");
      expect(calledInit.headers["Authorization"]).toBe("Bearer re_live_test_api_key");

      const body = JSON.parse(calledInit.body);
      expect(body.from).toBe("UNSTOPPABLE <onboarding@resend.dev>");
      expect(body.to).toEqual(["pengguna@example.com"]);
      expect(body.subject).toContain("789012");
      expect(body.html).toContain("789012");
    });

    it("menggunakan RESEND_DEFAULT_RECIPIENT jika input berupa nomor telepon", async () => {
      process.env.RESEND_API_KEY = "re_live_test_api_key";
      process.env.RESEND_DEFAULT_RECIPIENT = "developer@unstoppable.id";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "email_67890" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendOtpViaEmail("081234567890", "345678");
      expect(result).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.to).toEqual(["developer@unstoppable.id"]);
      expect(body.html).toContain("345678");
    });

    it("mengembalikan false dengan aman jika Resend API merespons error (mis. 401 atau 422)", async () => {
      process.env.RESEND_API_KEY = "re_invalid_key";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: "Invalid API key" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendOtpViaEmail("user@example.com", "999888");
      expect(result).toBe(false);
    });
  });
});
