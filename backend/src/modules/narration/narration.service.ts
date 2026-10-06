// Narration Service -- docs/API_CONTRACT.md §6, backend/docs/SDD.md §8.
// Template builder SELALU berhasil (tidak pernah gagal/throw) -- ini jalur
// fallback wajib kalau nanti LLM narration (P2) ditambahkan. Fakta (jarak,
// arah, jumlah anak tangga) SELALU berasal dari steps[] yang sudah dihitung
// Route Service -- file ini hanya menyusun kalimat, tidak pernah mengarang
// atau mengubah angka (aturan eksplisit SDD §8 & CLAUDE.md §5.5).
import type { NarrateRouteInput } from "./narration.schema.js";

const HIGH_SEVERITY_PREFIX: Record<string, string> = {
  stairs: "Hati-hati, ada tangga di depan.",
  slope: "Hati-hati, jalur di depan cukup curam.",
  guiding_block: "Perhatian, kondisi guiding block di depan tidak baik.",
  report: "Perhatian, ada laporan kondisi jalan di depan.",
};

function sentenceFor(step: NarrateRouteInput["steps"][number], isFirst: boolean, isLast: boolean): string {
  const highWarnings = step.warnings.filter((w) => w.severity === "high");
  const warningPrefix = highWarnings
    .map((w) => HIGH_SEVERITY_PREFIX[w.type] ?? w.message)
    .join(" ");

  const transition = isFirst ? "" : isLast ? "Terakhir, " : "Lalu, ";
  const instruction = isFirst
    ? step.instruction
    : step.instruction.charAt(0).toLowerCase() + step.instruction.slice(1);

  const body = `${transition}${instruction}`;
  return warningPrefix ? `${warningPrefix} ${body}` : body;
}

export interface NarrationResult {
  narration: string;
  generatedBy: "template";
}

// SDD §8 -- template builder, SELALU berhasil. Tidak ada jalur LLM di pass
// ini (P2, lihat catatan di atas) jadi generatedBy selalu "template".
export function buildNarration(input: NarrateRouteInput): NarrationResult {
  const sortedSteps = [...input.steps].sort((a, b) => a.order - b.order);

  const sentences = sortedSteps.map((step, i) =>
    sentenceFor(step, i === 0, i === sortedSteps.length - 1),
  );

  const narration = sentences.join(" ").replace(/\s+/g, " ").trim();

  return { narration, generatedBy: "template" };
}
