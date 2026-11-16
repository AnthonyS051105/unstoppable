import nodemailer, { type Transporter } from "nodemailer";

/**
 * Menyamarkan alamat email untuk log keamanan, mis. "anthony@example.com" -> "an****@example.com".
 */
export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local = "", domain = ""] = parts;
  if (local.length <= 2) {
    return `${local.charAt(0)}*@${domain}`;
  }
  const visible = local.slice(0, 2);
  return `${visible}****@${domain}`;
}

export interface GmailSmtpConfig {
  user: string;
  pass: string;
  from: string;
}

/** Mengambil konfigurasi Gmail SMTP dari environment variables. */
export function getGmailSmtpConfig(): GmailSmtpConfig {
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const from = process.env.SMTP_FROM || (user ? `UNSTOPPABLE <${user}>` : "UNSTOPPABLE <noreply@unstoppable.id>");
  return { user, pass, from };
}

let cachedTransporter: Transporter | null = null;

export function getTransporter(): Transporter | null {
  const config = getGmailSmtpConfig();
  if (!config.user || !config.pass) {
    return null;
  }
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }
  return cachedTransporter;
}

/** Mereset transporter untuk kebutuhan testing. */
export function setTransporter(transporter: Transporter | null) {
  cachedTransporter = transporter;
}

/**
 * Mengirimkan email OTP menggunakan Gmail SMTP via Nodemailer (https://nodemailer.com/guides/using-gmail).
 * Mengembalikan true jika berhasil terkirim, false jika kredensial tidak tersedia atau pengiriman gagal.
 */
export async function sendOtpViaEmail(
  targetEmail: string,
  otp: string,
): Promise<boolean> {
  const config = getGmailSmtpConfig();
  const transporter = getTransporter();

  if (!transporter || !config.user || !config.pass) {
    return false;
  }

  const subject = `Kode Verifikasi UNSTOPPABLE: ${otp}`;
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kode Verifikasi UNSTOPPABLE</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111827; padding: 24px; max-width: 560px; margin: 0 auto; background-color: #f9fafb;">
  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <h2 style="color: #1f2937; margin-top: 0; font-size: 22px;">Verifikasi Akun UNSTOPPABLE</h2>
    <p style="font-size: 15px; color: #4b5563;">Gunakan kode verifikasi berikut untuk melanjutkan proses pendaftaran atau masuk ke akun Anda:</p>
    
    <div style="margin: 28px 0; text-align: center;">
      <span style="display: inline-block; font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #1e40af; background-color: #eff6ff; padding: 12px 24px; border-radius: 8px; border: 1px dashed #3b82f6;">${otp}</span>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">⏱️ Kode ini berlaku selama <strong>5 menit</strong>.</p>
    <p style="font-size: 14px; color: #dc2626; margin-top: 0;">⚠️ Demi keamanan akun Anda, <strong>JANGAN PERNAH</strong> membagikan kode ini kepada siapa pun.</p>

    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-bottom: 0;">UNSTOPPABLE &mdash; Aplikasi Navigasi & Pendampingan Aksesibilitas Lansia</p>
  </div>
</body>
</html>
  `.trim();

  try {
    await transporter.sendMail({
      from: config.from,
      to: targetEmail,
      subject,
      html: htmlContent,
    });

    console.info(`[GMAIL-SMTP] Berhasil mengirimkan kode OTP ke ${maskEmail(targetEmail)}.`);
    return true;
  } catch (error: any) {
    console.warn(
      `[GMAIL-SMTP] Gagal mengirim email ke ${maskEmail(targetEmail)}: ${error.message}`,
    );
    return false;
  }
}
