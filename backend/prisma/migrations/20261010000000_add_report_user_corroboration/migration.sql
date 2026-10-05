-- CreateTable
CREATE TABLE "report_user_corroborations" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_user_corroborations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_user_corroborations_user_id_idx" ON "report_user_corroborations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_user_corroborations_report_id_user_id_key" ON "report_user_corroborations"("report_id", "user_id");

-- AddForeignKey
ALTER TABLE "report_user_corroborations" ADD CONSTRAINT "report_user_corroborations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "road_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_user_corroborations" ADD CONSTRAINT "report_user_corroborations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
