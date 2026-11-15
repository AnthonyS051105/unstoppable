/**
 * Menyamarkan alamat email untuk log keamanan, mis. "anthony@example.com" -> "an****@example.com".
 */
export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const visible = local.slice(0, 2);
  return `${visible}****@${domain}`;
}

export interface ResendEmailConfig {
  apiKey: string;
  fromEmail: string;
  defaultRecipient: string;
}

/** Mengambil konfigurasi Resend dari environment variables. */
export function getResendConfig(): ResendEmailConfig {
  return {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "UNSTOPPABLE <onboarding@resend.dev>",
    defaultRecipient: process.env.RESEND_DEFAULT_RECIPIENT || "",
  };
}

/**
 * Mengirimkan email OTP menggunakan REST API resmi Resend (https://api.resend.com/emails).
 * Mengembalikan true jika berhasil terkirim, false jika API key tidak tersedia atau request gagal.
 */
export async function sendOtpViaEmail(
  recipientIdentifier: string,
  otp: string,
): Promise<boolean> {
  const config = getResendConfig();

  if (!config.apiKey) {
    return false;
  }

  // Tentukan alamat email tujuan. Jika input berupa email gunakan langsung,
  // jika nomor telepon gunakan default recipient yang dikonfigurasi di env.
  let targetEmail = recipientIdentifier;
  if (!recipientIdentifier.includes("@")) {
    if (!config.defaultRecipient) {
      console.warn(
        `[RESEND-EMAIL] Pengguna mendaftar dengan nomor telepon dan RESEND_DEFAULT_RECIPIENT belum diatur. Menggunakan log dev.`,
      );
      return false;
    }
    targetEmail = config.defaultRecipient;
  }

  const subject = `Kode Verifikasi UNSTOPPABLE: ${otp}`;
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kode Verifikasi UNSTOPPABLE</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111827; padding: 24px; max-width: 560px; margin: 0 auto;">
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout 5 detik

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [targetEmail],
        subject,
        html: htmlContent,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(
        `[RESEND-EMAIL] Gagal mengirim email ke ${maskEmail(targetEmail)}: HTTP ${response.status} ${errBody}`,
      );
      return false;
    }

    console.info(`[RESEND-EMAIL] Berhasil mengirimkan kode OTP ke ${maskEmail(targetEmail)}.`);
    return true;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`[RESEND-EMAIL] Timeout saat memanggil Resend API untuk ${maskEmail(targetEmail)}.`);
    } else {
      console.warn(`[RESEND-EMAIL] Gangguan jaringan saat memanggil Resend API: ${error.message}`);
    }
    return false;
  }
}
