// Diff antar hasil rute tiap profil (docs/API_CONTRACT.md §5, SDD §4.6).
// Dipisah dari routes.service.ts karena ini LOGIKA MURNI (tidak menyentuh DB) --
// supaya bisa diuji unit tanpa koneksi Supabase (routes.differences.test.ts).
import type { CompareResultEntry, RouteDifference } from "./routes.types.js";

// SDD §4.6 -- diff edgeIds antar hasil tiap profil.
export function buildDifferences(results: CompareResultEntry[]): RouteDifference[] {
  const differences: RouteDifference[] = [];
  const reachableResults = results.filter((r) => r.reachable && r.edgeIds);

  for (const unreachable of results.filter((r) => !r.reachable)) {
    differences.push({
      type: "unreachable",
      profileId: unreachable.profileId,
      reason: unreachable.reasons?.[0]?.message ?? "Tujuan ini tidak terjangkau untuk profil ini.",
    });
  }

  for (let i = 0; i < reachableResults.length; i++) {
    for (let j = 0; j < reachableResults.length; j++) {
      if (i === j) continue;
      const a = reachableResults[i]!;
      const b = reachableResults[j]!;
      const setA = new Set(a.edgeIds);
      const setB = new Set(b.edgeIds);
      const avoidedByA = [...setB].filter((id) => !setA.has(id));

      for (const edgeId of avoidedByA) {
        const edge = b.steps?.find((s) => s.edgeId === edgeId);
        if (edge?.attributes.hasStairs) {
          differences.push({
            type: "avoided_edge",
            edgeId,
            avoidedByProfileId: a.profileId,
            reason: `Segmen ini memiliki tangga tanpa alternatif ramp.`,
          });
        }
      }

      if (a.totalDistanceM && b.totalDistanceM && a.totalDistanceM > b.totalDistanceM * 1.15) {
        differences.push({
          type: "extra_distance",
          profileId: a.profileId,
          extraM: Math.round(a.totalDistanceM - b.totalDistanceM),
          reason: `Rute untuk profil ini ${Math.round(a.totalDistanceM - b.totalDistanceM)} meter lebih jauh.`,
        });
      }
    }
  }

  differences.push(...buildEntranceDifferences(reachableResults));

  return differences;
}

// SDD §4.6 / kontrak §5 -- deteksi SEDERHANA `different_entrance`: dua profil
// yang sama-sama sampai tujuan, tapi lewat EDGE MASUK TERAKHIR yang berbeda,
// dianggap memakai titik masuk/pintu yang berbeda ke gedung tujuan. Heuristik:
// bandingkan edge terakhir (edgeIds[last]) tiap pasang profil terjangkau.
// Pasangan dibandingkan sekali (i < j) supaya satu perbedaan pintu masuk tidak
// menghasilkan dua entry cermin. Edge terakhir dipilih karena itulah segmen
// yang menuju simpul tujuan -- pendekatan ringan tanpa menelusuri building_id
// tiap node (bisa dipertajam nanti bila data uji nyata tersedia).
export function buildEntranceDifferences(reachableResults: CompareResultEntry[]): RouteDifference[] {
  const out: RouteDifference[] = [];

  for (let i = 0; i < reachableResults.length; i++) {
    for (let j = i + 1; j < reachableResults.length; j++) {
      const a = reachableResults[i]!;
      const b = reachableResults[j]!;
      const lastA = a.edgeIds?.[a.edgeIds.length - 1];
      const lastB = b.edgeIds?.[b.edgeIds.length - 1];
      if (!lastA || !lastB) continue;
      if (lastA !== lastB) {
        out.push({
          type: "different_entrance",
          edgeId: lastB,
          profileId: a.profileId,
          avoidedByProfileId: b.profileId,
          reason: `Profil "${a.profileId}" dan "${b.profileId}" mencapai tujuan lewat titik masuk yang berbeda (segmen masuk terakhir ${lastA} vs ${lastB}).`,
        });
      }
    }
  }

  return out;
}
