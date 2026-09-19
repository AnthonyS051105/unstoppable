import { prisma } from "../config/prisma.js";

export interface CreateAuditLogParams {
    actorId?: string | null;
    action: string;
    targetUserId?: string | null;
}

export async function recordAuditLog(params: CreateAuditLogParams) {
    return prisma.auditLog.create({
        data: {
            actorId: params.actorId ?? null,
            action: params.action,
            targetUserId: params.targetUserId ?? null,
        }
    })
}