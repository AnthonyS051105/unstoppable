// weightConfig (JSON, dari DB -- tepercaya) + tolerance (dari user -- TIDAK
// tepercaya) -> ekspresi SQL `cost` untuk pgr_dijkstra. Port dari
// backend/docs/SDD.md §4.2.
//
// ATURAN KEAMANAN (SDD §4.2): weightConfig berasal dari seed tim, tapi
// toleranceOverrides berasal dari input pengguna. Setiap nilai dari
// tolerance WAJIB di-clamp ke rentang wajar SEBELUM masuk string SQL --
// jangan pernah interpolasi string mentah pengguna ke SQL.
import type { BlockerRule, OverrideKey, SlopeTier, Tolerance, WeightConfig } from "./routes.types.js";
import { OVERRIDE_KEYS } from "./routes.types.js";

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

// Validasi allowedOverrides dari weightConfig (DB, tepercaya). Kunci tak dikenal
// = data seed salah -> gagal cepat & jelas, BUKAN diabaikan diam-diam. Dulu
// allowedOverrides memakai camelCase (maxSlopePercent) sementara toleranceOverrides
// pengguna snake_case (max_slope_percent): mismatch itu bisa lolos tanpa error
// sehingga override tak pernah berlaku. Sekarang satu bentuk (snake_case) +
// pengecekan eksplisit ini mencegah mismatch senyap (Task 16b).
function assertAllowedOverrides(cfg: WeightConfig): Set<OverrideKey> {
  const valid = new Set<string>(OVERRIDE_KEYS);
  for (const key of cfg.allowedOverrides) {
    if (!valid.has(key)) {
      throw new Error(
        `weight-builder: unknown allowedOverrides key "${key}" -- harus salah satu dari ${OVERRIDE_KEYS.join(", ")}`,
      );
    }
  }
  return new Set(cfg.allowedOverrides);
}

// Terapkan toleranceOverrides ke atas blockers default -- HANYA field yang
// ada di weightConfig.allowedOverrides (SDD §4.1 langkah 2). Override lebih
// ketat/longgar dinyatakan sebagai blocker tambahan/pengganti, bukan mengubah
// weightConfig asli (yang berasal dari DB, tidak boleh dimutasi). Kunci sama
// persis (snake_case) di allowed, tol, dan OVERRIDE_KEYS -- satu sumber kebenaran.
function buildEffectiveBlockers(cfg: WeightConfig, tol: Tolerance, allowed: Set<OverrideKey>): BlockerRule[] {
  const blockers = [...cfg.blockers];

  if (allowed.has("max_slope_percent")) {
    const maxSlope = clampNumber(tol.max_slope_percent, 0, 30);
    if (maxSlope !== undefined) {
      blockers.push({ field: "slopePercent", op: "gt", value: maxSlope });
    }
  }
  if (allowed.has("min_width_cm")) {
    const minWidth = clampInt(tol.min_width_cm, 0, 300);
    if (minWidth !== undefined) {
      blockers.push({ field: "widthCm", op: "lt", value: minWidth });
    }
  }
  // max_steps tidak dipetakan ke blocker (tangga punya step_count tapi bukan
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
  const allowed = assertAllowedOverrides(cfg);
  const avoidUncovered = allowed.has("avoid_uncovered") && tol.avoid_uncovered === true;

  const blockerConditions: string[] = [
    "e.is_operational = FALSE",
    "COALESCE(r.max_effect, '') = 'block'",
    ...buildEffectiveBlockers(cfg, tol, allowed).map(sqlCondition),
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
