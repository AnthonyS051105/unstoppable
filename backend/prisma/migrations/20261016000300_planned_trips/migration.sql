-- B14 (§15.3) -- rencana perjalanan + pengingat "Mulai".
--
-- SQL bawaan Prisma (tabel + FK + index) di atas; index parsial due + CHECK
-- status ditulis manual karena Prisma tidak memodelkannya.

-- CreateTable
CREATE TABLE "planned_trips" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              UUID NOT NULL,
  "destination_name"     TEXT NOT NULL,
  "destination"          geography(Point, 4326) NOT NULL,
  "depart_at"            TIMESTAMPTZ(6) NOT NULL,
  "profile_id"           TEXT,
  "companion_request_id" UUID,
  "status"               TEXT NOT NULL DEFAULT 'planned',
  "session_id"           UUID,
  "reminded_at"          TIMESTAMPTZ(6),
  "late_notified_at"     TIMESTAMPTZ(6),
  "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "planned_trips_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_planned_trip_status" CHECK (status IN ('planned', 'started', 'missed', 'cancelled'))
);

-- AddForeignKey
ALTER TABLE "planned_trips"
  ADD CONSTRAINT "planned_trips_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "planned_trips"
  ADD CONSTRAINT "planned_trips_companion_request_id_fkey"
  FOREIGN KEY ("companion_request_id") REFERENCES "companion_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "planned_trips"
  ADD CONSTRAINT "planned_trips_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "travel_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index parsial untuk job pengingat: hanya rencana yang masih 'planned'.
CREATE INDEX idx_planned_trips_due ON planned_trips (depart_at) WHERE status = 'planned';
