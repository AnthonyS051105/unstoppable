import { Fragment } from "react";
import { Badge, LinkBtn } from "@/components/ui";
import { extractFacilityScores, getBuildingAdvocacySummary } from "@/lib/api/buildings";
import type { BuildingAccessibilityScore } from "@/types/api";

/** Shared presentation for backend aggregate scores and the evidence behind them. */
export function BuildingScore({ score }: { score: BuildingAccessibilityScore }) {
  const summary = getBuildingAdvocacySummary(score);
  return (
    <div className="stack">
      <div className="row between">
        <p><strong>Skor aksesibilitas agregat: {summary.scoreFormatted}</strong></p>
        <Badge label={summary.badgeText} kind={summary.badgeKind} />
      </div>
      <p>Skor menggabungkan akses masuk (30%), akses antarlantai (30%), jalur (25%), dan toilet (15%). Data yang belum lengkap ditampilkan tanpa skor agregat.</p>
      <dl className="aspect-list">
        {extractFacilityScores(score).map(facility => (
          <Fragment key={facility.key}>
            <dt>{facility.label}</dt>
            <dd>
              <strong>{facility.score === null ? "—" : `${facility.score}/100`}</strong> · {facility.statusLabel}
              <p>{facility.note}</p>
            </dd>
          </Fragment>
        ))}
      </dl>
      <h3>Prioritas advokasi fasilitas inklusif</h3>
      <ul>{summary.recommendations.map(recommendation => <li key={recommendation}>{recommendation}</li>)}</ul>
      <p>Gunakan hasil ini sebagai bahan diskusi dengan pengelola kampus. Skor agregat belum memastikan suatu rute sesuai kebutuhan pribadi Anda.</p>
      <LinkBtn label="Laporkan kondisi fasilitas" route="report" icon="octagon-alert" />
    </div>
  );
}
