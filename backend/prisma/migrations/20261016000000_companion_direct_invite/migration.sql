-- B2 (§12.1) -- undangan langsung ke satu relawan.
-- companion_requests + invited_volunteer_id, invite_expires_at; status bertambah
-- 'invited' | 'invite_declined' | 'invite_expired'.
--
-- SQL bawaan Prisma (kolom, FK, index) di atas; partial index dan CHECK ditulis
-- manual karena Prisma tidak memodelkannya, sama seperti migrasi 20261015000000.

-- AlterTable
ALTER TABLE "companion_requests"
  ADD COLUMN "invited_volunteer_id" UUID,
  ADD COLUMN "invite_expires_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "companion_requests_invited_volunteer_id_idx"
  ON "companion_requests" ("invited_volunteer_id");

-- AddForeignKey
ALTER TABLE "companion_requests"
  ADD CONSTRAINT "companion_requests_invited_volunteer_id_fkey"
  FOREIGN KEY ("invited_volunteer_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- §12.1: daftar undangan aktif per relawan (GET /companions/invites, job kedaluwarsa).
CREATE INDEX IF NOT EXISTS idx_companion_invites_pending
  ON companion_requests (invited_volunteer_id, invite_expires_at)
  WHERE status = 'invited';

-- Status 'invited' wajib punya relawan dan batas waktu jawab.
ALTER TABLE companion_requests DROP CONSTRAINT IF EXISTS chk_invite_fields;
ALTER TABLE companion_requests
  ADD CONSTRAINT chk_invite_fields CHECK (
    status <> 'invited' OR (invited_volunteer_id IS NOT NULL AND invite_expires_at IS NOT NULL)
  );
