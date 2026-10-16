-- B9: lifecycle metadata for travel sessions.

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS ended_reason TEXT;

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS arrival_prompted_at TIMESTAMPTZ;

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS arrival_snooze_until TIMESTAMPTZ;

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS wellbeing_check_at TIMESTAMPTZ;

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS stalled_notified_at TIMESTAMPTZ;

ALTER TABLE travel_sessions
  ADD COLUMN IF NOT EXISTS feedback_rating SMALLINT;

-- Keep the newest active session for each user and close older duplicates
-- before creating the partial unique index.
WITH ranked_active_sessions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY started_at DESC, id DESC
    ) AS session_rank
  FROM travel_sessions
  WHERE status = 'active'
)
UPDATE travel_sessions AS session
SET
  status = 'cancelled',
  ended_at = COALESCE(session.ended_at, now()),
  ended_reason = 'replaced'
FROM ranked_active_sessions AS ranked
WHERE session.id = ranked.id
  AND ranked.session_rank > 1;

ALTER TABLE travel_sessions
  DROP CONSTRAINT IF EXISTS chk_ended_reason;

ALTER TABLE travel_sessions
  ADD CONSTRAINT chk_ended_reason
  CHECK (
    ended_reason IS NULL
    OR ended_reason IN ('user', 'arrived_auto', 'timeout', 'replaced', 'sos')
  );

ALTER TABLE travel_sessions
  DROP CONSTRAINT IF EXISTS chk_feedback_rating;

ALTER TABLE travel_sessions
  ADD CONSTRAINT chk_feedback_rating
  CHECK (
    feedback_rating IS NULL
    OR feedback_rating IN (1, 3, 5)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_travel_sessions_one_active
  ON travel_sessions (user_id)
  WHERE status = 'active';
