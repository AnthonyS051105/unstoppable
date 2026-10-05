import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import {
    getVerificationQueue,
    approveVerificationItem,
    rejectVerificationItem,
    type VerificationItemType,
    type VerificationQueueQuery,
} from "./verification.service.js";

export const getQueueHandler = asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as VerificationItemType | undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    // Omit `type` when absent so it doesn't violate exactOptionalPropertyTypes.
    const query: VerificationQueueQuery = { page, limit };
    if (type) query.type = type;

    const result = await getVerificationQueue(query);
    res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
    });
});

export const approveHandler = asyncHandler(async (req: Request, res: Response) => {
    // Canonical form: prefixed id ("node:<id>", "edge:<id>", "report_effect:<id>").
    // The service also accepts an optional `type` fallback (body/query) for
    // callers that pass a bare id.
    const id = String(req.params.id);
    const type = (req.body?.type ?? req.query?.type) as
        | VerificationItemType
        | undefined;
    const effect = req.body?.effect as "block" | "degrade" | "info" | undefined;
    const note = req.body?.note as string | undefined;

    const result = await approveVerificationItem({
        id,
        adminId: req.user!.id,
        ...(type ? { type } : {}),
        ...(effect ? { effect } : {}),
        ...(note !== undefined ? { note } : {}),
    });

    ok(res, result);
});

export const rejectHandler = asyncHandler(async (req: Request, res: Response) => {
    // Canonical form: prefixed id ("node:<id>", "edge:<id>", "report_effect:<id>").
    const id = String(req.params.id);
    const type = (req.body?.type ?? req.query?.type) as
        | VerificationItemType
        | undefined;

    const result = await rejectVerificationItem({
        id,
        adminId: req.user!.id,
        reason: String(req.body?.reason ?? ""),
        ...(type ? { type } : {}),
    });

    ok(res, result);
});
