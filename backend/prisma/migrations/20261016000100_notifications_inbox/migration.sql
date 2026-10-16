-- B12b (§15.4) -- kotak notifikasi. payload TANPA koordinat. Baris > 90 hari
-- dihapus cleanup.job.ts.
--
-- SQL bawaan Prisma (tabel + index (user_id, created_at)) di atas; partial index
-- unread ditulis manual karena Prisma tidak memodelkan WHERE pada index.

-- CreateTable
CREATE TABLE "notifications" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID NOT NULL,
  "type"       TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "url"        TEXT,
  "payload"    JSONB NOT NULL DEFAULT '{}',
  "read_at"    TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx"
  ON "notifications" ("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Index parsial untuk daftar yang belum dibaca (partial index, manual).
CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
