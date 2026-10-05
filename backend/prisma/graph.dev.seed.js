import "dotenv/config";
import { prisma } from "../src/config/prisma.js";
async function main() {
    console.log("[graph.dev.seed] Seeding development graph data...");
    await prisma.building.deleteMany({
        where: { code: { in: ["DEV-FT-KPFT", "DEV-GIK"] } },
    });
    const [kpft] = await prisma.$queryRaw `
    INSERT INTO buildings (
      id, name, code, faculty, location, floor_count, has_lift, has_accessible_toilet, surveyed_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      '[DEV] Gedung KPFT UGM',
      'DEV-FT-KPFT',
      'Fakultas Teknik',
      ST_SetSRID(ST_MakePoint(110.3725, -7.7655), 4326)::geography,
      3,
      false,
      true,
      NULL,
      now()
    )
    RETURNING id::text AS id
  `;
    const [gik] = await prisma.$queryRaw `
    INSERT INTO buildings (
      id, name, code, faculty, location, floor_count, has_lift, has_accessible_toilet, surveyed_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      '[DEV] Gelanggang Inovasi & Kreativitas',
      'DEV-GIK',
      'GIK',
      ST_SetSRID(ST_MakePoint(110.3740, -7.7662), 4326)::geography,
      2,
      true,
      true,
      NULL,
      now()
    )
    RETURNING id::text AS id
  `;
    const kpftId = kpft.id;
    const gikId = gik.id;
    await prisma.pathNode.deleteMany({
        where: { name: { startsWith: "[DEV]" } },
    });
    async function insertNode(params) {
        const [row] = await prisma.$queryRaw `
      INSERT INTO path_nodes (
        building_id, floor_level, node_type, name, location,
        crossing_type, has_traffic_signal, is_operational, status, surveyed_at, updated_at
      )
      VALUES (
        ${params.buildingId ?? null}::uuid,
        ${params.floorLevel},
        ${params.nodeType},
        ${params.name},
        ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
        ${params.crossingType ?? null},
        ${params.hasTrafficSignal ?? false},
        true,
        'approved',
        NULL,
        now()
      )
      RETURNING id
    `;
        return row.id;
    }
    const nGate = await insertNode({
        floorLevel: 0,
        nodeType: "gate",
        name: "[DEV] Gerbang Utama FT",
        lng: 110.3718,
        lat: -7.7655,
    });
    const nJunc = await insertNode({
        floorLevel: 0,
        nodeType: "junction",
        name: "[DEV] Simpang Taman FT",
        lng: 110.3721,
        lat: -7.7655,
    });
    const nStairsOut = await insertNode({
        floorLevel: 0,
        nodeType: "stairs",
        name: "[DEV] Tangga Teras KPFT",
        lng: 110.3723,
        lat: -7.7655,
    });
    const nRampOut = await insertNode({
        floorLevel: 0,
        nodeType: "ramp",
        name: "[DEV] Ramp Samping KPFT",
        lng: 110.3723,
        lat: -7.7657,
    });
    const nKpftEnt = await insertNode({
        buildingId: kpftId,
        floorLevel: 0,
        nodeType: "entrance",
        name: "[DEV] Pintu Utama KPFT Lantai 1",
        lng: 110.3725,
        lat: -7.7655,
    });
    const nKpftStairs1 = await insertNode({
        buildingId: kpftId,
        floorLevel: 0,
        nodeType: "stairs",
        name: "[DEV] Tangga Dalam KPFT Lt 1",
        lng: 110.3726,
        lat: -7.7655,
    });
    const nKpftStairs2 = await insertNode({
        buildingId: kpftId,
        floorLevel: 2,
        nodeType: "stairs",
        name: "[DEV] Tangga Dalam KPFT Lt 3",
        lng: 110.3726,
        lat: -7.7655,
    });
    const nKpftRoom3 = await insertNode({
        buildingId: kpftId,
        floorLevel: 2,
        nodeType: "room",
        name: "[DEV] Ruang Sidang KPFT Lt 3",
        lng: 110.3727,
        lat: -7.7655,
    });
    const nCrossing = await insertNode({
        floorLevel: 0,
        nodeType: "crossing",
        name: "[DEV] Penyeberangan Pelican GIK",
        lng: 110.3733,
        lat: -7.7659,
        crossingType: "pelican",
        hasTrafficSignal: true,
    });
    const nGikEnt = await insertNode({
        buildingId: gikId,
        floorLevel: 0,
        nodeType: "entrance",
        name: "[DEV] Pintu Barat GIK",
        lng: 110.3740,
        lat: -7.7662,
    });
    async function insertEdge(params) {
        await prisma.$executeRaw `
      INSERT INTO path_edges (
        source_node_id, target_node_id, geometry, length_m,
        surface_type, width_cm, has_stairs, step_count, slope_percent,
        has_handrail, is_covered, is_indoor, is_one_way,
        has_guiding_block, guiding_block_condition,
        is_operational, status, surveyed_at, updated_at
      )
      SELECT
        s.id,
        t.id,
        ST_MakeLine(s.location::geometry, t.location::geometry)::geography,
        GREATEST(1.0, ROUND(ST_Length(ST_MakeLine(s.location::geometry, t.location::geometry)::geography)::numeric, 2)),
        ${params.surfaceType},
        ${params.widthCm},
        ${params.hasStairs ?? false},
        ${params.stepCount ?? 0},
        ${params.slopePercent ?? 1.0},
        ${params.hasHandrail ?? false},
        ${params.isCovered ?? false},
        ${params.isIndoor ?? false},
        false,
        ${params.hasGuidingBlock ?? false},
        ${params.guidingBlockCondition ?? null},
        true,
        'approved',
        NULL,
        now()
      FROM path_nodes s, path_nodes t
      WHERE s.id = ${params.sourceId} AND t.id = ${params.targetId}
    `;
    }
    await insertEdge({
        sourceId: nGate,
        targetId: nJunc,
        surfaceType: "paving",
        widthCm: 180,
        hasGuidingBlock: true,
        guidingBlockCondition: "baik",
    });
    await insertEdge({
        sourceId: nJunc,
        targetId: nStairsOut,
        surfaceType: "keramik",
        widthCm: 150,
        hasGuidingBlock: true,
        guidingBlockCondition: "baik",
        isCovered: true,
    });
    await insertEdge({
        sourceId: nStairsOut,
        targetId: nKpftEnt,
        surfaceType: "keramik",
        widthCm: 150,
        hasStairs: true,
        stepCount: 4,
        hasHandrail: true,
        hasGuidingBlock: true,
        guidingBlockCondition: "baik",
        isCovered: true,
    });
    await insertEdge({
        sourceId: nJunc,
        targetId: nRampOut,
        surfaceType: "beton",
        widthCm: 160,
        slopePercent: 4.5,
        hasHandrail: true,
    });
    await insertEdge({
        sourceId: nRampOut,
        targetId: nKpftEnt,
        surfaceType: "beton",
        widthCm: 160,
        slopePercent: 5.0,
        hasHandrail: true,
        isCovered: true,
    });
    await insertEdge({
        sourceId: nKpftEnt,
        targetId: nKpftStairs1,
        surfaceType: "keramik",
        widthCm: 180,
        isIndoor: true,
        isCovered: true,
    });
    await insertEdge({
        sourceId: nKpftStairs1,
        targetId: nKpftStairs2,
        surfaceType: "keramik",
        widthCm: 140,
        hasStairs: true,
        stepCount: 24,
        hasHandrail: true,
        isIndoor: true,
        isCovered: true,
    });
    await insertEdge({
        sourceId: nKpftStairs2,
        targetId: nKpftRoom3,
        surfaceType: "keramik",
        widthCm: 180,
        isIndoor: true,
        isCovered: true,
    });
    await insertEdge({
        sourceId: nGate,
        targetId: nCrossing,
        surfaceType: "paving",
        widthCm: 180,
        hasGuidingBlock: true,
        guidingBlockCondition: "baik",
    });
    await insertEdge({
        sourceId: nCrossing,
        targetId: nGikEnt,
        surfaceType: "aspal",
        widthCm: 200,
        hasGuidingBlock: true,
        guidingBlockCondition: "baik",
    });
    console.log("[graph.dev.seed] Successfully seeded 2 dev buildings, 10 nodes, and 10 edges.");
}
main()
    .catch((err) => {
    console.error("[graph.dev.seed] Failed:", err);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=graph.dev.seed.js.map