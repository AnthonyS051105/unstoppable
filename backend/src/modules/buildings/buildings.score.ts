// Formula & bobot persis backend/docs/SDD.md §10. Jangan diubah tanpa mencatat alasannya di sini.
import type { BuildingRow, GraphStats, ScoreAspect, ScoreBreakdown } from "./buildings.types.js";

export const SCORE_WEIGHTS = {
  entrance: 0.3,
  verticalAccess: 0.3,
  paths: 0.25,
  facilities: 0.15,
} as const;

export const MIN_PATH_WIDTH_CM = 120;
export const MAX_PATH_SLOPE_PERCENT = 8;

const ASPECT_KEYS = Object.keys(SCORE_WEIGHTS) as Array<keyof ScoreBreakdown>;

type ScoringInput = Pick<BuildingRow, "floorCount" | "hasLift" | "hasAccessibleToilet">;

// Data graf kosong berarti "belum diketahui", bukan "buruk" -> skor null, bukan 0.
function ratioAspect(hit: number, total: number, emptyNote: string, note: string): ScoreAspect {
  if (total === 0) return { score: null, note: emptyNote };
  return { score: Math.round((hit / total) * 100), note };
}

function scoreEntrance({ entranceCount, stairFreeEntranceCount }: GraphStats): ScoreAspect {
  return ratioAspect(
    stairFreeEntranceCount,
    entranceCount,
    "Pintu masuk gedung belum tersurvei di graf.",
    `${stairFreeEntranceCount} dari ${entranceCount} pintu masuk memiliki jalur tanpa tangga.`,
  );
}

function scoreVerticalAccess(
  { floorCount, hasLift }: ScoringInput,
  { liftFloorCount }: GraphStats,
): ScoreAspect {
  if (floorCount <= 1) return { score: 100, note: "Gedung satu lantai." };
  if (!hasLift) return { score: 0, note: `Tidak ada lift; gedung memiliki ${floorCount} lantai.` };
  if (liftFloorCount === 0) {
    return { score: null, note: "Gedung memiliki lift, tetapi titik lift belum tersurvei di graf." };
  }
  return liftFloorCount >= floorCount
    ? { score: 100, note: `Lift melayani seluruh ${floorCount} lantai.` }
    : { score: 50, note: `Lift hanya melayani ${liftFloorCount} dari ${floorCount} lantai.` };
}

function scorePaths({ measuredEdgeCount, compliantEdgeCount }: GraphStats): ScoreAspect {
  return ratioAspect(
    compliantEdgeCount,
    measuredEdgeCount,
    "Segmen jalur dalam gedung belum tersurvei (lebar/kelandaian).",
    `${compliantEdgeCount} dari ${measuredEdgeCount} segmen jalur memiliki lebar ≥ ${MIN_PATH_WIDTH_CM} cm dan kelandaian ≤ ${MAX_PATH_SLOPE_PERCENT}%.`,
  );
}

function scoreFacilities({ hasAccessibleToilet }: ScoringInput): ScoreAspect {
  return hasAccessibleToilet
    ? { score: 100, note: "Toilet difabel tersedia." }
    : { score: 0, note: "Toilet difabel tidak tersedia." };
}

// Satu aspek null membuat total null: skor parsial akan menyesatkan pengguna.
function weightedTotal(breakdown: ScoreBreakdown): number | null {
  let total = 0;
  for (const key of ASPECT_KEYS) {
    const { score } = breakdown[key];
    if (score === null) return null;
    total += score * SCORE_WEIGHTS[key];
  }
  return Math.round(total * 10) / 10;
}

export function computeScore(building: ScoringInput, stats: GraphStats) {
  const scoreBreakdown: ScoreBreakdown = {
    entrance: scoreEntrance(stats),
    verticalAccess: scoreVerticalAccess(building, stats),
    paths: scorePaths(stats),
    facilities: scoreFacilities(building),
  };
  return { accessibilityScore: weightedTotal(scoreBreakdown), scoreBreakdown };
}
