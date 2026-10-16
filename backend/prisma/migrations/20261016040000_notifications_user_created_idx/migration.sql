-- Index (user_id, created_at) dideklarasikan di schema.prisma (@@index) tetapi
-- tidak dibuat oleh 20261016030000_notification_inbox_push -> drift migrate dev.
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx"
  ON "notifications" ("user_id", "created_at");
