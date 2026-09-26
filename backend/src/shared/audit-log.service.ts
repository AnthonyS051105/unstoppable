import { prisma } from "../config/prisma.js";

export interface CreateAuditLogParams {
    actorId?: string | null;
    action: string;
    targetUserId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
}

export async function recordAuditLog(params: CreateAuditLogParams) {
    return prisma.auditLog.create({
        data: {
            actorId: params.actorId ?? null,
            action: params.action,
            targetUserId: params.targetUserId ?? null,
            resourceType: params.resourceType ?? null,
            resourceId: params.resourceId ?? null,
            metadata: (params.metadata as any) ?? undefined,
        }
    })
}