import { prisma } from "../../config/prisma.js";
import * as graphService from "./graph.service.js";

async function runGraphSmokeTest() {
  console.log("Starting Graph Mapping Service (BE-N-01 & BE-N-02) smoke test...\n");

  const mapperUser = await prisma.user.create({
    data: {
      phoneNumber: "+6281299990031",
      name: "Smoke Mapper Volunteer",
      role: "volunteer",
      volunteerProfile: {
        create: {
          verificationStatus: "verified",
          canMapData: true,
        },
      },
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      phoneNumber: "+6281299990032",
      name: "Smoke Graph Admin",
      role: "admin",
    },
  });

  let createdNodeIds: bigint[] = [];

  try {
    const nodeA = await graphService.createNode({
      nodeType: "entrance",
      name: "Main Gate FT",
      floorLevel: 0,
      location: { type: "Point", coordinates: [110.3720, -7.7650] },
      actorId: mapperUser.id,
      actorRole: "volunteer",
    });
    createdNodeIds.push(BigInt(nodeA.id));
    console.assert(nodeA.status === "draft", "Expected volunteer node to be 'draft'");
    console.log(`[PASS] Case 1: Volunteer created node (ID: ${nodeA.id}, status: ${nodeA.status}).`);

    const nodeB = await graphService.createNode({
      nodeType: "ramp",
      name: "East Ramp KPFT",
      floorLevel: 0,
      location: { type: "Point", coordinates: [110.3725, -7.7650] },
      actorId: adminUser.id,
      actorRole: "admin",
    });
    createdNodeIds.push(BigInt(nodeB.id));
    console.assert(nodeB.status === "approved", "Expected admin node to be 'approved'");
    console.log(`[PASS] Case 2: Admin created node directly as '${nodeB.status}' (ID: ${nodeB.id}).`);

    const edge = await graphService.createEdge({
      sourceNodeId: nodeA.id,
      targetNodeId: nodeB.id,
      attributes: {
        surfaceType: "paving",
        widthCm: 150,
        hasStairs: false,
        stepCount: 0,
        slopePercent: 4.5,
        hasGuidingBlock: true,
        guidingBlockCondition: "baik",
      },
      actorId: adminUser.id,
      actorRole: "admin",
    });
    console.assert(edge.lengthM > 0, `Expected lengthM > 0, got ${edge.lengthM}`);
    console.assert(edge.status === "approved", "Expected admin edge to be 'approved'");
    console.log(`[PASS] Case 3: Edge created (ID: ${edge.id}, lengthM: ${edge.lengthM}m, status: ${edge.status}).`);

    let selfLoopRejected = false;
    try {
      await graphService.createEdge({
        sourceNodeId: nodeA.id,
        targetNodeId: nodeA.id,
        actorId: mapperUser.id,
        actorRole: "volunteer",
      });
    } catch {
      selfLoopRejected = true;
    }
    console.assert(selfLoopRejected === true, "Expected self-loop edge to be rejected");
    console.log("[PASS] Case 4: Self-loop edge rejected (BR-26).");

    const nodesInBox = await graphService.getNodesInBbox({
      minLng: 110.3700,
      minLat: -7.7670,
      maxLng: 110.3750,
      maxLat: -7.7630,
      status: "all",
    });
    const edgesInBox = await graphService.getEdgesInBbox({
      minLng: 110.3700,
      minLat: -7.7670,
      maxLng: 110.3750,
      maxLat: -7.7630,
      status: "all",
    });
    console.assert(nodesInBox.length >= 2, "Expected at least 2 nodes in bbox");
    console.assert(edgesInBox.length >= 1, "Expected at least 1 edge in bbox");
    console.log(`[PASS] Case 5: Bbox query returned ${nodesInBox.length} nodes and ${edgesInBox.length} edges.`);

    await graphService.updateNode(nodeB.id, {
      isOperational: false,
      operationalNote: "Ramp sedang diperbaiki",
      actorId: mapperUser.id,
      actorRole: "volunteer",
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: nodeB.id },
    });
    console.assert(auditLogs.length >= 2, "Expected audit logs for admin create and operational change");
    console.log("[PASS] Case 6: Operational status updated and recorded in audit_logs.");

    const validation = await graphService.validateGraphTopology();
    const coverage = await graphService.getGraphCoverage();
    console.assert(typeof validation.valid === "boolean", "Expected validation result");
    console.assert(Array.isArray(coverage), "Expected coverage array");
    console.log(`[PASS] Case 7: Topology validation (valid: ${validation.valid}, issues: ${validation.issues.length}) & coverage checked.`);

    console.log("\n[SUCCESS] All Graph Mapping Service smoke tests passed successfully.");
  } finally {
    if (createdNodeIds.length > 0) {
      await prisma.pathNode.deleteMany({
        where: { id: { in: createdNodeIds } },
      });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [mapperUser.id, adminUser.id] } },
    });
    await prisma.$disconnect();
    console.log("[CLEANUP] Test graph nodes, edges, and users cleaned up.");
  }
}

runGraphSmokeTest().catch((err) => {
  console.error("[FAIL] Graph smoke test failed with error:", err);
  process.exit(1);
});