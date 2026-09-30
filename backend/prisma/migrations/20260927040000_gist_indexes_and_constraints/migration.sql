CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

CREATE INDEX IF NOT EXISTS idx_path_nodes_location ON path_nodes USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_path_edges_geometry ON path_edges USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_road_reports_location ON road_reports USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_vol_avail_center ON volunteer_availability USING GIST(center_point);
CREATE INDEX IF NOT EXISTS idx_buildings_location ON buildings USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_companion_dest ON companion_requests USING GIST(destination_location);

CREATE INDEX IF NOT EXISTS idx_path_edges_routing ON path_edges (source_node_id, target_node_id) WHERE status = 'approved' AND is_operational = TRUE;

ALTER TABLE path_edges DROP CONSTRAINT IF EXISTS chk_edge_not_self;
ALTER TABLE path_edges ADD CONSTRAINT chk_edge_not_self CHECK (source_node_id <> target_node_id);
ALTER TABLE path_edges DROP CONSTRAINT IF EXISTS chk_slope_range;
ALTER TABLE path_edges ADD CONSTRAINT chk_slope_range CHECK (slope_percent IS NULL OR slope_percent BETWEEN -30 AND 30);
ALTER TABLE path_edges DROP CONSTRAINT IF EXISTS chk_step_consistency;
ALTER TABLE path_edges ADD CONSTRAINT chk_step_consistency CHECK ((has_stairs = FALSE AND step_count = 0) OR (has_stairs = TRUE AND step_count > 0));

ALTER TABLE report_edge_links DROP CONSTRAINT IF EXISTS chk_link_target;
ALTER TABLE report_edge_links ADD CONSTRAINT chk_link_target CHECK ( 
    (edge_id IS NOT NULL AND node_id IS NULL) OR
    (edge_id IS NULL AND node_id IS NOT NULL)
);
ALTER TABLE volunteer_profiles DROP CONSTRAINT IF EXISTS chk_capability_requires_verification;
ALTER TABLE volunteer_profiles
  ADD CONSTRAINT chk_capability_requires_verification
  CHECK ((can_companion = FALSE AND can_map_data = FALSE)
         OR verification_status = 'verified');

ALTER TABLE road_reports DROP CONSTRAINT IF EXISTS chk_corroboration_min;
ALTER TABLE road_reports ADD CONSTRAINT chk_corroboration_min CHECK (corroboration_count >= 1);
ALTER TABLE companion_requests DROP CONSTRAINT IF EXISTS chk_rating_range;
ALTER TABLE companion_requests
  ADD CONSTRAINT chk_rating_range CHECK (
    (requester_rating IS NULL OR requester_rating BETWEEN 1 AND 5) AND
    (volunteer_rating IS NULL OR volunteer_rating BETWEEN 1 AND 5)
);