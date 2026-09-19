// Seed dev untuk manual test sos-broadcast.ts SAJA. Bukan data survei/produksi.
// Jalankan: npx tsx scripts/manual-tests/sos-broadcast.dev.seed.ts
import { prisma } from "../../src/config/prisma.js";

async function main() {
  const blindUser = await prisma.user.upsert({
    where: { phoneNumber: "081200000001" },
    update: {},
    create: { phoneNumber: "081200000001", name: "Dev Blind User", role: "blind_user" },
  });

  const caregiver = await prisma.user.upsert({
    where: { phoneNumber: "081200000002" },
    update: {},
    create: { phoneNumber: "081200000002", name: "Dev Caregiver", role: "caregiver" },
  });

  await prisma.caregiverRelationship.upsert({
    where: { blindUserId_caregiverId: { blindUserId: blindUser.id, caregiverId: caregiver.id } },
    update: {},
    create: { blindUserId: blindUser.id, caregiverId: caregiver.id, relationshipType: "family" },
  });

  console.log("blindUserId:", blindUser.id);
  console.log("caregiverId:", caregiver.id);
}

main().finally(() => prisma.$disconnect());
