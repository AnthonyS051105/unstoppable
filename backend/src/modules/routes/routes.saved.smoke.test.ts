// Smoke test — saved routes CRUD (docs/API_CONTRACT.md §5, task 8).
// Script manual (butuh DB Supabase nyata), DIKECUALIKAN dari `npm test`/vitest
// (lihat vitest.config.ts) — jalankan dengan:
//   npx tsx src/modules/routes/routes.saved.smoke.test.ts
//
// Memverifikasi alur: create -> list -> delete, plus:
//   - kepemilikan: list hanya mengembalikan rute milik user ini
//   - delete rute milik user lain -> gagal (false), tidak terhapus
//   - delete dua kali -> kedua kali false setelah terhapus
import { prisma } from "../../config/prisma.js";
import * as routesService from "./routes.service.js";
import type { GeoJsonPoint } from "./routes.types.js";

const ORIGIN: GeoJsonPoint = { type: "Point", coordinates: [110.3759, -7.7653] };
const DEST: GeoJsonPoint = { type: "Point", coordinates: [110.3772, -7.7661] };

async function runSmokeTest() {
  console.log("Starting saved routes smoke test...\n");

  const owner = await prisma.user.create({
    data: { phoneNumber: "+6281299992001", name: "Saved Route Owner", role: "blind_user" },
  });
  const other = await prisma.user.create({
    data: { phoneNumber: "+6281299992002", name: "Other User", role: "mobility_user" },
  });
  console.log(`[PASS] Test users created: ${owner.name} and ${other.name}`);

  let failures = 0;

  try {
    // --- CREATE ---
    const createdForOwner = await routesService.createSavedRoute({
      userId: owner.id,
      name: "Kos ke Fakultas Teknik",
      origin: ORIGIN,
      destination: DEST,
      edgeIds: ["101", "102", "117"],
    });
    if (createdForOwner.name === "Kos ke Fakultas Teknik" && createdForOwner.edgeIds.length === 3) {
      console.log(`[PASS] Create: saved route id=${createdForOwner.id}, edgeIds=${createdForOwner.edgeIds.join(",")}`);
    } else {
      failures++;
      console.error("[FAIL] Create: unexpected shape", createdForOwner);
    }
    if (
      createdForOwner.origin.type === "Point" &&
      Math.abs(createdForOwner.origin.coordinates[0] - 110.3759) < 1e-4
    ) {
      console.log("[PASS] Create: origin GeoJSON round-trips lewat PostGIS");
    } else {
      failures++;
      console.error("[FAIL] Create: origin GeoJSON tidak sesuai", createdForOwner.origin);
    }

    // Rute milik user lain (untuk cek isolasi kepemilikan di list & delete).
    const createdForOther = await routesService.createSavedRoute({
      userId: other.id,
      name: "Rute milik orang lain",
      origin: ORIGIN,
      destination: DEST,
      edgeIds: [],
    });

    // --- LIST (kepemilikan) ---
    const ownerList = await routesService.listSavedRoutes(owner.id);
    if (ownerList.length === 1 && ownerList[0]!.id === createdForOwner.id) {
      console.log("[PASS] List: hanya mengembalikan rute milik user ini (isolasi kepemilikan)");
    } else {
      failures++;
      console.error(`[FAIL] List: expected 1 rute milik owner, got ${ownerList.length}`);
    }

    // --- DELETE rute milik user lain pakai id owner -> harus gagal (false) ---
    const crossDelete = await routesService.deleteSavedRoute(createdForOther.id, owner.id);
    if (crossDelete === false) {
      console.log("[PASS] Delete: rute milik user lain TIDAK terhapus oleh owner (false)");
    } else {
      failures++;
      console.error("[FAIL] Delete: cross-user delete seharusnya false");
    }

    // --- DELETE rute sendiri -> true ---
    const firstDelete = await routesService.deleteSavedRoute(createdForOwner.id, owner.id);
    const secondDelete = await routesService.deleteSavedRoute(createdForOwner.id, owner.id);
    if (firstDelete === true && secondDelete === false) {
      console.log("[PASS] Delete: pertama true, kedua false (idempoten setelah terhapus)");
    } else {
      failures++;
      console.error(`[FAIL] Delete: expected true lalu false, got ${firstDelete}/${secondDelete}`);
    }

    const afterDelete = await routesService.listSavedRoutes(owner.id);
    if (afterDelete.length === 0) {
      console.log("[PASS] List: kosong setelah delete");
    } else {
      failures++;
      console.error(`[FAIL] List: expected 0 setelah delete, got ${afterDelete.length}`);
    }

    if (failures === 0) {
      console.log("\n[SUCCESS] All saved routes smoke tests passed (create/list/delete).");
    } else {
      throw new Error(`${failures} smoke assertion(s) failed`);
    }
  } finally {
    await prisma.$executeRaw`DELETE FROM saved_routes WHERE user_id = ANY(${[owner.id, other.id]}::uuid[])`;
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
    console.log("[CLEANUP] Test data cleaned up.");
  }
}

runSmokeTest().catch((err) => {
  console.error("[FAIL] Smoke test failed with error:", err);
  process.exit(1);
});
