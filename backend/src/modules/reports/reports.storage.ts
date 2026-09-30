// Upload foto laporan ke Supabase Storage. DB hanya menyimpan URL publiknya
// (ReportPhoto.photoUrl), tidak pernah binary di Postgres.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { AppError } from "../../shared/errors.js";

const BUCKET = "road-report-photos";

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AppError("INTERNAL_ERROR", "Konfigurasi penyimpanan foto belum lengkap.", 500);
  }
  return createClient(url, key);
}

export interface UploadedPhoto {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

// Mengembalikan URL publik dalam urutan yang sama dengan input. Kalau salah
// satu upload gagal, lempar AppError -- laporan jangan tersimpan dengan foto
// yang sebagian hilang diam-diam.
export async function uploadReportPhotos(reportId: string, photos: UploadedPhoto[]): Promise<string[]> {
  if (photos.length === 0) return [];

  const supabase = getClient();
  const urls: string[] = [];

  for (const photo of photos) {
    const ext = photo.originalName.split(".").pop() || "jpg";
    const path = `${reportId}/${randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, photo.buffer, { contentType: photo.mimeType, upsert: false });

    if (error) {
      throw new AppError("INTERNAL_ERROR", "Gagal mengunggah foto laporan. Silakan coba lagi.", 500, {
        storageError: error.message,
      });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}
