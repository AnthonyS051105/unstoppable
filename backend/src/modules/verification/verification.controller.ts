import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import {
    getVerificationQueue,
    approveVerificationItem,
    rejectVerificationItem,
    type VerificationItemType,
} from "./verification.service.js";

export const getQueueHandler = asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as VerificationItemType | undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const result = await getVerificationQueue({ type, page, limit });
    res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
    });
});

export const approveHandler = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const type = (req.params.type ?? req.body?.type ?? req.query?.type) as
        | VerificationItemType
        | undefined;

    const result = await approveVerificationItem({
        id,
        type,
        adminId: req.user!.id,
        effect: req.body?.effect,
        note: req.body?.note,
    });

    ok(res, result);
});

export const rejectHandler = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const type = (req.params.type ?? req.body?.type ?? req.query?.type) as
        | VerificationItemType
        | undefined;

    const result = await rejectVerificationItem({
        id,
        type,
        adminId: req.user!.id,
        reason: String(req.body?.reason ?? ""),
    });

    ok(res, result);
});