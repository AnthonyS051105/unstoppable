import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGmailSmtpConfig, maskEmail, sendOtpViaEmail, setTransporter } from "../email.service.js";

describe("Email Service - Gmail SMTP Nodemailer Integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    setTransporter(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    setTransporter(null);
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

  describe("getGmailSmtpConfig", () => {
    it("mengembalikan nilai default saat environment kosong", () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.SMTP_FROM;

      const config = getGmailSmtpConfig();
      expect(config.user).toBe("");
      expect(config.pass).toBe("");
      expect(config.from).toBe("UNSTOPPABLE <noreply@unstoppable.id>");
    });

    it("membaca variabel environment yang ditentukan", () => {
      process.env.SMTP_USER = "auth.test@gmail.com";
      process.env.SMTP_PASS = "abcdefghijklmnop";
      process.env.SMTP_FROM = "UNSTOPPABLE Team <auth.test@gmail.com>";

      const config = getGmailSmtpConfig();
      expect(config.user).toBe("auth.test@gmail.com");
      expect(config.pass).toBe("abcdefghijklmnop");
      expect(config.from).toBe("UNSTOPPABLE Team <auth.test@gmail.com>");
    });
  });

  describe("sendOtpViaEmail", () => {
    it("mengembalikan false jika kredensial SMTP_USER atau SMTP_PASS kosong", async () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      const result = await sendOtpViaEmail("user@example.com", "123456");
      expect(result).toBe(false);
    });

    it("berhasil mengirim email via Nodemailer transporter dan mengembalikan true", async () => {
      process.env.SMTP_USER = "sender@gmail.com";
      process.env.SMTP_PASS = "pass1234pass1234";

      const mockSendMail = vi.fn().mockResolvedValue({ messageId: "<msg-123@gmail.com>" });
      setTransporter({
        sendMail: mockSendMail,
      } as any);

      const result = await sendOtpViaEmail("pengguna@gmail.com", "789012");
      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.to).toBe("pengguna@gmail.com");
      expect(mailOptions.subject).toContain("789012");
      expect(mailOptions.html).toContain("789012");
    });

    it("mengembalikan false dengan aman jika Nodemailer sendMail gagal / throw error", async () => {
      process.env.SMTP_USER = "sender@gmail.com";
      process.env.SMTP_PASS = "pass1234pass1234";

      const mockSendMail = vi.fn().mockRejectedValue(new Error("535 Authentication failed"));
      setTransporter({
        sendMail: mockSendMail,
      } as any);

      const result = await sendOtpViaEmail("pengguna@gmail.com", "789012");
      expect(result).toBe(false);
    });
  });
});
