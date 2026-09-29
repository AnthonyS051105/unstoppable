import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { createNode, createEdge } from "../graph/graph.service.js";
import {
    getVerificationQueue,
    approveVerificationItem,
    rejectVerificationItem,
} from "./verification.service.js";

async function main() {
    console.log("Starting Verification Service smoke test...\n");

    const suffix = Date.now().toString().slice(-6);
    const volunteerId = randomUUID();
    const adminId = randomUUID();
    const reportId = randomUUID();
    const createdNodeIds: bigint[] = [];
    const createdEdgeIds: bigint[] = [];

    try {
        await prisma.user.createMany({
        data: [
            {
            id: volunteerId,
            name: "Smoke Test Volunteer Verif",
            phoneNumber: `+62813${suffix}1`,
            passwordHash: "hashed",
            role: "volunteer",
            phoneVerified: true,
            },
            {
            id: adminId,
            name: "Smoke Test Admin Verif",
            phoneNumber: `+62813${suffix}2`,
            passwordHash: "hashed",
            role: "admin",
            phoneVerified: true,
            },
        ],
        });

        // Case 1: Seed draft nodes, draft edge, and unverified active report
        const nodeA = await createNode({
        nodeType: "entrance",
        name: "Draft Node A",
        floorLevel: 0,
        location: { type: "Point", coordinates: [110.376, -7.765] },
        actorId: volunteerId,
        actorRole: "volunteer",
        });
        createdNodeIds.push(BigInt(nodeA.id));

        const nodeB = await createNode({
        nodeType: "junction",
        name: "Draft Node B",
        floorLevel: 0,
        location: { type: "Point", coordinates: [110.3765, -7.765] },
        actorId: volunteerId,
        actorRole: "volunteer",
        });
        createdNodeIds.push(BigInt(nodeB.id));

        const edgeAB = await createEdge({
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        surfaceType: "paving",
        widthCm: 150,
        actorId: volunteerId,
        actorRole: "volunteer",
        });
        createdEdgeIds.push(BigInt(edgeAB.id));

        await prisma.$executeRaw`
        INSERT INTO road_reports (
            id, reporter_id, location, category, severity, description, status, corroboration_count
        )
        VALUES (
            ${reportId}::uuid,
            ${volunteerId}::uuid,
            ST_SetSRID(ST_MakePoint(110.3762, -7.765), 4326)::geography,
            'terhalang',
            'high',
            'Trotoar tertutup material proyek',
            'active',
            1
        )
        `;

        await prisma.reportEdgeLink.create({
        data: {
            reportId,
            edgeId: BigInt(edgeAB.id),
            effect: "degrade",
        },
        });

        // Case 2: Fetch verification queue
        const queue = await getVerificationQueue({ limit: 50 });
        const hasNodeA = queue.data.some((i) => i.id === `node:${nodeA.id}`);
        const hasEdgeAB = queue.data.some((i) => i.id === `edge:${edgeAB.id}`);
        const hasReport = queue.data.some((i) => i.id === `report_effect:${reportId}`);
        assert.equal(hasNodeA, true, "Queue should contain draft Node A");
        assert.equal(hasEdgeAB, true, "Queue should contain draft Edge AB");
        assert.equal(hasReport, true, "Queue should contain unverified Report");
        console.log(
        `[PASS] Case 1 & 2: Verification queue returned ${queue.data.length} pending items (node, edge, report_effect).`,
        );

        // Case 3: Approve Node A and Edge AB
        const approvedNode = await approveVerificationItem({
        id: `node:${nodeA.id}`,
        adminId,
        note: "Lokasi pintu masuk valid",
        });
        assert.equal(approvedNode.status, "approved");

        const approvedEdge = await approveVerificationItem({
        id: edgeAB.id,
        type: "edge",
        adminId,
        });
        assert.equal(approvedEdge.status, "approved");

        const nodeApproveLog = await prisma.auditLog.findFirst({
        where: {
            actorId: adminId,
            action: "verification.approve_node",
            resourceId: nodeA.id,
        },
        });
        assert.ok(nodeApproveLog, "Audit log for node approval must exist");
        console.log("[PASS] Case 3: Node and Edge approved and recorded in audit_logs.");

        // Case 4: Approve report_effect -> updates ReportEdgeLink effect to 'block'
        const approvedReport = await approveVerificationItem({
        id: `report_effect:${reportId}`,
        adminId,
        effect: "block",
        });
        assert.equal(approvedReport.effect, "block");

        const updatedLink = await prisma.reportEdgeLink.findFirst({
        where: { reportId },
        });
        assert.equal(updatedLink?.effect, "block", "ReportEdgeLink effect should be updated to 'block'");
        console.log("[PASS] Case 4: Report effect approved and updated ReportEdgeLink to 'block'.");

        // Case 5: Reject without reason must fail with VALIDATION_ERROR
        let emptyReasonRejected = false;
        try {
        await rejectVerificationItem({
            id: `node:${nodeB.id}`,
            adminId,
            reason: "   ",
        });
        } catch (err: any) {
        if (err.code === "VALIDATION_ERROR") {
            emptyReasonRejected = true;
        }
        }
        assert.equal(emptyReasonRejected, true, "Empty rejection reason must throw VALIDATION_ERROR");
        console.log("[PASS] Case 5: Rejection without reason rejected with VALIDATION_ERROR.");

        // Case 6: Reject Node B with valid reason
        const rejectedNode = await rejectVerificationItem({
        id: `node:${nodeB.id}`,
        adminId,
        reason: "Titik koordinat meleset ke jalan raya.",
        });
        assert.equal(rejectedNode.status, "rejected");
        assert.equal(rejectedNode.rejectReason, "Titik koordinat meleset ke jalan raya.");

        const rejectLog = await prisma.auditLog.findFirst({
        where: {
            actorId: adminId,
            action: "verification.reject_node",
            resourceId: nodeB.id,
        },
        });
        assert.ok(rejectLog, "Audit log for node rejection must exist");
        console.log("[PASS] Case 6: Node rejected with reason and recorded in audit_logs.");

        console.log("\n[SUCCESS] All Verification Service smoke tests passed successfully.");
    } finally {
        await prisma.auditLog.deleteMany({
        where: { actorId: { in: [volunteerId, adminId] } },
        });
        await prisma.roadReport.deleteMany({
        where: { id: reportId },
        });
        if (createdEdgeIds.length > 0) {
        await prisma.pathEdge.deleteMany({
            where: { id: { in: createdEdgeIds } },
        });
        }
        if (createdNodeIds.length > 0) {
        await prisma.pathNode.deleteMany({
            where: { id: { in: createdNodeIds } },
        });
        }
        await prisma.user.deleteMany({
        where: { id: { in: [volunteerId, adminId] } },
        });
        await prisma.$disconnect();
        console.log("[CLEANUP] Test verification data and users cleaned up.");
    }
}

main().catch((err) => {
    console.error("[FAIL] Verification smoke test failed:", err);
    process.exit(1);
});