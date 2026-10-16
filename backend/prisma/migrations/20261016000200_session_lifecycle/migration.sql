-- B9/B10/B11 (§15.3) -- kolom siklus hidup sesi: tiba otomatis, jeda layar,
-- notifikasi terlambat/terhenti, batas waktu, umpan balik. status TIDAK
-- bertambah; beda dicatat di ended_reason. Unique index + CHECK ditulis manual
-- (Prisma tak memodelkan partial unique index & CHECK).

-- AlterTable
ALTER TABLE "travel_sessions"
  ADD COLUMN "ended_reason"         TEXT,
  ADD COLUMN "paused_at"            TIMESTAMPTZ(6),
  ADD COLUMN "arrival_prompted_at"  TIMESTAMPTZ(6),
  ADD COLUMN "arrival_snooze_until" TIMESTAMPTZ(6),
  ADD COLUMN "overdue_notified_at"  TIMESTAMPTZ(6),
  ADD COLUMN "wellbeing_check_at"   TIMESTAMPTZ(6),
  ADD COLUMN "stalled_notified_at"  TIMESTAMPTZ(6),
  ADD COLUMN "feedback_rating"      SMALLINT;

-- Sebelum unique index: akhiri sesi aktif ganda yang sudah ada, simpan yang terbaru.
UPDATE travel_sessions t SET status = 'cancelled', ended_at = now(), ended_reason = 'replaced'
 WHERE t.status = 'active'
   AND EXISTS (SELECT 1 FROM travel_sessions n
                WHERE n.user_id = t.user_id AND n.status = 'active' AND n.started_at > t.started_at);

-- Satu pengguna hanya boleh punya satu sesi aktif.
CREATE UNIQUE INDEX IF NOT EXISTS uq_travel_sessions_one_active
  ON travel_sessions (user_id) WHERE status = 'active';

ALTER TABLE travel_sessions DROP CONSTRAINT IF EXISTS chk_ended_reason;
ALTER TABLE travel_sessions ADD CONSTRAINT chk_ended_reason
  CHECK (ended_reason IS NULL OR ended_reason IN ('user', 'arrived_auto', 'timeout', 'replaced', 'sos'));
