-- AlterTable users: Tambah kolom email dan buat phone_number nullable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
ALTER TABLE "users" ALTER COLUMN "phone_number" DROP NOT NULL;

-- AlterTable otp_verifications: Tambah kolom email, index, dan buat phone_number nullable
ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "email" TEXT;
CREATE INDEX IF NOT EXISTS "otp_verifications_email_created_at_idx" ON "otp_verifications"("email", "created_at");
ALTER TABLE "otp_verifications" ALTER COLUMN "phone_number" DROP NOT NULL;
