// Smoke test Task 16g -- membuktikan select relawan ATOMIC: dua requester
// memilih relawan yang SAMA untuk slot waktu yang BENTROK secara bersamaan ->
// hanya satu yang sukses, satunya menerima 409 CONFLICT. Butuh DB nyata
// (EXCLUDE constraint excl_confirmed_volunteer_no_overlap + transaksi), jadi
// *.smoke.test.ts (dikecualikan dari `npm test`). Jalankan manual:
//   npx tsx src/modules/companions/companions.race.smoke.test.ts
//
// Catatan: ini meniru balapan nyata. Tanpa constraint DB, kedua select bisa
// lolos hasScheduleClash (membaca state sebelum commit lawan) dan dua-duanya
// confirmed -> test ini GAGAL. Dengan constraint, baris confirmed kedua ditolak.
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import * as service from "./companions.service.js";

const PT = (lng: number, lat: number) =>
  ({ type: "Point", coordinates: [lng, lat] }) as const;

async function createRequest(requesterId: string, start: Date) {
  return service.createRequest(requesterId, {
    destinationName: "Smoke race destination",
    destinationLocation: PT(110.377, -7.766),
    assistanceTypes: ["memandu_jalan"],
    scheduledStart: start,
    estimatedDurationMin: 60,
  } as Parameters<typeof service.createRequest>[1]);
}

async function run() {
  console.log("Starting companion select race-condition smoke test (Task 16g)...\n");

  const [reqA, reqB, volunteer] = await Promise.all([
    prisma.user.create({ data: { phoneNumber: "+6281299991001", name: "Requester A", role: "blind_user" } }),
    prisma.user.create({ data: { phoneNumber: "+6281299991002", name: "Requester B", role: "blind_user" } }),
    prisma.user.create({ data: { phoneNumber: "+6281299991003", name: "Volunteer V", role: "volunteer" } }),
  ]);

  const createdIds = [reqA.id, reqB.id, volunteer.id];

  try {
    // Dua request dengan jam BERIMPIT (start sama) -- durasi 60 menit keduanya.
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000); // besok, lolos "harus masa depan"
    const requestA = await createRequest(reqA.id, start);
    const requestB = await createRequest(reqB.id, start);

    // Relawan yang SAMA menawar kedua request.
    const offerA = await service.createOffer(volunteer.id, requestA.id, {});
    const offerB = await service.createOffer(volunteer.id, requestB.id, {});
    console.log("[PASS] 2 request bentrok + tawaran dari relawan yang sama dibuat.");

    // Jalankan dua select BERSAMAAN. allSettled supaya kita lihat kedua hasil.
    const [resA, resB] = await Promise.allSettled([
      service.selectVolunteer(reqA.id, requestA.id, offerA.offer.offerId),
      service.selectVolunteer(reqB.id, requestB.id, offerB.offer.offerId),
    ]);

    const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
    const rejected = [resA, resB].filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    console.assert(fulfilled.length === 1, `Harus TEPAT 1 select sukses, dapat ${fulfilled.length}`);
    console.assert(rejected.length === 1, `Harus TEPAT 1 select gagal, dapat ${rejected.length}`);

    const err = rejected[0]?.reason;
    const is409 = err instanceof AppError && err.code === "CONFLICT" && err.httpStatus === 409;
    console.assert(is409, `Select yang gagal harus AppError 409 CONFLICT, dapat: ${err}`);

    // Verifikasi state DB: tepat satu request berstatus confirmed untuk relawan ini.
    const confirmed = await prisma.companionRequest.count({
      where: { selectedVolunteerId: volunteer.id, status: "confirmed" },
    });
    console.assert(confirmed === 1, `DB harus punya tepat 1 request confirmed, dapat ${confirmed}`);

    if (fulfilled.length === 1 && rejected.length === 1 && is409 && confirmed === 1) {
      console.log("[PASS] Tepat satu select sukses; satunya 409 CONFLICT; DB konsisten.");
      console.log("\n[SUCCESS] Race-condition smoke test lulus (Task 16g).");
    } else {
      console.error("\n[FAIL] Race-condition smoke test GAGAL -- lihat assertion di atas.");
      process.exitCode = 1;
    }
  } finally {
    // Hapus request & offer dulu (FK), lalu users.
    await prisma.companionOffer.deleteMany({ where: { volunteerId: volunteer.id } });
    await prisma.companionRequest.deleteMany({ where: { requesterId: { in: [reqA.id, reqB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
    console.log("[CLEANUP] Data uji dibersihkan.");
  }
}

run().catch((err) => {
  console.error("[FAIL] Smoke test error:", err);
  process.exit(1);
});
