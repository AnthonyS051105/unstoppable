// Seed accessibility_profiles -- WAJIB dijalankan sebelum Route Service bisa
// berfungsi (backend/CLAUDE.local.md §6). Bentuk weightConfig & nilai per
// profil persis docs/DATA_MODEL.md §3 -- kontrak internal seeder <-> Route
// Service, JANGAN diubah tanpa memberi tahu Nafal.
//
// Ini BUKAN *.dev.seed.ts: weightConfig adalah konfigurasi sistem nyata
// (dipakai algoritma produksi), bukan data survei yang dipalsukan -- beda
// kategori dengan graph.dev.seed.ts yang memang berisi graf contoh.
//
// Jalankan: npx tsx prisma/accessibility-profiles.seed.ts
import "dotenv/config";
import { prisma } from "../src/config/prisma.js";
import type { WeightConfig } from "../src/modules/routes/routes.types.js";

interface ProfileSeed {
  id: string;
  label: string;
  primaryChannel: string;
  displayOrder: number;
  weightConfig: WeightConfig;
}

const PROFILES: ProfileSeed[] = [
  {
    id: "wheelchair",
    label: "Pengguna kursi roda",
    primaryChannel: "visual",
    displayOrder: 1,
    weightConfig: {
      baseCostPerMeter: 1.0,
      blockers: [
        { field: "hasStairs", op: "eq", value: true },
        { field: "widthCm", op: "lt", value: 90 },
        { field: "slopePercent", op: "gt", value: 12 },
      ],
      multipliers: {
        surfaceType: { paving: 1.0, aspal: 1.0, beton: 1.0, keramik: 1.1, tanah: 1.8, rumput: 2.2 },
        slopePercent: [
          { max: 5, factor: 1.0 },
          { max: 8, factor: 1.4 },
          { max: 12, factor: 2.5 },
        ],
      },
      penalties: { noGuidingBlock: 0, guidingBlockDamaged: 0, perStep: 0, uncovered: 5, reportDegrade: 80, reportBlock: null },
      allowedOverrides: ["max_slope_percent", "min_width_cm"],
    },
  },
  {
    id: "blind",
    label: "Tunanetra",
    primaryChannel: "audio",
    displayOrder: 2,
    weightConfig: {
      baseCostPerMeter: 1.0,
      blockers: [],
      multipliers: {
        surfaceType: { paving: 1.0, aspal: 1.0, beton: 1.0, keramik: 1.1, tanah: 1.8, rumput: 2.2 },
        slopePercent: [
          { max: 5, factor: 1.0 },
          { max: 8, factor: 1.4 },
          { max: 12, factor: 2.5 },
        ],
      },
      penalties: { noGuidingBlock: 40, guidingBlockDamaged: 80, perStep: 6, uncovered: 0, reportDegrade: 120, reportBlock: null },
      allowedOverrides: ["max_steps"],
    },
  },
  {
    id: "crutches",
    label: "Pengguna kruk",
    primaryChannel: "visual",
    displayOrder: 3,
    weightConfig: {
      baseCostPerMeter: 1.0,
      blockers: [{ field: "slopePercent", op: "gt", value: 15 }],
      multipliers: {
        surfaceType: { paving: 1.0, aspal: 1.0, beton: 1.0, keramik: 1.1, tanah: 1.8, rumput: 2.2 },
        slopePercent: [
          { max: 5, factor: 1.0 },
          { max: 8, factor: 1.4 },
          { max: 12, factor: 2.5 },
        ],
      },
      penalties: { noGuidingBlock: 0, guidingBlockDamaged: 0, perStep: 25, uncovered: 10, reportDegrade: 80, reportBlock: null },
      allowedOverrides: ["max_slope_percent"],
    },
  },
  {
    id: "low_vision",
    label: "Low vision",
    primaryChannel: "visual",
    displayOrder: 4,
    weightConfig: {
      baseCostPerMeter: 1.0,
      blockers: [],
      multipliers: {
        surfaceType: { paving: 1.0, aspal: 1.0, beton: 1.0, keramik: 1.1, tanah: 1.8, rumput: 2.2 },
        slopePercent: [
          { max: 5, factor: 1.0 },
          { max: 8, factor: 1.4 },
          { max: 12, factor: 2.5 },
        ],
      },
      penalties: { noGuidingBlock: 15, guidingBlockDamaged: 30, perStep: 3, uncovered: 0, reportDegrade: 100, reportBlock: null },
      allowedOverrides: ["max_steps"],
    },
  },
];

async function main() {
  for (const p of PROFILES) {
    await prisma.accessibilityProfile.upsert({
      where: { id: p.id },
      update: { label: p.label, primaryChannel: p.primaryChannel, displayOrder: p.displayOrder, weightConfig: p.weightConfig as object },
      create: { id: p.id, label: p.label, primaryChannel: p.primaryChannel, displayOrder: p.displayOrder, weightConfig: p.weightConfig as object },
    });
  }
  console.log(`[accessibility-profiles.seed] Seeded ${PROFILES.length} profiles.`);
}

main()
  .catch((err) => {
    console.error("[accessibility-profiles.seed] Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
