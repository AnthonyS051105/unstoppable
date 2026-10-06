import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { ok, created, noContent } from "../../shared/response.js";
import * as graphService from "./graph.service.js";

function getActor(req: Request) {
    const isDev = process.env.NODE_ENV !== "production";
    const actorId =
        req.user?.id ||
        (isDev ? (req.headers["x-user-id"] as string | undefined) : undefined) ||
        null;
    const actorRole =
        req.user?.role ||
        (isDev ? (req.headers["x-user-role"] as string | undefined) : undefined) ||
        null;
    return { actorId, actorRole };
}

function extractBboxFilter(req: Request): graphService.BboxFilter {
    let minLng: number;
    let minLat: number;
    let maxLng: number;
    let maxLat: number;

    if (typeof req.query.bbox === "string") {
        [minLng, minLat, maxLng, maxLat] = graphService.parseBboxString(
        req.query.bbox,
        );
    } else {
        const raw = `${req.query.minLng ?? ""},${req.query.minLat ?? ""},${req.query.maxLng ?? ""},${req.query.maxLat ?? ""}`;
        [minLng, minLat, maxLng, maxLat] = graphService.parseBboxString(raw);
    }

    const floorLevel =
        req.query.floorLevel !== undefined && req.query.floorLevel !== ""
        ? Number(req.query.floorLevel)
        : undefined;
    const status =
        typeof req.query.status === "string" && req.query.status !== ""
        ? req.query.status
        : undefined;

    return { minLng, minLat, maxLng, maxLat, floorLevel, status };
}

export const listNodes = asyncHandler(async (req: Request, res: Response) => {
    const filter = extractBboxFilter(req);
    const nodes = await graphService.getNodesInBbox(filter);
    return ok(res, nodes);
});

export const createNode = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, actorRole } = getActor(req);
    const node = await graphService.createNode({
        ...req.body,
        actorId,
        actorRole,
    });
    return created(res, node);
});

export const updateNode = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, actorRole } = getActor(req);
    const id = req.params.id as string;
    const updated = await graphService.updateNode(id, {
        ...req.body,
        actorId,
        actorRole,
    });
    return ok(res, updated);
});

export const deleteNode = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, actorRole } = getActor(req);
    const id = req.params.id as string;
    await graphService.deleteNode(id, actorId, actorRole);
    return noContent(res);
});

export const listEdges = asyncHandler(async (req: Request, res: Response) => {
    const filter = extractBboxFilter(req);
    const edges = await graphService.getEdgesInBbox(filter);
    return ok(res, edges);
});

export const createEdge = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, actorRole } = getActor(req);
    const edge = await graphService.createEdge({
        ...req.body,
        actorId,
        actorRole,
    });
    return created(res, edge);
});

export const updateEdge = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, actorRole } = getActor(req);
    const id = req.params.id as string;
    const updated = await graphService.updateEdge(id, {
        ...req.body,
        actorId,
        actorRole,
    });
    return ok(res, updated);
});

export const deleteEdge = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, actorRole } = getActor(req);
    const id = req.params.id as string;
    await graphService.deleteEdge(id, actorId, actorRole);
    return noContent(res);
});

export const getCoverage = asyncHandler(async (_req: Request, res: Response) => {
    const coverage = await graphService.getGraphCoverage();
    return ok(res, coverage);
});

export const validateTopology = asyncHandler(
    async (req: Request, res: Response) => {
        const buildingId =
        typeof req.body?.buildingId === "string"
            ? req.body.buildingId
            : undefined;
        const result = await graphService.validateGraphTopology(buildingId);
        return ok(res, result);
    },
);