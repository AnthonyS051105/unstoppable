-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_topology";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "password_hash" TEXT,
    "profile_photo_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blind_user_profiles" (
    "user_id" UUID NOT NULL,
    "tts_speed_percent" INTEGER NOT NULL DEFAULT 100,
    "tts_voice_lang" TEXT NOT NULL DEFAULT 'id-ID',
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "motion_calibration_data" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blind_user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "volunteer_profiles" (
    "user_id" UUID NOT NULL,
    "verification_status" TEXT NOT NULL DEFAULT 'pending',
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_helps" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),

    CONSTRAINT "volunteer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "caregiver_relationships" (
    "id" UUID NOT NULL,
    "blind_user_id" UUID NOT NULL,
    "caregiver_id" UUID NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "location_sharing_mode" TEXT NOT NULL DEFAULT 'full',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caregiver_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guiding_block_segments" (
    "id" UUID NOT NULL,
    "osm_way_id" BIGINT,
    "geom" geography(LineString, 4326) NOT NULL,
    "has_guiding_block" BOOLEAN NOT NULL DEFAULT false,
    "guiding_block_condition" TEXT,
    "is_validated" BOOLEAN NOT NULL DEFAULT false,
    "validation_report_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guiding_block_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zebra_crossings" (
    "id" UUID NOT NULL,
    "osm_node_id" BIGINT,
    "location" geography(Point, 4326) NOT NULL,
    "crossing_type" TEXT,
    "has_traffic_signal" BOOLEAN NOT NULL DEFAULT false,
    "is_validated" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zebra_crossings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "segment_id" UUID,
    "crossing_id" UUID,
    "location" geography(Point, 4326) NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "corroboration_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_photos" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "photo_url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_corroborations" (
    "id" UUID NOT NULL,
    "source_report_id" UUID NOT NULL,
    "target_report_id" UUID NOT NULL,
    "distance_meters" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_corroborations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_routes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "origin" geography(Point, 4326) NOT NULL,
    "destination" geography(Point, 4326) NOT NULL,
    "routeGeometry" geography(LineString, 4326) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "origin" geography(Point, 4326) NOT NULL,
    "destination" geography(Point, 4326) NOT NULL,
    "routeGeometry" geography(LineString, 4326) NOT NULL,
    "estimated_arrival" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "travel_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_pings" (
    "id" BIGSERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "location" geography(Point, 4326) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sos_incidents" (
    "id" UUID NOT NULL,
    "session_id" UUID,
    "user_id" UUID NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "location" geography(Point, 4326) NOT NULL,
    "audio_recording_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "sos_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sos_responses" (
    "id" UUID NOT NULL,
    "sos_id" UUID NOT NULL,
    "volunteer_id" UUID NOT NULL,
    "response_status" TEXT NOT NULL,
    "responded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_notifications" (
    "id" UUID NOT NULL,
    "sos_id" UUID NOT NULL,
    "caregiver_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "delivery_status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),

    CONSTRAINT "caregiver_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_planner_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_planner_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_planner_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "input_mode" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_planner_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_planner_extractions" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "destination_text" TEXT,
    "destinationLocation" geography(Point, 4326),
    "planned_time" TIMESTAMPTZ(6),
    "context_notes" TEXT,
    "clarification_rounds" INTEGER NOT NULL DEFAULT 0,
    "resulting_session_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_planner_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_place_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "place_name" TEXT NOT NULL,
    "placeLocation" geography(Point, 4326) NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 1,
    "last_visited_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_place_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "caregiver_relationships_caregiver_id_idx" ON "caregiver_relationships"("caregiver_id");

-- CreateIndex
CREATE UNIQUE INDEX "caregiver_relationships_blind_user_id_caregiver_id_key" ON "caregiver_relationships"("blind_user_id", "caregiver_id");

-- CreateIndex
CREATE INDEX "road_reports_reporter_id_idx" ON "road_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "road_reports_segment_id_idx" ON "road_reports"("segment_id");

-- CreateIndex
CREATE INDEX "road_reports_crossing_id_idx" ON "road_reports"("crossing_id");

-- CreateIndex
CREATE INDEX "report_photos_report_id_idx" ON "report_photos"("report_id");

-- CreateIndex
CREATE INDEX "report_corroborations_target_report_id_idx" ON "report_corroborations"("target_report_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_corroborations_source_report_id_target_report_id_key" ON "report_corroborations"("source_report_id", "target_report_id");

-- CreateIndex
CREATE INDEX "saved_routes_user_id_idx" ON "saved_routes"("user_id");

-- CreateIndex
CREATE INDEX "travel_sessions_user_id_idx" ON "travel_sessions"("user_id");

-- CreateIndex
CREATE INDEX "location_pings_session_id_recorded_at_idx" ON "location_pings"("session_id", "recorded_at");

-- CreateIndex
CREATE INDEX "sos_incidents_user_id_idx" ON "sos_incidents"("user_id");

-- CreateIndex
CREATE INDEX "sos_incidents_session_id_idx" ON "sos_incidents"("session_id");

-- CreateIndex
CREATE INDEX "sos_responses_volunteer_id_idx" ON "sos_responses"("volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sos_responses_sos_id_volunteer_id_key" ON "sos_responses"("sos_id", "volunteer_id");

-- CreateIndex
CREATE INDEX "caregiver_notifications_caregiver_id_idx" ON "caregiver_notifications"("caregiver_id");

-- CreateIndex
CREATE INDEX "caregiver_notifications_sos_id_idx" ON "caregiver_notifications"("sos_id");

-- CreateIndex
CREATE INDEX "ai_planner_conversations_user_id_idx" ON "ai_planner_conversations"("user_id");

-- CreateIndex
CREATE INDEX "ai_planner_messages_conversation_id_idx" ON "ai_planner_messages"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_planner_extractions_resulting_session_id_key" ON "ai_planner_extractions"("resulting_session_id");

-- CreateIndex
CREATE INDEX "ai_planner_extractions_conversation_id_idx" ON "ai_planner_extractions"("conversation_id");

-- CreateIndex
CREATE INDEX "user_place_preferences_user_id_idx" ON "user_place_preferences"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_user_id_idx" ON "audit_logs"("target_user_id");

-- AddForeignKey
ALTER TABLE "blind_user_profiles" ADD CONSTRAINT "blind_user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profiles" ADD CONSTRAINT "volunteer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_relationships" ADD CONSTRAINT "caregiver_relationships_blind_user_id_fkey" FOREIGN KEY ("blind_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_relationships" ADD CONSTRAINT "caregiver_relationships_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_reports" ADD CONSTRAINT "road_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_reports" ADD CONSTRAINT "road_reports_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "guiding_block_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_reports" ADD CONSTRAINT "road_reports_crossing_id_fkey" FOREIGN KEY ("crossing_id") REFERENCES "zebra_crossings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "road_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_corroborations" ADD CONSTRAINT "report_corroborations_source_report_id_fkey" FOREIGN KEY ("source_report_id") REFERENCES "road_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_corroborations" ADD CONSTRAINT "report_corroborations_target_report_id_fkey" FOREIGN KEY ("target_report_id") REFERENCES "road_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_sessions" ADD CONSTRAINT "travel_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "travel_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_incidents" ADD CONSTRAINT "sos_incidents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "travel_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_incidents" ADD CONSTRAINT "sos_incidents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_responses" ADD CONSTRAINT "sos_responses_sos_id_fkey" FOREIGN KEY ("sos_id") REFERENCES "sos_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_responses" ADD CONSTRAINT "sos_responses_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_notifications" ADD CONSTRAINT "caregiver_notifications_sos_id_fkey" FOREIGN KEY ("sos_id") REFERENCES "sos_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_notifications" ADD CONSTRAINT "caregiver_notifications_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_planner_conversations" ADD CONSTRAINT "ai_planner_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_planner_messages" ADD CONSTRAINT "ai_planner_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_planner_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_planner_extractions" ADD CONSTRAINT "ai_planner_extractions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_planner_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_planner_extractions" ADD CONSTRAINT "ai_planner_extractions_resulting_session_id_fkey" FOREIGN KEY ("resulting_session_id") REFERENCES "travel_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_place_preferences" ADD CONSTRAINT "user_place_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
