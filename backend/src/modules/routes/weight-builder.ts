// weightConfig (JSON, dari DB -- tepercaya) + tolerance (dari user -- TIDAK
// tepercaya) -> ekspresi SQL `cost` untuk pgr_dijkstra. Port dari
// backend/docs/SDD.md §4.2.
//
// ATURAN KEAMANAN (SDD §4.2): weightConfig berasal dari seed tim, tapi
// toleranceOverrides berasal dari input pengguna. Setiap nilai dari
// tolerance WAJIB di-clamp ke rentang wajar SEBELUM masuk string SQL --
// jangan pernah interpolasi string mentah pengguna ke SQL.
import type { BlockerRule, SlopeTier, Tolerance, WeightConfig } from "./routes.types.js";

const EDGE_FIELD_COLUMN: Record<string, string> = {
  hasStairs: "e.has_stairs",
  widthCm: "e.width_cm",
  slopePercent: "e.slope_percent",
  stepCount: "e.step_count",
  isCovered: "e.is_covered",
  hasGuidingBlock: "e.has_guiding_block",
};

function sqlLiteral(value: boolean | number): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function sqlCondition(rule: BlockerRule): string {
  const column = EDGE_FIELD_COLUMN[rule.field];
  if (!column) {
    // weightConfig berasal dari DB tepercaya (bukan user), jadi field tak
    // dikenal berarti data seed salah -- gagal cepat & jelas, bukan diam-diam
    // diabaikan (abaikan diam-diam bisa membuat blocker penting hilang tanpa
    // disadari, mis. tangga jadi "boleh dilalui" karena typo field name).
    throw new Error(`weight-builder: unknown blocker field "${rule.field}"`);
  }
  const op = { eq: "=", lt: "<", gt: ">" }[rule.op];
  return `${column} ${op} ${sqlLiteral(rule.value)}`;
}

export function clampInt(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

// Terapkan toleranceOverrides ke atas blockers default -- HANYA field yang
// ada di weightConfig.allowedOverrides (SDD §4.1 langkah 2). Override lebih
// ketat/longgar dinyatakan sebagai blocker tambahan/pengganti, bukan mengubah
// weightConfig asli (yang berasal dari DB, tidak boleh dimutasi).
function buildEffectiveBlockers(cfg: WeightConfig, tol: Tolerance): BlockerRule[] {
  const blockers = [...cfg.blockers];
  const allowed = new Set(cfg.allowedOverrides);

  if (allowed.has("maxSlopePercent")) {
    const maxSlope = clampNumber(tol.maxSlopePercent, 0, 30);
    if (maxSlope !== undefined) {
      blockers.push({ field: "slopePercent", op: "gt", value: maxSlope });
    }
  }
  if (allowed.has("minWidthCm")) {
    const minWidth = clampInt(tol.minWidthCm, 0, 300);
    if (minWidth !== undefined) {
      blockers.push({ field: "widthCm", op: "lt", value: minWidth });
    }
  }
  // maxSteps tidak dipetakan ke blocker (tangga punya step_count tapi bukan
  // kolom boolean/single-value yang cocok dengan BlockerRule) -- diterapkan
  // sebagai penalti berjenjang via perStep, bukan buntu total, konsisten
  // dengan filosofi "crutches: tangga mahal tapi tidak buntu" di DATA_MODEL.md §3.

  return blockers;
}

function buildCase(column: string, mapping: Record<string, number>, defaultFactor: number): string {
  const whens = Object.entries(mapping)
    .map(([key, factor]) => `WHEN ${column} = '${key}' THEN ${factor}`)
    .join(" ");
  return `CASE ${whens} ELSE ${defaultFactor} END`;
}

function buildRangeCase(column: string, tiers: SlopeTier[], defaultFactor: number): string {
  const sorted = [...tiers].sort((a, b) => a.max - b.max);
  const whens = sorted.map((tier) => `WHEN ${column} <= ${tier.max} THEN ${tier.factor}`).join(" ");
  return `CASE ${whens} ELSE ${defaultFactor} END`;
}

export function buildCostExpression(cfg: WeightConfig, tol: Tolerance): string {
  const avoidUncovered = cfg.allowedOverrides.includes("avoidUncovered") && tol.avoidUncovered === true;

  const blockerConditions: string[] = [
    "e.is_operational = FALSE",
    "COALESCE(r.max_effect, '') = 'block'",
    ...buildEffectiveBlockers(cfg, tol).map(sqlCondition),
  ];
  if (avoidUncovered) {
    blockerConditions.push("e.is_covered = FALSE");
  }

  const surfaceCase = buildCase("e.surface_type", cfg.multipliers.surfaceType, 1.0);
  const slopeCase = buildRangeCase("ABS(e.slope_percent)", cfg.multipliers.slopePercent, 1.0);

  const penalties = [
    cfg.penalties.noGuidingBlock
      ? `CASE WHEN e.has_guiding_block = FALSE THEN ${cfg.penalties.noGuidingBlock} ELSE 0 END`
      : null,
    cfg.penalties.guidingBlockDamaged
      ? `CASE WHEN e.guiding_block_condition IN ('rusak','terputus','salah_arah') THEN ${cfg.penalties.guidingBlockDamaged} ELSE 0 END`
      : null,
    cfg.penalties.perStep ? `(e.step_count * ${cfg.penalties.perStep})` : null,
    cfg.penalties.uncovered
      ? `CASE WHEN e.is_covered = FALSE THEN ${cfg.penalties.uncovered} ELSE 0 END`
      : null,
    "COALESCE(r.penalty, 0)",
  ].filter((p): p is string => p !== null);

  return `
    CASE WHEN ${blockerConditions.join(" OR ")} THEN -1
    ELSE e.length_m * ${cfg.baseCostPerMeter} * ${surfaceCase} * ${slopeCase}
         + ${penalties.join(" + ")}
    END`;
}

// Penalti laporan aktif per edge (SDD §4.3 placeholder <DEGRADE_PENALTY>).
// cfg.penalties.reportBlock = null berarti laporan 'block' sudah ditangani
// lewat blocker COALESCE(r.max_effect,'')='block' di atas -- nilai ini hanya
// dipakai untuk SUM(...) laporan 'degrade' di subquery report_edge_links.
export function buildDegradePenaltyExpression(cfg: WeightConfig): string {
  return String(cfg.penalties.reportDegrade);
}
