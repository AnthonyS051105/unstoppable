// DATA DUMMY UNTUK DEVELOPMENT LOKAL -- BUKAN DATA LAPANGAN PRODUKSI.
// Komunitas bukan hasil survei, tetapi tetap diberi suffix `.dev.` agar tidak
// tercampur ke deployment produksi tanpa sengaja.
//
// Jalankan: npx tsx prisma/communities.dev.seed.ts
import "dotenv/config";
import { prisma } from "../src/config/prisma.js";

const COMMUNITIES = [
  {
    slug: "lansia-aktif-yogyakarta",
    name: "Lansia Aktif Yogyakarta",
    description: "Komunitas lansia, keluarga, dan relawan di wilayah Yogyakarta.",
    icon: "users",
    lng: 110.3695,
    lat: -7.7710,
    radiusMeters: 3000,
  },
  {
    slug: "keluarga-peduli-akses-ugm",
    name: "Keluarga Peduli Akses UGM",
    description: "Berbagi informasi hambatan dan agenda pemetaan akses di area UGM.",
    icon: "map",
    lng: 110.3730,
    lat: -7.7655,
    radiusMeters: 3000,
  },
  {
    slug: "relawan-pendamping-jogja",
    name: "Relawan Pendamping Jogja",
    description: "Ruang koordinasi relawan pendamping dan pemeta komunitas.",
    icon: "hand-helping",
    lng: 110.3753,
    lat: -7.8101,
    radiusMeters: 5000,
  },
] as const;

async function main() {
  for (const community of COMMUNITIES) {
    await prisma.$executeRaw`
      INSERT INTO communities (
        id, slug, name, description, icon, center_point, radius_meters, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${community.slug},
        ${community.name},
        ${community.description},
        ${community.icon},
        ST_SetSRID(ST_MakePoint(${community.lng}, ${community.lat}), 4326)::geography,
        ${community.radiusMeters},
        now()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        center_point = EXCLUDED.center_point,
        radius_meters = EXCLUDED.radius_meters
    `;
  }

  console.log(`[communities.dev.seed] Seeded ${COMMUNITIES.length} development communities.`);
}

main()
  .catch((error) => {
    console.error("[communities.dev.seed] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
