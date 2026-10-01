// Ubah urutan edge hasil pgr_dijkstra jadi langkah yang bisa dibaca/didengar.
// Port dari backend/docs/SDD.md §4.5.
import type { GeoJsonPoint, PathEdgeRow, RouteBarrier, RouteStep, StepWarning, WarningSeverity } from "./routes.types.js";

const SENSITIVE_TO_STAIRS = new Set(["wheelchair", "crutches"]);

function roundTo5(meters: number): number {
  return Math.round(meters / 5) * 5;
}

function bearing([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function turnAngle(prevBearing: number, nextBearing: number): number {
  let diff = Math.abs(nextBearing - prevBearing) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function classifyTurn(angle: number): "lurus" | "belok" | "putar_balik" {
  if (angle < 30) return "lurus";
  if (angle <= 120) return "belok";
  return "putar_balik";
}

function sameAttributes(a: PathEdgeRow, b: PathEdgeRow): boolean {
  return (
    a.attributes.isIndoor === b.attributes.isIndoor &&
    a.attributes.hasStairs === b.attributes.hasStairs &&
    a.attributes.surfaceType === b.attributes.surfaceType
  );
}

function buildInstruction(edge: PathEdgeRow, distanceM: number, turn: "lurus" | "belok" | "putar_balik"): string {
  const jarak = roundTo5(distanceM);

  if (edge.attributes.hasStairs) {
    const pegangan = edge.attributes.hasHandrail ? ", ada pegangan tangan" : "";
    return `Ada ${edge.attributes.stepCount} anak tangga${pegangan}.`;
  }
  if (edge.attributes.slopePercent !== null && edge.attributes.slopePercent >= 5) {
    return `Naik ramp landai sepanjang ${jarak} meter.`;
  }
  if (turn === "belok") {
    return `Belok, lalu jalan ${jarak} meter.`;
  }
  if (turn === "putar_balik") {
    return `Putar balik, lalu jalan ${jarak} meter.`;
  }
  return edge.attributes.isIndoor
    ? `Jalan lurus ${jarak} meter menyusuri koridor.`
    : `Jalan lurus ${jarak} meter.`;
}

function buildWarnings(edge: PathEdgeRow, profileId: string): StepWarning[] {
  const warnings: StepWarning[] = [];

  if (edge.attributes.slopePercent !== null && Math.abs(edge.attributes.slopePercent) > 8) {
    const severity: WarningSeverity = Math.abs(edge.attributes.slopePercent) > 12 ? "high" : "medium";
    warnings.push({
      type: "slope",
      severity,
      message: `Kelandaian ${edge.attributes.slopePercent}% cukup curam.`,
    });
  }

  if (edge.attributes.hasStairs) {
    warnings.push({
      type: "stairs",
      severity: SENSITIVE_TO_STAIRS.has(profileId) ? "high" : "medium",
      message: `Ada ${edge.attributes.stepCount} anak tangga di segmen ini.`,
    });
  }

  if (edge.attributes.hasGuidingBlock && edge.attributes.guidingBlockCondition &&
      ["rusak", "terputus", "salah_arah"].includes(edge.attributes.guidingBlockCondition)) {
    warnings.push({
      type: "guiding_block",
      severity: profileId === "blind" ? "high" : "low",
      message: `Guiding block di segmen ini ${edge.attributes.guidingBlockCondition}.`,
    });
  }

  if (edge.activeReport) {
    warnings.push({
      type: "report",
      severity: (edge.activeReport.severity as WarningSeverity) ?? "medium",
      message: `Ada laporan komunitas: ${edge.activeReport.category}.`,
    });
  }

  return warnings;
}

export function buildSteps(
  edges: PathEdgeRow[],
  profileId: string,
): { steps: RouteStep[]; barriers: RouteBarrier[] } {
  const steps: RouteStep[] = [];
  const barriers: RouteBarrier[] = [];
  let prevBearingDeg: number | null = null;
  let order = 1;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!;
    const coords = edge.geometry.coordinates;
    const start = coords[0]!;
    const end = coords[coords.length - 1]!;
    const edgeBearing = bearing(start, end);

    const turn = prevBearingDeg === null ? "lurus" : classifyTurn(turnAngle(prevBearingDeg, edgeBearing));
    prevBearingDeg = edgeBearing;

    const prevStep = steps[steps.length - 1];
    const prevEdge = i > 0 ? edges[i - 1] : undefined;
    const canMerge = turn === "lurus" && prevEdge !== undefined && sameAttributes(prevEdge, edge) && prevStep;

    if (canMerge && prevStep) {
      prevStep.distanceM += edge.lengthM;
      prevStep.instruction = buildInstruction(edge, prevStep.distanceM, "lurus");
      prevStep.warnings.push(...buildWarnings(edge, profileId));
    } else {
      const startPoint: GeoJsonPoint = { type: "Point", coordinates: start };
      steps.push({
        order: order++,
        edgeId: edge.edgeId.toString(),
        instruction: buildInstruction(edge, edge.lengthM, turn),
        distanceM: roundTo5(edge.lengthM),
        startPoint,
        attributes: {
          surfaceType: edge.attributes.surfaceType,
          isIndoor: edge.attributes.isIndoor,
          hasStairs: edge.attributes.hasStairs,
          slopePercent: edge.attributes.slopePercent ?? 0,
        },
        warnings: buildWarnings(edge, profileId),
      });
    }

    if (edge.activeReport) {
      barriers.push({
        edgeId: edge.edgeId.toString(),
        source: "report",
        reportId: edge.activeReport.reportId,
        category: edge.activeReport.category,
        severity: edge.activeReport.severity,
        message: `Ada laporan komunitas (${edge.activeReport.category}) di segmen ini.`,
      });
    }
  }

  // Langkah terakhir: "tiba" -- ditambahkan terpisah, bukan digabung distance
  // merge di atas, supaya selalu muncul sebagai step tersendiri.
  if (steps.length > 0) {
    steps.push({
      order: order,
      edgeId: steps[steps.length - 1]!.edgeId,
      instruction: "Anda telah sampai di tujuan.",
      distanceM: 0,
      attributes: { surfaceType: null, isIndoor: false, hasStairs: false, slopePercent: 0 },
      warnings: [],
    });
  }

  return { steps, barriers };
}
