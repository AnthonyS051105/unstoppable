/*
  Warnings:

  - You are about to drop the column `destinationLocation` on the `ai_planner_extractions` table. All the data in the column will be lost.
  - You are about to drop the column `crossing_id` on the `road_reports` table. All the data in the column will be lost.
  - You are about to drop the column `segment_id` on the `road_reports` table. All the data in the column will be lost.
  - You are about to drop the column `routeGeometry` on the `saved_routes` table. All the data in the column will be lost.
  - You are about to drop the column `routeGeometry` on the `travel_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `placeLocation` on the `user_place_preferences` table. All the data in the column will be lost.
  - You are about to drop the `guiding_block_segments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `zebra_crossings` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `place_location` to the `user_place_preferences` table without a default value. This is not possible if the table is not empty.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgrouting";

-- DropForeignKey
ALTER TABLE "road_reports" DROP CONSTRAINT "road_reports_crossing_id_fkey";

-- DropForeignKey
ALTER TABLE "road_reports" DROP CONSTRAINT "road_reports_segment_id_fkey";

-- DropIndex
DROP INDEX "road_reports_crossing_id_idx";

-- DropIndex
DROP INDEX "road_reports_segment_id_idx";

-- AlterTable
ALTER TABLE "ai_planner_extractions" DROP COLUMN "destinationLocation",
ADD COLUMN     "destination_location" geography(Point, 4326);

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "resource_id" TEXT,
ADD COLUMN     "resource_type" TEXT;

-- AlterTable
ALTER TABLE "caregiver_relationships" ALTER COLUMN "location_sharing_mode" SET DEFAULT 'sos_only';

-- AlterTable
ALTER TABLE "location_pings" ADD COLUMN     "accuracy_m" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "road_reports" DROP COLUMN "crossing_id",
DROP COLUMN "segment_id",
ADD COLUMN     "expires_at" TIMESTAMPTZ(6),
ALTER COLUMN "corroboration_count" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "saved_routes" DROP COLUMN "routeGeometry",
ADD COLUMN     "edge_ids" BIGINT[],
ADD COLUMN     "profile_id" TEXT;

-- AlterTable
ALTER TABLE "sos_incidents" ADD COLUMN     "escalation_level" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "travel_sessions" DROP COLUMN "routeGeometry",
ADD COLUMN     "destination_name" TEXT,
ADD COLUMN     "edge_ids" BIGINT[],
ADD COLUMN     "last_ping_at" TIMESTAMPTZ(6),
ADD COLUMN     "profile_id" TEXT;

-- AlterTable
ALTER TABLE "user_place_preferences" DROP COLUMN "placeLocation",
ADD COLUMN     "place_location" geography(Point, 4326) NOT NULL;

-- AlterTable
ALTER TABLE "volunteer_profiles" ADD COLUMN     "can_companion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "can_map_data" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancel_count" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "guiding_block_segments";

-- DropTable
DROP TABLE "zebra_crossings";

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'register',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessibility_profiles" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "primary_channel" TEXT NOT NULL,
    "weight_config" JSONB NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "accessibility_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_accessibility_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "profile_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "tolerance_overrides" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_accessibility_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "faculty" TEXT,
    "location" geography(Point, 4326) NOT NULL,
    "floor_count" INTEGER NOT NULL DEFAULT 1,
    "has_lift" BOOLEAN NOT NULL DEFAULT false,
    "has_accessible_toilet" BOOLEAN NOT NULL DEFAULT false,
    "accessibility_score" DECIMAL(4,1),
    "score_computed_at" TIMESTAMPTZ(6),
    "surveyed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_nodes" (
    "id" BIGSERIAL NOT NULL,
    "building_id" UUID,
    "floor_level" INTEGER NOT NULL DEFAULT 0,
    "node_type" TEXT NOT NULL,
    "name" TEXT,
    "location" geography(Point, 4326) NOT NULL,
    "osm_node_id" BIGINT,
    "crossing_type" TEXT,
    "has_traffic_signal" BOOLEAN NOT NULL DEFAULT false,
    "is_operational" BOOLEAN NOT NULL DEFAULT true,
    "operational_note" TEXT,
    "operational_until" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "approved_by" UUID,
    "reject_reason" TEXT,
    "surveyed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "path_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_edges" (
    "id" BIGSERIAL NOT NULL,
    "source_node_id" BIGINT NOT NULL,
    "target_node_id" BIGINT NOT NULL,
    "geometry" geography(LineString, 4326) NOT NULL,
    "length_m" DECIMAL(8,2) NOT NULL,
    "surface_type" TEXT,
    "width_cm" INTEGER,
    "has_stairs" BOOLEAN NOT NULL DEFAULT false,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "slope_percent" DECIMAL(4,1),
    "has_handrail" BOOLEAN NOT NULL DEFAULT false,
    "is_covered" BOOLEAN NOT NULL DEFAULT false,
    "is_indoor" BOOLEAN NOT NULL DEFAULT false,
    "is_one_way" BOOLEAN NOT NULL DEFAULT false,
    "osm_way_id" BIGINT,
    "has_guiding_block" BOOLEAN NOT NULL DEFAULT false,
    "guiding_block_condition" TEXT,
    "is_operational" BOOLEAN NOT NULL DEFAULT true,
    "operational_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "approved_by" UUID,
    "reject_reason" TEXT,
    "surveyed_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "path_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_edge_links" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "edge_id" BIGINT,
    "node_id" BIGINT,
    "effect" TEXT NOT NULL DEFAULT 'degrade',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_edge_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_availability" (
    "id" UUID NOT NULL,
    "volunteer_id" UUID NOT NULL,
    "center_point" geography(Point, 4326) NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 3000,
    "day_of_week" INTEGER,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_requests" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "destination_name" TEXT NOT NULL,
    "destination_location" geography(Point, 4326) NOT NULL,
    "meeting_point_location" geography(Point, 4326),
    "meeting_point_note" TEXT,
    "scheduled_start" TIMESTAMPTZ(6) NOT NULL,
    "estimated_duration_min" INTEGER,
    "assistance_types" TEXT[],
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "selected_volunteer_id" UUID,
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "requester_rating" INTEGER,
    "volunteer_rating" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_offers" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "volunteer_id" UUID NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_checkins" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "checkin_type" TEXT NOT NULL,
    "location" geography(Point, 4326),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_verifications_phone_number_created_at_idx" ON "otp_verifications"("phone_number", "created_at");

-- CreateIndex
CREATE INDEX "otp_verifications_user_id_consumed_at_idx" ON "otp_verifications"("user_id", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "user_accessibility_profiles_user_id_idx" ON "user_accessibility_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_accessibility_profiles_user_id_profile_id_key" ON "user_accessibility_profiles"("user_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_code_key" ON "buildings"("code");

-- CreateIndex
CREATE INDEX "buildings_faculty_idx" ON "buildings"("faculty");

-- CreateIndex
CREATE INDEX "path_nodes_building_id_floor_level_idx" ON "path_nodes"("building_id", "floor_level");

-- CreateIndex
CREATE INDEX "path_nodes_status_idx" ON "path_nodes"("status");

-- CreateIndex
CREATE INDEX "path_nodes_node_type_idx" ON "path_nodes"("node_type");

-- CreateIndex
CREATE INDEX "path_edges_source_node_id_idx" ON "path_edges"("source_node_id");

-- CreateIndex
CREATE INDEX "path_edges_target_node_id_idx" ON "path_edges"("target_node_id");

-- CreateIndex
CREATE INDEX "path_edges_status_idx" ON "path_edges"("status");

-- CreateIndex
CREATE INDEX "report_edge_links_report_id_idx" ON "report_edge_links"("report_id");

-- CreateIndex
CREATE INDEX "report_edge_links_edge_id_idx" ON "report_edge_links"("edge_id");

-- CreateIndex
CREATE INDEX "report_edge_links_node_id_idx" ON "report_edge_links"("node_id");

-- CreateIndex
CREATE INDEX "volunteer_availability_volunteer_id_idx" ON "volunteer_availability"("volunteer_id");

-- CreateIndex
CREATE INDEX "volunteer_availability_is_active_idx" ON "volunteer_availability"("is_active");

-- CreateIndex
CREATE INDEX "companion_requests_requester_id_idx" ON "companion_requests"("requester_id");

-- CreateIndex
CREATE INDEX "companion_requests_status_scheduled_start_idx" ON "companion_requests"("status", "scheduled_start");

-- CreateIndex
CREATE INDEX "companion_requests_selected_volunteer_id_idx" ON "companion_requests"("selected_volunteer_id");

-- CreateIndex
CREATE INDEX "companion_offers_volunteer_id_idx" ON "companion_offers"("volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "companion_offers_request_id_volunteer_id_key" ON "companion_offers"("request_id", "volunteer_id");

-- CreateIndex
CREATE INDEX "companion_checkins_request_id_idx" ON "companion_checkins"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "companion_checkins_request_id_actor_id_checkin_type_key" ON "companion_checkins"("request_id", "actor_id", "checkin_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "road_reports_status_idx" ON "road_reports"("status");

-- CreateIndex
CREATE INDEX "sos_incidents_status_created_at_idx" ON "sos_incidents"("status", "created_at");

-- CreateIndex
CREATE INDEX "travel_sessions_status_last_ping_at_idx" ON "travel_sessions"("status", "last_ping_at");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "volunteer_profiles_verification_status_idx" ON "volunteer_profiles"("verification_status");

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accessibility_profiles" ADD CONSTRAINT "user_accessibility_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accessibility_profiles" ADD CONSTRAINT "user_accessibility_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "accessibility_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_nodes" ADD CONSTRAINT "path_nodes_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_nodes" ADD CONSTRAINT "path_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_nodes" ADD CONSTRAINT "path_nodes_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_edges" ADD CONSTRAINT "path_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "path_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_edges" ADD CONSTRAINT "path_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "path_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_edges" ADD CONSTRAINT "path_edges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_edges" ADD CONSTRAINT "path_edges_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_edge_links" ADD CONSTRAINT "report_edge_links_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "road_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_edge_links" ADD CONSTRAINT "report_edge_links_edge_id_fkey" FOREIGN KEY ("edge_id") REFERENCES "path_edges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_edge_links" ADD CONSTRAINT "report_edge_links_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "path_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_availability" ADD CONSTRAINT "volunteer_availability_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_requests" ADD CONSTRAINT "companion_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_requests" ADD CONSTRAINT "companion_requests_selected_volunteer_id_fkey" FOREIGN KEY ("selected_volunteer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_offers" ADD CONSTRAINT "companion_offers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "companion_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_offers" ADD CONSTRAINT "companion_offers_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_checkins" ADD CONSTRAINT "companion_checkins_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "companion_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_checkins" ADD CONSTRAINT "companion_checkins_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
