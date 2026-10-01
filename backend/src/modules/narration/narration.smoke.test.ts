// Smoke test murni untuk narration.service.ts -- TIDAK butuh DB, buildNarration
// adalah fungsi murni. Jalankan: npx tsx src/modules/narration/narration.smoke.test.ts
import { buildNarration } from "./narration.service.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

function main() {
  // 1. Narasi normal, tanpa warning -- transisi "Lalu" & "Terakhir" muncul.
  const basic = buildNarration({
    steps: [
      { order: 1, instruction: "Jalan lurus 40 meter.", distanceM: 40, warnings: [] },
      { order: 2, instruction: "Belok, lalu jalan 20 meter.", distanceM: 20, warnings: [] },
      { order: 3, instruction: "Anda telah sampai di tujuan.", distanceM: 0, warnings: [] },
    ],
  });
  assert(basic.generatedBy === "template", "generatedBy selalu template (tidak ada jalur LLM di pass ini)");
  assert(basic.narration.startsWith("Jalan lurus 40 meter."), "kalimat pertama tidak diberi prefix transisi");
  assert(basic.narration.includes("Lalu, belok"), "kalimat tengah diberi prefix 'Lalu,' dan huruf awal dikecilkan");
  assert(basic.narration.includes("Terakhir, anda telah sampai"), "kalimat terakhir diberi prefix 'Terakhir,'");
  assert(basic.narration.includes("40 meter") && basic.narration.includes("20 meter"), "angka jarak tidak berubah dari input");

  // 2. Warning severity high -- harus muncul sebagai kalimat peringatan SEBELUM instruksi.
  const withWarning = buildNarration({
    steps: [
      { order: 1, instruction: "Jalan lurus 10 meter.", distanceM: 10, warnings: [] },
      {
        order: 2,
        instruction: "Ada 24 anak tangga.",
        distanceM: 20,
        warnings: [{ type: "stairs", severity: "high", message: "Ada 24 anak tangga di segmen ini." }],
      },
    ],
  });
  assert(withWarning.narration.includes("Hati-hati, ada tangga di depan."), "warning severity high memicu kalimat peringatan");
  assert(withWarning.narration.includes("24 anak tangga"), "jumlah anak tangga tidak berubah/hilang");

  // 3. Warning severity low/medium TIDAK memicu kalimat peringatan tambahan
  //    (supaya narasi tidak kebanjiran peringatan untuk hal kecil).
  const lowSeverity = buildNarration({
    steps: [
      {
        order: 1,
        instruction: "Jalan lurus 10 meter.",
        distanceM: 10,
        warnings: [{ type: "slope", severity: "medium", message: "Kelandaian 6%." }],
      },
    ],
  });
  assert(!lowSeverity.narration.includes("Hati-hati"), "warning severity medium tidak memicu kalimat peringatan");

  // 4. Steps tidak terurut (order acak) -- harus diurutkan ulang sebelum disusun.
  const unordered = buildNarration({
    steps: [
      { order: 2, instruction: "Langkah kedua.", distanceM: 10, warnings: [] },
      { order: 1, instruction: "Langkah pertama.", distanceM: 10, warnings: [] },
    ],
  });
  assert(unordered.narration.indexOf("Langkah pertama") < unordered.narration.indexOf("langkah kedua"), "steps diurutkan ulang berdasarkan order, bukan urutan array input");

  if (process.exitCode === 1) {
    console.error("\nSmoke test narration.service.ts GAGAL.");
  } else {
    console.log("\nSemua assertion narration.service.ts lulus.");
  }
}

main();
