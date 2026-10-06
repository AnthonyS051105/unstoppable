import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma.js";
async function main() {
    console.log("Starting Database Setup verification...\n");
    const ext = await prisma.$queryRaw `
    SELECT PostGIS_Version() AS postgis_ver, pgr_version() AS pgr_ver
  `;
    assert.ok(ext[0]?.postgis_ver, "PostGIS must be installed");
    assert.ok(ext[0]?.pgr_ver, "pgRouting must be installed");
    console.log(`[PASS] Extensions active: PostGIS (${ext[0].postgis_ver}), pgRouting (${ext[0].pgr_ver}).`);
    const indexes = await prisma.$queryRaw `
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_path_nodes_location',
        'idx_path_edges_geometry',
        'idx_road_reports_location',
        'idx_path_edges_routing'
      )
  `;
    assert.equal(indexes.length, 4, "All required GIST and partial routing indexes must exist");
    console.log("[PASS] Spatial GIST indexes and partial routing index verified.");
    const constraints = await prisma.$queryRaw `
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'chk_edge_not_self',
      'chk_slope_range',
      'chk_step_consistency',
      'chk_link_target',
      'chk_capability_requires_verification',
      'chk_corroboration_min',
      'chk_rating_range'
    )
  `;
    assert.equal(constraints.length, 7, "All 7 integrity CHECK constraints must exist");
    console.log("[PASS] All 7 integrity CHECK constraints verified.");
    console.log("\n[SUCCESS] Database setup verification passed.");
    await prisma.$disconnect();
}
main().catch((err) => {
    console.error("[FAIL] Database setup verification failed:", err);
    process.exit(1);
});
//# sourceMappingURL=db-setup.smoke.test.js.map