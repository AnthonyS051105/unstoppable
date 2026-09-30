// Road Report Service -- docs/API_CONTRACT.md §9, docs/DATA_MODEL.md §4 (pola
// query geospasial) & Keputusan A (report_edge_links memisahkan laporan-titik
// dari objek-graf-memanjang).
//
// Controller tidak boleh menyentuh Prisma langsung (backend/CLAUDE.local.md
// §3) -- semua akses data lewat fungsi-fungsi di file ini.
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import type { CreateReportInput } from "./reports.schema.js";
import { computeExpiresAt, REPORT_LINK_RADIUS_M, type ReportStatus } from "./reports.types.js";
import { uploadReportPhotos, type UploadedPhoto } from "./reports.storage.js";

// TransactionClient di-infer dari signature prisma.$transaction sendiri --
// supaya tidak perlu tahu/impor nama tipe internal Prisma 7 secara manual.
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface CreateReportParams {
  reporterId: string;
  input: CreateReportInput;
  photos: UploadedPhoto[];
}

interface CreatedReport {
  id: string;
  category: string;
  severity: string;
  status: string;
  corroborationCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  photoUrls: string[];
  linkedEdgeId: string | null;
}

/**
 * Membuat laporan baru:
 * 1. Insert road_reports (tanpa foto dulu -- butuh id untuk path storage).
 * 2. Upload foto ke Supabase Storage, simpan URL-nya ke report_photos.
 * 3. Kaitkan ke edge: pakai edgeId dari body kalau ada, kalau tidak cari
 *    otomatis edge terdekat dalam radius 15 m (BE-A-04-2 / BE-F-01-6 milik
 *    Nafal -- laporan aktif dipakai penalti routing lewat report_edge_links).
 *
 * Langkah 1 dan 3 dibungkus satu transaksi supaya laporan tidak pernah
 * tersimpan tanpa percobaan auto-link. Upload foto (langkah 2) sengaja di
 * LUAR transaksi DB karena itu panggilan ke layanan eksternal (Supabase) --
 * tidak bisa di-rollback oleh Postgres, dan tidak boleh menahan transaksi DB
 * menunggu jaringan.
 */
export async function createReport(params: CreateReportParams): Promise<CreatedReport> {
  const { reporterId, input, photos } = params;
  const [lng, lat] = input.location.coordinates;
  const expiresAt = computeExpiresAt(input.category);

  const { report, linkedEdgeId } = await prisma.$transaction(async (tx: TransactionClient) => {
    const [inserted] = await tx.$queryRaw<
      {
        id: string;
        category: string;
        severity: string;
        status: string;
        corroborationCount: number;
        createdAt: Date;
      }[]
    >`
      INSERT INTO road_reports (
        id, reporter_id, location, category, severity, description, status, expires_at, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${reporterId}::uuid,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${input.category},
        ${input.severity},
        ${input.description ?? null},
        'active',
        ${expiresAt},
        now()
      )
      RETURNING id, category, severity, status, corroboration_count AS "corroborationCount", created_at AS "createdAt"
    `;

    const linkedEdgeId = await linkReportToNearestEdge(tx, inserted!.id, input.edgeId, lng, lat);

    return { report: inserted!, linkedEdgeId };
  });

  const photoUrls = await uploadReportPhotos(report.id, photos);
  if (photoUrls.length > 0) {
    await prisma.reportPhoto.createMany({
      data: photoUrls.map((photoUrl, index) => ({
        reportId: report.id,
        photoUrl,
        displayOrder: index,
      })),
    });
  }

  return { ...report, expiresAt, photoUrls, linkedEdgeId };
}

async function linkReportToNearestEdge(
  tx: TransactionClient,
  reportId: string,
  explicitEdgeId: string | undefined,
  lng: number,
  lat: number,
): Promise<string | null> {
  if (explicitEdgeId) {
    const edgeExists = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM path_edges WHERE id = ${BigInt(explicitEdgeId)}
    `;
    if (edgeExists.length === 0) {
      throw new AppError("VALIDATION_ERROR", "edgeId yang diberikan tidak ditemukan di graf.", 400, {
        fieldErrors: { edgeId: ["Edge tidak ditemukan."] },
      });
    }
    await tx.$executeRaw`
      INSERT INTO report_edge_links (id, report_id, edge_id, effect)
      VALUES (gen_random_uuid(), ${reportId}::uuid, ${BigInt(explicitEdgeId)}, 'degrade')
    `;
    return explicitEdgeId;
  }

  // Auto-link: edge approved & operasional terdekat dalam radius 15 m.
  // Pola sama seperti "node terdekat" di docs/DATA_MODEL.md §4.4, tapi
  // ST_DWithin/operator jarak di sini melawan geometri edge (LineString),
  // bukan titik node. Kolom geometrinya `geometry` (lihat prisma/schema.prisma
  // model PathEdge), bukan `geom`.
  const [nearest] = await tx.$queryRaw<{ id: bigint }[]>`
    SELECT id
    FROM path_edges
    WHERE status = 'approved' AND is_operational = TRUE
      AND ST_DWithin(geometry, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${REPORT_LINK_RADIUS_M})
    ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    LIMIT 1
  `;

  if (!nearest) {
    // Tidak ada edge dalam radius -- laporan tetap tersimpan tanpa kaitan
    // graf (docs/API_CONTRACT.md §9), BUKAN error.
    return null;
  }

  await tx.$executeRaw`
    INSERT INTO report_edge_links (id, report_id, edge_id, effect)
    VALUES (gen_random_uuid(), ${reportId}::uuid, ${nearest.id}, 'degrade')
  `;
  return nearest.id.toString();
}

interface NearbyReport {
  id: string;
  category: string;
  severity: string;
  status: string;
  description: string | null;
  corroborationCount: number;
  distanceM: number;
  location: { type: "Point"; coordinates: [number, number] };
  createdAt: Date;
}

export async function findNearbyReports(params: {
  lng: number;
  lat: number;
  radiusM: number;
  status: ReportStatus;
}): Promise<NearbyReport[]> {
  const rows = await prisma.$queryRaw<Array<Omit<NearbyReport, "location"> & { geojson: string }>>`
    SELECT
      id, category, severity, status, description,
      corroboration_count AS "corroborationCount",
      created_at AS "createdAt",
      ST_AsGeoJSON(location) AS geojson,
      ST_Distance(location, ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography) AS "distanceM"
    FROM road_reports
    WHERE status = ${params.status}
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography, ${params.radiusM})
    ORDER BY "distanceM" ASC
    LIMIT 100
  `;

  return rows.map(({ geojson, ...rest }: Omit<NearbyReport, "location"> & { geojson: string }) => ({
    ...rest,
    location: JSON.parse(geojson),
  }));
}

interface AlongRouteReport {
  id: string;
  edgeId: string;
  category: string;
  severity: string;
  status: string;
  effect: string;
  createdAt: Date;
}

export async function findReportsAlongRoute(edgeIds: string[]): Promise<AlongRouteReport[]> {
  const bigIntEdgeIds = edgeIds.map((id) => BigInt(id));

  const rows = await prisma.$queryRaw<Array<Omit<AlongRouteReport, "edgeId"> & { edgeId: bigint }>>`
    SELECT
      rr.id, rel.edge_id AS "edgeId", rr.category, rr.severity, rr.status,
      rel.effect, rr.created_at AS "createdAt"
    FROM report_edge_links rel
    JOIN road_reports rr ON rr.id = rel.report_id
    WHERE rel.edge_id = ANY(${bigIntEdgeIds})
      AND rr.status = 'active'
    ORDER BY rr.created_at DESC
  `;

  return rows.map((row: Omit<AlongRouteReport, "edgeId"> & { edgeId: bigint }) => ({
    ...row,
    edgeId: row.edgeId.toString(),
  }));
}

/**
 * Menguatkan laporan orang lain. Satu user hanya boleh sekali per laporan
 * (docs/API_CONTRACT.md §9).
 *
 * !! MENUNGGU MIGRASI !! -- ini butuh tabel `report_user_corroborations`
 * (model Prisma `ReportUserCorroboration`) yang BELUM ada di schema.prisma.
 * Model ReportCorroboration yang sudah ada menautkan report<->report
 * (sourceReportId/targetReportId + distanceMeters, untuk penguatan spasial
 * otomatis), bukan user<->report, jadi tidak bisa dipakai untuk kebutuhan
 * ini -- lihat docs draf skema yang diusulkan (dikoordinasikan terpisah
 * dengan Nael, BUKAN diterapkan diam-diam ke schema.prisma).
 *
 * JANGAN deploy/panggil fungsi ini sebelum migrasi tsb disetujui & dijalankan
 * -- query di bawah akan gagal dengan "relation does not exist" kalau
 * tabelnya belum ada. Ditulis lengkap sekarang supaya begitu migrasi selesai,
 * tinggal dites tanpa perlu menulis ulang logikanya.
 *
 * @@unique([reportId, userId]) di tabel itulah yang menegakkan "sekali per
 * user" di level DB -- INSERT gagal dengan unique-violation, bukan
 * SELECT-lalu-INSERT yang rawan race condition kalau dua request datang
 * bersamaan untuk laporan yang sama.
 *
 * corroboration_count di road_reports dipakai LANGSUNG sebagai skala penalti
 * routing (LEAST(corroboration_count, 3), lihat docs/DATA_MODEL.md §4.5) dan
 * defaultnya 1 (pelapor pertama dihitung), jadi +1 di sini berarti "laporan
 * dikuatkan 1 pihak independen lagi" -- bukan menghitung dari 0.
 */
export async function corroborateReport(reportId: string, userId: string): Promise<{ corroborationCount: number }> {
  const report = await prisma.roadReport.findUnique({
    where: { id: reportId },
    select: { id: true, reporterId: true },
  });
  if (!report) {
    throw new AppError("NOT_FOUND", "Laporan tidak ditemukan.", 404);
  }
  if (report.reporterId === userId) {
    throw new AppError("FORBIDDEN", "Anda tidak bisa menguatkan laporan Anda sendiri.", 403);
  }

  try {
    const [, [updated]] = await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO report_user_corroborations (id, report_id, user_id, created_at)
        VALUES (gen_random_uuid(), ${reportId}::uuid, ${userId}::uuid, now())
      `,
      prisma.$queryRaw<{ corroborationCount: number }[]>`
        UPDATE road_reports
        SET corroboration_count = corroboration_count + 1
        WHERE id = ${reportId}::uuid
        RETURNING corroboration_count AS "corroborationCount"
      `,
    ]);
    return updated!;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new AppError("CONFLICT", "Anda sudah pernah menguatkan laporan ini.", 409);
    }
    throw err;
  }
}

// Postgres unique_violation = SQLSTATE 23505. $executeRaw melempar objek
// dengan `.code` ini (bukan P2002 milik Prisma Client biasa, karena di sini
// lewat raw query, bukan prisma.model.create()).
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
