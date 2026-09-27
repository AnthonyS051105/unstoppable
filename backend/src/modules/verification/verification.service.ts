import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";
import { recordAuditLog } from "../../shared/audit-log.service.js";

export type VerificationItemType = "node" | "edge" | "report_effect" | "report";

export interface VerificationQueueQuery {
    type?: VerificationItemType;
    page?: number;
    limit?: number;
}

export interface VerificationQueueItem {
    id: string;
    itemType: "node" | "edge" | "report_effect";
    itemId: string;
    changeType: "create" | "update";
    submittedBy: { id: string; name: string } | null;
    submittedAt: Date;
    preview: Record<string, unknown>;
    currentValue: Record<string, unknown> | null;
}

// GET /api/verification/queue?type=&page=
export async function getVerificationQueue(query: VerificationQueueQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;
    const filterType = query.type === "report" ? "report_effect" : query.type;

    const items: VerificationQueueItem[] = [];

    if (!filterType || filterType === "node") {
        const nodes = await prisma.pathNode.findMany({
        where: { status: "draft" },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
        });

        for (const n of nodes) {
        const idStr = n.id.toString();
        items.push({
            id: `node:${idStr}`,
            itemType: "node",
            itemId: idStr,
            changeType: "create",
            submittedBy: n.createdBy
            ? { id: n.createdBy.id, name: n.createdBy.name }
            : null,
            submittedAt: n.createdAt,
            preview: {
            nodeType: n.nodeType,
            name: n.name,
            buildingId: n.buildingId,
            floorLevel: n.floorLevel,
            crossingType: n.crossingType,
            hasTrafficSignal: n.hasTrafficSignal,
            isOperational: n.isOperational,
            },
            currentValue: null,
        });
        }
    }

    if (!filterType || filterType === "edge") {
        const edges = await prisma.pathEdge.findMany({
        where: { status: "draft" },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
        });

        for (const e of edges) {
        const idStr = e.id.toString();
        const meta = (e.metadata as Record<string, unknown> | null) ?? null;
        const isUpdate = Boolean(meta && meta.replacesEdgeId);

        items.push({
            id: `edge:${idStr}`,
            itemType: "edge",
            itemId: idStr,
            changeType: isUpdate ? "update" : "create",
            submittedBy: e.createdBy
            ? { id: e.createdBy.id, name: e.createdBy.name }
            : null,
            submittedAt: e.createdAt,
            preview: {
            sourceNodeId: e.sourceNodeId.toString(),
            targetNodeId: e.targetNodeId.toString(),
            lengthM: Number(e.lengthM),
            surfaceType: e.surfaceType,
            widthCm: e.widthCm,
            hasStairs: e.hasStairs,
            stepCount: e.stepCount,
            slopePercent: e.slopePercent !== null ? Number(e.slopePercent) : null,
            hasGuidingBlock: e.hasGuidingBlock,
            guidingBlockCondition: e.guidingBlockCondition,
            },
            currentValue: null,
        });
        }
    }

    if (!filterType || filterType === "report_effect") {
        const reports = await prisma.roadReport.findMany({
        where: { status: "active" },
        include: {
            reporter: { select: { id: true, name: true } },
            edgeLinks: true,
        },
        orderBy: { createdAt: "asc" },
        });

        for (const r of reports) {
        const meta = (r.metadata as Record<string, unknown> | null) ?? null;
        if (meta?.verifiedAt) continue;

        items.push({
            id: `report_effect:${r.id}`,
            itemType: "report_effect",
            itemId: r.id,
            changeType: "create",
            submittedBy: { id: r.reporter.id, name: r.reporter.name },
            submittedAt: r.createdAt,
            preview: {
            category: r.category,
            severity: r.severity,
            description: r.description,
            corroborationCount: r.corroborationCount,
            edgeLinks: r.edgeLinks.map((l) => ({
                id: l.id,
                edgeId: l.edgeId?.toString() ?? null,
                nodeId: l.nodeId?.toString() ?? null,
                effect: l.effect,
            })),
            },
            currentValue: null,
        });
        }
    }

    items.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
    const paged = items.slice(offset, offset + limit);

    return {
        data: paged,
        meta: {
        page,
        limit,
        total: items.length,
        },
    };
}

function parseTarget(rawId: string, explicitType?: VerificationItemType): {
    type: "node" | "edge" | "report_effect";
    id: string;
    } {
    if (rawId.includes(":")) {
        const [prefix, rest] = rawId.split(":", 2);
        if (prefix === "node" || prefix === "edge" || prefix === "report_effect") {
        return { type: prefix, id: rest! };
        }
        if (prefix === "report") {
        return { type: "report_effect", id: rest! };
        }
    }

    if (explicitType) {
        return {
        type: explicitType === "report" ? "report_effect" : explicitType,
        id: rawId,
        };
    }

    throw new AppError(
        "VALIDATION_ERROR",
        "Verification item type is required (use 'node:<id>', 'edge:<id>', 'report_effect:<id>', or provide type).",
        400,
    );
}

// POST /api/verification/:id/approve (or /:type/:id/approve)
export async function approveVerificationItem(params: {
    id: string;
    type?: VerificationItemType;
    adminId: string;
    effect?: "block" | "degrade" | "info";
    note?: string;
    }) {
    const target = parseTarget(params.id, params.type);

    if (target.type === "node") {
        const nodeId = BigInt(target.id);
        const existing = await prisma.pathNode.findUnique({ where: { id: nodeId } });
        if (!existing) throw new AppError("NOT_FOUND", "Node not found.", 404);

        const updated = await prisma.pathNode.update({
        where: { id: nodeId },
        data: {
            status: "approved",
            approvedById: params.adminId,
            rejectReason: null,
        },
        });

        await recordAuditLog({
        actorId: params.adminId,
        action: "verification.approve_node",
        resourceType: "path_node",
        resourceId: target.id,
        metadata: { note: params.note ?? null },
        });

        return {
        id: `node:${updated.id.toString()}`,
        itemType: "node",
        itemId: updated.id.toString(),
        status: updated.status,
        };
    }

    if (target.type === "edge") {
        const edgeId = BigInt(target.id);
        const existing = await prisma.pathEdge.findUnique({ where: { id: edgeId } });
        if (!existing) throw new AppError("NOT_FOUND", "Edge not found.", 404);

        const updated = await prisma.pathEdge.update({
        where: { id: edgeId },
        data: {
            status: "approved",
            approvedById: params.adminId,
            rejectReason: null,
        },
        });

        await recordAuditLog({
        actorId: params.adminId,
        action: "verification.approve_edge",
        resourceType: "path_edge",
        resourceId: target.id,
        metadata: { note: params.note ?? null },
        });

        return {
        id: `edge:${updated.id.toString()}`,
        itemType: "edge",
        itemId: updated.id.toString(),
        status: updated.status,
        };
    }

    const existingReport = await prisma.roadReport.findUnique({
        where: { id: target.id },
        include: { edgeLinks: true },
    });
    if (!existingReport) throw new AppError("NOT_FOUND", "Report not found.", 404);

    const newEffect =
        params.effect ?? (existingReport.severity === "high" ? "block" : "degrade");

    if (existingReport.edgeLinks.length > 0) {
        await prisma.reportEdgeLink.updateMany({
        where: { reportId: existingReport.id },
        data: { effect: newEffect },
        });
    }

    const prevMeta = (existingReport.metadata as Record<string, unknown> | null) ?? {};
    const updatedReport = await prisma.roadReport.update({
        where: { id: existingReport.id },
        data: {
        status: "active",
        metadata: {
            ...prevMeta,
            verifiedBy: params.adminId,
            verifiedAt: new Date().toISOString(),
            effect: newEffect,
        },
        },
    });

    await recordAuditLog({
        actorId: params.adminId,
        action: "verification.approve_report",
        resourceType: "road_report",
        resourceId: target.id,
        metadata: { effect: newEffect, note: params.note ?? null },
    });

    return {
        id: `report_effect:${updatedReport.id}`,
        itemType: "report_effect",
        itemId: updatedReport.id,
        status: updatedReport.status,
        effect: newEffect,
    };
}

// POST /api/verification/:id/reject (or /:type/:id/reject)
export async function rejectVerificationItem(params: {
    id: string;
    type?: VerificationItemType;
    adminId: string;
    reason: string;
    }) {
    if (!params.reason || params.reason.trim().length === 0) {
        throw new AppError(
        "VALIDATION_ERROR",
        "Rejection reason is required.",
        400,
        { fieldErrors: { reason: ["Alasan penolakan wajib diisi."] } },
        );
    }

    const reason = params.reason.trim();
    const target = parseTarget(params.id, params.type);

    if (target.type === "node") {
        const nodeId = BigInt(target.id);
        const existing = await prisma.pathNode.findUnique({ where: { id: nodeId } });
        if (!existing) throw new AppError("NOT_FOUND", "Node not found.", 404);

        const updated = await prisma.pathNode.update({
        where: { id: nodeId },
        data: {
            status: "rejected",
            approvedById: params.adminId,
            rejectReason: reason,
        },
        });

        await recordAuditLog({
        actorId: params.adminId,
        action: "verification.reject_node",
        resourceType: "path_node",
        resourceId: target.id,
        metadata: { reason },
        });

        return {
        id: `node:${updated.id.toString()}`,
        itemType: "node",
        itemId: updated.id.toString(),
        status: updated.status,
        rejectReason: updated.rejectReason,
        };
    }

    if (target.type === "edge") {
        const edgeId = BigInt(target.id);
        const existing = await prisma.pathEdge.findUnique({ where: { id: edgeId } });
        if (!existing) throw new AppError("NOT_FOUND", "Edge not found.", 404);

        const updated = await prisma.pathEdge.update({
        where: { id: edgeId },
        data: {
            status: "rejected",
            approvedById: params.adminId,
            rejectReason: reason,
        },
        });

        await recordAuditLog({
        actorId: params.adminId,
        action: "verification.reject_edge",
        resourceType: "path_edge",
        resourceId: target.id,
        metadata: { reason },
        });

        return {
        id: `edge:${updated.id.toString()}`,
        itemType: "edge",
        itemId: updated.id.toString(),
        status: updated.status,
        rejectReason: updated.rejectReason,
        };
    }

    const existingReport = await prisma.roadReport.findUnique({
        where: { id: target.id },
    });
    if (!existingReport) throw new AppError("NOT_FOUND", "Report not found.", 404);

    const prevMeta = (existingReport.metadata as Record<string, unknown> | null) ?? {};
    const updatedReport = await prisma.roadReport.update({
        where: { id: existingReport.id },
        data: {
        status: "rejected",
        metadata: {
            ...prevMeta,
            rejectedBy: params.adminId,
            rejectedAt: new Date().toISOString(),
            rejectReason: reason,
        },
        },
    });

    await recordAuditLog({
        actorId: params.adminId,
        action: "verification.reject_report",
        resourceType: "road_report",
        resourceId: target.id,
        metadata: { reason },
    });

    return {
        id: `report_effect:${updatedReport.id}`,
        itemType: "report_effect",
        itemId: updatedReport.id,
        status: updatedReport.status,
        rejectReason: reason,
    };
}