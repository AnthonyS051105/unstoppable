import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { AppError } from "../../shared/errors.js";

export const BUCKET_NAME = "volunteer-identities";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MiB
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 jam
const MAX_UPLOADS_PER_WINDOW = 5;

// In-memory rate limiting per user ID untuk mencegah spam upload
const uploadTimestamps = new Map<string, number[]>();

export function checkUploadRateLimit(userId: string): void {
  const now = Date.now();
  const timestamps = (uploadTimestamps.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_UPLOADS_PER_WINDOW) {
    throw new AppError(
      "RATE_LIMITED",
      "Batas pengunggahan dokumen identitas tercapai (maksimal 5 kali per jam). Silakan coba lagi nanti.",
      429,
    );
  }
  timestamps.push(now);
  uploadTimestamps.set(userId, timestamps);
}

export function resetUploadRateLimitForTest(): void {
  uploadTimestamps.clear();
}

export function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AppError("INTERNAL_ERROR", "Konfigurasi penyimpanan identitas belum lengkap.", 503);
  }
  return createClient(url, key);
}

export async function checkBucketPrivate(): Promise<void> {
  const supabase = getStorageClient();
  const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
  if (error || !data || data.public !== false) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Layanan penyimpanan dokumen identitas belum tersedia atau tidak aman (bucket belum dibuat atau tidak privat).",
      503,
      { storageError: error?.message },
    );
  }
}

export function validateMagicBytes(buffer: Buffer, mimeType: string): void {
  if (buffer.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Berkas dokumen identitas kosong.", 400);
  }

  const isJpeg =
    mimeType === "image/jpeg" &&
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isPng =
    mimeType === "image/png" &&
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (!isJpeg && !isPng) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Format berkas tidak valid. Hanya berkas JPEG atau PNG asli yang diizinkan.",
      400,
    );
  }
}

export const CANONICAL_REF_REGEX = /^storage:\/\/volunteer-identities\/([0-9a-fA-F-]{36})\/([0-9a-fA-F-]{36}\.(?:jpg|png))$/;

export async function uploadIdentityDocument(
  userId: string,
  file: { buffer: Buffer; mimetype: string; size: number },
): Promise<{ idCardUrl: string; mimeType: string; sizeBytes: number }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new AppError("VALIDATION_ERROR", "Ukuran dokumen identitas maksimal 5 MB.", 400);
  }

  validateMagicBytes(file.buffer, file.mimetype);
  checkUploadRateLimit(userId);
  await checkBucketPrivate();

  const supabase = getStorageClient();
  const ext = file.mimetype === "image/png" ? "png" : "jpg";
  const objectPath = `${userId}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET_NAME).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
    metadata: { ownerId: userId },
  });

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Gagal menyimpan dokumen identitas ke penyimpanan.", 503, {
      storageError: error.message,
    });
  }

  return {
    idCardUrl: `storage://${BUCKET_NAME}/${objectPath}`,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
}

export async function getIdentitySignedUrl(
  canonicalRef: string,
  requesterUserId: string,
  isAdmin: boolean,
): Promise<{ url: string; expiresInSeconds: number }> {
  const match = canonicalRef.match(CANONICAL_REF_REGEX);
  if (!match) {
    throw new AppError("VALIDATION_ERROR", "Format referensi kartu identitas tidak valid.", 400);
  }

  const ownerId = match[1];
  const objectFile = match[2];

  if (!isAdmin && ownerId !== requesterUserId) {
    throw new AppError("FORBIDDEN", "Anda tidak memiliki izin mengakses dokumen ini.", 403);
  }

  await checkBucketPrivate();

  const supabase = getStorageClient();
  const objectPath = `${ownerId}/${objectFile}`;

  const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(objectPath, 60);

  if (error || !data?.signedUrl) {
    throw new AppError("NOT_FOUND", "Dokumen identitas tidak ditemukan pada penyimpanan.", 404, {
      storageError: error?.message,
    });
  }

  return {
    url: data.signedUrl,
    expiresInSeconds: 60,
  };
}
