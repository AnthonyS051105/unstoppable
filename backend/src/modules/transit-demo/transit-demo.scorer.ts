import type { PlanRouteResult, Tolerance, WeightConfig } from "../routes/routes.types.js";
import type {
  MultimodalLegDto,
  MultimodalOptionDto,
  MultimodalScoreBreakdown,
  MultimodalTransitLegDto,
  MultimodalTransferStepDto,
  MultimodalWalkLegDto,
  ScheduleLookupResult,
  TransitCorridorSpec,
  TransitStopSpec,
  TransitTransferSpec,
  VerifiedVolunteerCandidateDto,
  WalkLegEvaluation,
} from "./transit-demo.types.js";

export interface TransitCandidateEvaluation {
  id: string;
  kind: "transit_0_transfer" | "transit_1_transfer";
  corridors: Array<{
    corridor: TransitCorridorSpec;
    boardStop: TransitStopSpec;
    alightStop: TransitStopSpec;
    schedule: ScheduleLookupResult;
  }>;
  firstMile: WalkLegEvaluation;
  transferWalk?: {
    spec: TransitTransferSpec;
    walk: WalkLegEvaluation;
    actualWindowMinutes: number | null;
    catchable: boolean;
    reasonIfUncatchable: string | null;
  };
  lastMile: WalkLegEvaluation;
}

export interface ScoringContext {
  profileId: string;
  weightConfig: WeightConfig;
  tolerance: Tolerance;
  maxWalkMeters: number;
  preferFewerTransfers: boolean;
}

function emptyBreakdown(base = 100): MultimodalScoreBreakdown {
  return {
    base,
    durationPenalty: 0,
    walkPenalty: 0,
    walkTolerancePenalty: 0,
    transferPenalty: 0,
    accessibilityPenalty: 0,
    uncertaintyPenalty: 0,
    stalenessPenalty: 0,
    farePenalty: 0,
    barrierPenalty: 0,
    barrierBonus: 0,
  };
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function profileForbidsStairs(ctx: ScoringContext): boolean {
  if (ctx.weightConfig.blockers.some((b) => b.field === "hasStairs" && b.op === "eq" && b.value === true)) {
    return true;
  }
  if (ctx.tolerance.max_steps !== undefined && ctx.tolerance.max_steps <= 0) {
    return true;
  }
  return false;
}

function effectiveMaxSteps(ctx: ScoringContext): number | null {
  if (profileForbidsStairs(ctx)) return 0;
  if (typeof ctx.tolerance.max_steps === "number") return ctx.tolerance.max_steps;
  return null;
}

function toWalkLegDto(evalLeg: WalkLegEvaluation): MultimodalWalkLegDto | null {
  if (!evalLeg.reachable || !evalLeg.route) return null;
  return {
    type: "walk",
    role: evalLeg.role,
    fromLabel: evalLeg.fromLabel,
    toLabel: evalLeg.toLabel,
    distanceM: evalLeg.route.totalDistanceM,
    durationMin: evalLeg.route.estimatedDurationMin,
    edgeIds: evalLeg.route.edgeIds,
    geometry: evalLeg.route.geometry,
    steps: evalLeg.route.steps,
    barriers: evalLeg.route.barriers,
    hasStairs: evalLeg.hasStairs,
    stepCount: evalLeg.stepCount,
    surveyedAt: evalLeg.route.dataFreshness.surveyedAt,
  };
}

function toTransitLegDto(c: TransitCandidateEvaluation["corridors"][number]): MultimodalTransitLegDto {
  const formatStop = (s: TransitStopSpec) => ({
    stopId: s.stopId,
    name: s.name,
    platformCode: s.platformCode,
    coordinates: s.coordinates,
    wheelchairBoarding: s.accessibility.wheelchairBoarding,
    stepCount: s.accessibility.stepCount,
    lowFloorRamp: s.accessibility.lowFloorRamp,
    tactilePaving: s.accessibility.tactilePaving,
    audioAnnouncement: s.accessibility.audioAnnouncement,
  });

  return {
    type: "transit",
    synthetic: true,
    verifiedFeed: false,
    corridorId: c.corridor.id,
    mode: c.corridor.mode,
    routeShortName: c.corridor.routeShortName,
    headsign: c.corridor.headsign,
    boardStop: formatStop(c.boardStop),
    alightStop: formatStop(c.alightStop),
    vehicleAccessibility: c.corridor.vehicleAccessibility,
    boardingAccessibility: c.corridor.boardingAccessibility,
    stepCount: c.corridor.stepCount,
    departureTimeWib: c.schedule.departureWib,
    arrivalTimeWib: c.schedule.arrivalWib,
    departureIso: c.schedule.departureIso,
    arrivalIso: c.schedule.arrivalIso,
    waitMinutes: c.schedule.waitMinutes,
    durationMin: c.corridor.estimatedTransitDurationMin,
    fareIdr: c.corridor.fare.amountIdr,
    fareNote: c.corridor.fare.note,
    lastUpdatedIso: c.corridor.lastUpdatedIso,
    isStale: c.schedule.isStale,
    staleAgeMinutes: c.schedule.staleAgeMinutes,
    scheduleValid: c.schedule.scheduleValid,
    catchable: c.schedule.catchable,
  };
}

export function scoreDirectWalkOption(
  walk: WalkLegEvaluation,
  ctx: ScoringContext,
): MultimodalOptionDto {
  const breakdown = emptyBreakdown(100);
  const warnings: string[] = [];
  const disqualifications: string[] = [];

  if (!walk.reachable || !walk.route) {
    const reasons = walk.unreachable?.details?.reasons.map((r) => r.message).filter(Boolean) ?? [];
    if (reasons.length === 0 && walk.unreachable?.message) reasons.push(walk.unreachable.message);
    return {
      id: "direct-walk",
      kind: "direct_walk",
      mode: "walk",
      title: "Jalan Kaki Langsung (Graf Terverifikasi)",
      synthetic: false,
      verifiedFeed: false,
      eligible: false,
      disqualificationReasons: reasons.length > 0 ? reasons : ["Jalur pejalan kaki langsung tidak terjangkau."],
      warnings: [],
      accessibilityUnknown: false,
      hasStaleSchedule: false,
      totalDurationMin: 0,
      totalWalkM: 0,
      totalFareIdr: 0,
      transfers: 0,
      score: -100,
      scoreBreakdown: breakdown,
      rationale: "Rute jalan kaki penuh tidak tersedia atau terhalang untuk profil Anda.",
      legs: [],
      previewWalkRoute: null,
    };
  }

  const distanceM = walk.route.totalDistanceM;
  const durationMin = walk.route.estimatedDurationMin;
  breakdown.durationPenalty = round1(durationMin * 0.45);
  breakdown.walkPenalty = round1((distanceM / 100) * 1.4);

  if (distanceM > ctx.maxWalkMeters) {
    const overM = distanceM - ctx.maxWalkMeters;
    breakdown.walkTolerancePenalty = round1(22 + (overM / 100) * 4);
    disqualifications.push(
      `Jarak berjalan langsung (${Math.round(distanceM)} m) melebihi batas kenyamanan berjalan Anda (${ctx.maxWalkMeters} m).`,
    );
  }

  const maxSteps = effectiveMaxSteps(ctx);
  if (walk.hasStairs && maxSteps !== null && walk.stepCount > maxSteps) {
    breakdown.accessibilityPenalty += 50;
    disqualifications.push(
      `Jalur mengandung ${walk.stepCount} anak tangga, melebihi batas profil/toleransi (${maxSteps}).`,
    );
  } else if (walk.hasStairs && walk.stepCount > 0) {
    const perStep = ctx.weightConfig.penalties.perStep || 3;
    breakdown.accessibilityPenalty += round1(Math.min(18, (walk.stepCount * perStep) / 10));
    warnings.push(`Memiliki ${walk.stepCount} anak tangga.`);
  }

  if (walk.route.barriers.length > 0) {
    breakdown.barrierPenalty = walk.route.barriers.length * 10;
    warnings.push(`Terdapat ${walk.route.barriers.length} laporan hambatan aktif di jalur.`);
  }

  if (!walk.route.dataFreshness.surveyedAt) {
    warnings.push("Sebagian ruas jalan kaki belum memiliki tanggal survei lapangan terbaru.");
  }

  const score = round1(
    breakdown.base -
      breakdown.durationPenalty -
      breakdown.walkPenalty -
      breakdown.walkTolerancePenalty -
      breakdown.accessibilityPenalty -
      breakdown.barrierPenalty,
  );

  const eligible = disqualifications.length === 0;
  const rationale = eligible
    ? `Rute jalan kaki langsung terjangkau (${Math.round(distanceM)} m, ±${durationMin} menit) tanpa perpindahan moda maupun tarif tambahan.`
    : disqualifications[0]!;

  const legDto = toWalkLegDto(walk)!;
  return {
    id: "direct-walk",
    kind: "direct_walk",
    mode: "walk",
    title: "Jalan Kaki Langsung (Graf Terverifikasi)",
    synthetic: false,
    verifiedFeed: false,
    eligible,
    disqualificationReasons: disqualifications,
    warnings,
    accessibilityUnknown: false,
    hasStaleSchedule: false,
    totalDurationMin: durationMin,
    totalWalkM: round1(distanceM),
    totalFareIdr: 0,
    transfers: 0,
    score: eligible ? score : Math.min(-1, score - 50),
    scoreBreakdown: breakdown,
    rationale,
    legs: [legDto],
    previewWalkRoute: walk.route,
  };
}

export function scoreTransitCandidate(
  candidate: TransitCandidateEvaluation,
  ctx: ScoringContext,
): MultimodalOptionDto {
  const breakdown = emptyBreakdown(100);
  const disqualifications: string[] = [];
  const warnings: string[] = [];
  const legs: MultimodalLegDto[] = [];

  // 1. Evaluate walk legs (first mile, optional transfer walk, last mile)
  const walkLegs = [
    candidate.firstMile,
    ...(candidate.transferWalk ? [candidate.transferWalk.walk] : []),
    candidate.lastMile,
  ];

  let totalWalkM = 0;
  let totalWalkMin = 0;
  let totalBarriers = 0;
  let totalWalkSteps = 0;
  let hasUncoveredWalk = false;

  for (const w of walkLegs) {
    if (!w.reachable || !w.route) {
      const msg =
        w.unreachable?.details?.reasons.map((r) => r.message).join("; ") ||
        w.unreachable?.message ||
        `Segmen jalan kaki ${w.fromLabel} -> ${w.toLabel} tidak terjangkau untuk profil ${ctx.profileId}.`;
      disqualifications.push(msg);
    } else {
      totalWalkM += w.route.totalDistanceM;
      totalWalkMin += w.route.estimatedDurationMin;
      totalBarriers += w.route.barriers.length;
      totalWalkSteps += w.stepCount;
      if (w.hasUncovered) hasUncoveredWalk = true;
    }
  }

  // Walking load vs maxWalkMeters tolerance
  breakdown.walkPenalty = round1((totalWalkM / 100) * 1.3);
  if (totalWalkM > ctx.maxWalkMeters) {
    const overM = totalWalkM - ctx.maxWalkMeters;
    breakdown.walkTolerancePenalty = round1(25 + (overM / 100) * 4);
    disqualifications.push(
      `Total jarak jalan kaki (${Math.round(totalWalkM)} m) melebihi batas toleransi Anda (${ctx.maxWalkMeters} m).`,
    );
  }

  // 2. Evaluate transit boarding, vehicle accessibility, unknown flags, schedule validity & staleness
  let totalTransitAndWaitMin = 0;
  let knownFareSum = 0;
  let anyUnknownFare = false;
  let accessibilityUnknown = false;
  let hasStaleSchedule = false;
  const maxStepsAllowed = effectiveMaxSteps(ctx);
  const avoidsStairs = profileForbidsStairs(ctx);

  for (const c of candidate.corridors) {
    const { corridor, boardStop, alightStop, schedule } = c;
    const stopStepCount = Math.max(
      corridor.stepCount ?? 0,
      boardStop.accessibility.stepCount ?? 0,
      alightStop.accessibility.stepCount ?? 0,
    );

    if (
      corridor.boardingAccessibility === "not_accessible" ||
      boardStop.accessibility.wheelchairBoarding === "not_accessible" ||
      alightStop.accessibility.wheelchairBoarding === "not_accessible" ||
      corridor.vehicleAccessibility === "high_floor_steps"
    ) {
      if (avoidsStairs || ctx.profileId === "crutches") {
        disqualifications.push(
          `${corridor.routeShortName} bertipe dek tinggi (${stopStepCount || 3} anak tangga) dan tidak memiliki akses naik bebas tangga untuk profil ${ctx.profileId}.`,
        );
      } else {
        const perStep = ctx.weightConfig.penalties.perStep || 3;
        breakdown.accessibilityPenalty += round1(Math.min(12, Math.max(2, stopStepCount * perStep * 0.25)));
        warnings.push(`${corridor.routeShortName} memerlukan naik turun ${stopStepCount || 3} anak tangga.`);
      }
    }

    if (
      maxStepsAllowed !== null &&
      maxStepsAllowed > 0 &&
      stopStepCount > maxStepsAllowed
    ) {
      disqualifications.push(
        `${corridor.routeShortName} memiliki ${stopStepCount} anak tangga, melebihi batas maksimal ${maxStepsAllowed} anak tangga.`,
      );
    }

    if (
      corridor.boardingAccessibility === "unknown" ||
      corridor.vehicleAccessibility === "unknown" ||
      boardStop.accessibility.wheelchairBoarding === "unknown" ||
      alightStop.accessibility.wheelchairBoarding === "unknown"
    ) {
      accessibilityUnknown = true;
      breakdown.uncertaintyPenalty += 28;
      warnings.push(
        `Aksesibilitas naik/turun ${corridor.routeShortName} berstatus belum diketahui (unknown) dan belum dapat dipastikan ramah kursi roda/lansia.`,
      );
    }

    if (ctx.profileId === "blind") {
      if (boardStop.accessibility.audioAnnouncement === false) {
        breakdown.accessibilityPenalty += 6;
        warnings.push(`Pengumuman audio di ${boardStop.name} belum tersedia.`);
      }
      if (boardStop.accessibility.tactilePaving === false || alightStop.accessibility.tactilePaving === false) {
        breakdown.accessibilityPenalty += 12;
        warnings.push(`Sebagian halte belum memiliki ubin pemandu taktil.`);
      }
    }

    if (!schedule.scheduleValid || !schedule.catchable) {
      disqualifications.push(
        schedule.reason ?? `Jadwal ${corridor.routeShortName} tidak valid atau tidak terkejar pada jam keberangkatan ini.`,
      );
    }

    if (schedule.isStale) {
      hasStaleSchedule = true;
      breakdown.stalenessPenalty += 24;
      warnings.push(
        schedule.reason ?? `Jadwal demo ${corridor.routeShortName} kedaluwarsa (> ${corridor.staleAfterMinutes} menit).`,
      );
    }

    totalTransitAndWaitMin += (schedule.waitMinutes ?? 0) + corridor.estimatedTransitDurationMin;

    if (corridor.fare.amountIdr === null) {
      anyUnknownFare = true;
      breakdown.uncertaintyPenalty += 5;
      warnings.push(`Tarif demo ${corridor.routeShortName} belum diketahui.`);
    } else {
      knownFareSum += corridor.fare.amountIdr;
    }
  }

  // 3. Evaluate transfer leg if 1-transfer
  const transfers = candidate.corridors.length - 1;
  if (candidate.transferWalk) {
    if (!candidate.transferWalk.catchable) {
      disqualifications.push(
        candidate.transferWalk.reasonIfUncatchable ?? "Waktu transfer antar koridor tidak mencukupi.",
      );
    }
    const transferPenaltyBase = ctx.preferFewerTransfers ? 14 : 6;
    breakdown.transferPenalty = transfers * transferPenaltyBase;
  }

  // 4. Evaluate walking stairs / uncovered / barriers
  if (totalWalkSteps > 0) {
    if (maxStepsAllowed !== null && totalWalkSteps > maxStepsAllowed) {
      disqualifications.push(
        `Jalur jalan kaki ke/dari halte mengandung ${totalWalkSteps} anak tangga (melebihi batas ${maxStepsAllowed}).`,
      );
    } else {
      const perStep = ctx.weightConfig.penalties.perStep || 3;
      breakdown.accessibilityPenalty += round1(Math.min(14, totalWalkSteps * (perStep * 0.25)));
      warnings.push(`Akses jalan kaki menuju halte mengandung ${totalWalkSteps} anak tangga.`);
    }
  }

  if (ctx.tolerance.avoid_uncovered && hasUncoveredWalk) {
    breakdown.accessibilityPenalty += 12;
    warnings.push("Sebagian jalur jalan kaki menuju/dari halte tidak beratap.");
  }

  if (totalBarriers > 0) {
    breakdown.barrierPenalty = totalBarriers * 10;
    warnings.push(`Terdapat ${totalBarriers} laporan hambatan aktif pada jalur jalan kaki menuju halte.`);
  }

  const totalDurationMin = Math.max(1, totalWalkMin + totalTransitAndWaitMin);
  breakdown.durationPenalty = round1(totalDurationMin * 0.35);
  breakdown.farePenalty = round1((knownFareSum / 1000) * 0.5);

  // Build ordered legs cleanly: firstMile -> transit1 -> (transferWalk -> transit2) -> lastMile
  const firstDto = toWalkLegDto(candidate.firstMile);
  if (firstDto) legs.push(firstDto);
  legs.push(toTransitLegDto(candidate.corridors[0]!));
  if (candidate.corridors[1] && candidate.transferWalk) {
    const tw = candidate.transferWalk;
    const transferWalkRoute = tw.walk.route;
    const transferDto: MultimodalTransferStepDto = {
      type: "transfer",
      fromCorridorName: candidate.corridors[0]!.corridor.routeShortName,
      toCorridorName: candidate.corridors[1]!.corridor.routeShortName,
      fromStopName: candidate.corridors[0]!.alightStop.name,
      toStopName: candidate.corridors[1]!.boardStop.name,
      minTransferMinutes: tw.spec.minTransferMinutes,
      actualTransferWindowMinutes: tw.actualWindowMinutes,
      walkDistanceM: transferWalkRoute ? transferWalkRoute.totalDistanceM : 0,
      walkDurationMin: transferWalkRoute ? transferWalkRoute.estimatedDurationMin : 0,
      edgeIds: transferWalkRoute ? transferWalkRoute.edgeIds : [],
      geometry: transferWalkRoute?.geometry ?? { type: "LineString", coordinates: [] },
      steps: transferWalkRoute?.steps ?? [],
      catchable: tw.catchable,
      reasonIfUncatchable: tw.reasonIfUncatchable,
    };
    legs.push(transferDto);
    legs.push(toTransitLegDto(candidate.corridors[1]!));
  }
  const lastDto = toWalkLegDto(candidate.lastMile);
  if (lastDto) legs.push(lastDto);

  const rawScore = round1(
    breakdown.base -
      breakdown.durationPenalty -
      breakdown.walkPenalty -
      breakdown.walkTolerancePenalty -
      breakdown.transferPenalty -
      breakdown.accessibilityPenalty -
      breakdown.uncertaintyPenalty -
      breakdown.stalenessPenalty -
      breakdown.farePenalty -
      breakdown.barrierPenalty,
  );

  const eligible = disqualifications.length === 0;
  const corridorNames = candidate.corridors.map((c) => c.corridor.routeShortName).join(" -> ");
  const title =
    transfers > 0
      ? `[DEMO] ${corridorNames} (${transfers}x transit)`
      : `[DEMO] ${corridorNames} (langsung)`;

  let rationale: string;
  if (!eligible) {
    rationale = disqualifications[0]!;
  } else if (accessibilityUnknown || hasStaleSchedule) {
    rationale = `Opsi tersedia dengan catatan kehati-hatian: ${warnings[0] ?? "aksesibilitas/jadwal perlu verifikasi tambahan."}`;
  } else {
    const firstDep = candidate.corridors[0]!.schedule.departureWib;
    rationale = `Jalur jalan kaki ${Math.round(totalWalkM)} m terverifikasi, naik ${corridorNames}${firstDep ? ` pukul ${firstDep}` : ""}, estimasi total ${totalDurationMin} menit (${transfers} transfer).`;
  }

  return {
    id: candidate.id,
    kind: candidate.kind,
    mode: "transit",
    title,
    synthetic: true,
    verifiedFeed: false,
    eligible,
    disqualificationReasons: disqualifications,
    warnings,
    accessibilityUnknown,
    hasStaleSchedule,
    totalDurationMin,
    totalWalkM: round1(totalWalkM),
    totalFareIdr: anyUnknownFare ? null : knownFareSum,
    transfers,
    score: eligible ? rawScore : Math.min(-1, rawScore - 60),
    scoreBreakdown: breakdown,
    rationale,
    legs,
    previewWalkRoute: candidate.firstMile.reachable && candidate.firstMile.route ? candidate.firstMile.route : null,
  };
}

export function buildCompanionFallbackOption(params: {
  reasons: string[];
  verifiedVolunteers: VerifiedVolunteerCandidateDto[];
  previewWalkRoute: PlanRouteResult | null;
}): MultimodalOptionDto {
  const topVolunteer = params.verifiedVolunteers[0];
  const rationale =
    params.reasons.length > 0
      ? `${params.reasons[0]} ${
          topVolunteer
            ? `Tersedia ${params.verifiedVolunteers.length} relawan terverifikasi (terdekat ${topVolunteer.name}, ${Math.round(topVolunteer.distanceM)} m) untuk ditinjau pada formulir pendampingan.`
            : "Anda dapat mengajukan permintaan pendampingan melalui formulir pendampingan."
        }`
      : "Pendamping relawan terverifikasi disarankan agar perjalanan tetap aman.";

  return {
    id: "companion-fallback",
    kind: "companion_fallback",
    mode: "companion",
    title: "Pendamping Relawan Terverifikasi",
    synthetic: false,
    verifiedFeed: false,
    eligible: true,
    disqualificationReasons: [],
    warnings: params.reasons,
    accessibilityUnknown: false,
    hasStaleSchedule: false,
    totalDurationMin: 0,
    totalWalkM: 0,
    totalFareIdr: 0,
    transfers: 0,
    score: 50,
    scoreBreakdown: emptyBreakdown(50),
    rationale,
    legs: [],
    previewWalkRoute: params.previewWalkRoute,
  };
}
