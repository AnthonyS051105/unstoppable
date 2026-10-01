// Seed dev untuk manual test SOS end-to-end. Bukan data survei/produksi.
// Jalankan: npx tsx scripts/manual-tests/sos-broadcast.dev.seed.ts
import "dotenv/config";
import { prisma } from "../../src/config/prisma.js";
import { signAccessToken } from "../../src/modules/auth/token.js";

const PILOT_LNG = 110.37;
const PILOT_LAT = -7.77;

async function main() {
  const blindUser = await prisma.user.upsert({
    where: { phoneNumber: "081200000001" },
    update: {},
    create: { phoneNumber: "081200000001", name: "Dev Blind User", role: "blind_user", phoneVerified: true },
  });

  const caregiver = await prisma.user.upsert({
    where: { phoneNumber: "081200000002" },
    update: {},
    create: { phoneNumber: "081200000002", name: "Dev Caregiver", role: "caregiver", phoneVerified: true },
  });

  const volunteer = await prisma.user.upsert({
    where: { phoneNumber: "081200000003" },
    update: {},
    create: { phoneNumber: "081200000003", name: "Dev Volunteer", role: "volunteer", phoneVerified: true },
  });

  await prisma.caregiverRelationship.upsert({
    where: { blindUserId_caregiverId: { blindUserId: blindUser.id, caregiverId: caregiver.id } },
    update: {},
    create: {
      blindUserId: blindUser.id,
      caregiverId: caregiver.id,
      relationshipType: "primary",
      locationSharingMode: "sos_only",
    },
  });

  await prisma.volunteerProfile.upsert({
    where: { userId: volunteer.id },
    update: { isActive: true, verificationStatus: "verified" },
    create: {
      userId: volunteer.id,
      isActive: true,
      verificationStatus: "verified",
      canCompanion: true,
    },
  });

  // Hapus availability lama punya volunteer ini supaya seed idempoten (upsert
  // butuh unique key, availability tidak punya satu yang cocok untuk kasus ini).
  await prisma.volunteerAvailability.deleteMany({ where: { volunteerId: volunteer.id } });
  await prisma.$executeRaw`
    INSERT INTO volunteer_availability (id, volunteer_id, center_point, radius_meters, is_active, created_at)
    VALUES (gen_random_uuid(), ${volunteer.id}::uuid,
            ST_SetSRID(ST_MakePoint(${PILOT_LNG}, ${PILOT_LAT}), 4326)::geography,
            1000, TRUE, now())
  `;

  const blindToken = signAccessToken({ sub: blindUser.id, role: blindUser.role });
  const caregiverToken = signAccessToken({ sub: caregiver.id, role: caregiver.role });
  const volunteerToken = signAccessToken({ sub: volunteer.id, role: volunteer.role });

  console.log(JSON.stringify({
    blindUserId: blindUser.id,
    caregiverId: caregiver.id,
    volunteerId: volunteer.id,
    blindToken,
    caregiverToken,
    volunteerToken,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
