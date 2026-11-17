"use client";

import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Fragment } from "react";
import { Badge, LinkBtn } from "@/components/ui";
import { extractFacilityScores, getBuildingAdvocacySummary } from "@/lib/api/buildings";
import type { BuildingAccessibilityScore } from "@/types/api";

/** Shared presentation for backend aggregate scores and the evidence behind them. */
export function BuildingScore({ score }: { score: BuildingAccessibilityScore }) {
  const mobile = useMediaQuery("(max-width:960px)");
  const summary = getBuildingAdvocacySummary(score);
  if (mobile) return <MobileBuildingScore score={score} />;
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

/** Unknown evidence is a named state, never a zero or an ambiguous dash. */
export function MobileBuildingScore({ score }: { score: BuildingAccessibilityScore }) {
  const summary = getBuildingAdvocacySummary(score);
  return (
    <div className="mobile-building-score">
      <div className="building-score-overview">
        <h3>Skor aksesibilitas keseluruhan</h3>
        <strong className="building-score-value">{score.accessibilityScore === null ? "Belum tersedia" : `${score.accessibilityScore}/100`}</strong>
        <Badge label={summary.badgeText} kind={summary.badgeKind} />
        {score.accessibilityScore === null ? <p>Skor belum dihitung karena data survei aksesibilitas belum lengkap.</p> : null}
      </div>
      <details className="score-method">
        <summary>Cara penilaian skor</summary>
        <p>Akses masuk menyumbang 30%, akses antarlantai 30%, jalur 25%, dan toilet 15%. Skor keseluruhan tersedia setelah seluruh aspek dinilai.</p>
      </details>
      <dl className="building-facility-scores">
        {extractFacilityScores(score).map(facility => (
          <div key={facility.key}>
            <dt>{facility.label}</dt>
            <dd>
              <span className={`facility-score ${facility.score === null ? "unavailable" : ""}`}>
                {facility.score === null ? "Belum dinilai" : `${facility.score}/100`}
              </span>
              {facility.score !== null ? <span className="facility-score-status">{facility.statusLabel}</span> : null}
              <p>{facility.note}</p>
            </dd>
          </div>
        ))}
      </dl>
      <details className="score-recommendations">
        <summary>Prioritas perbaikan fasilitas</summary>
        <ul>{summary.recommendations.map(recommendation => <li key={recommendation}>{recommendation}</li>)}</ul>
        <p>Skor gedung belum memastikan setiap rute sesuai kebutuhan pribadi Anda.</p>
      </details>
      <LinkBtn label="Laporkan kondisi fasilitas" route="report" icon="octagon-alert" />
    </div>
  );
}
