import type { Request, Response } from "express";
import * as sessionService from "./sessions.service.js";

function parseLatLng(point: any): { lat: number; lng: number } | null {
  if (!point) return null;
  if (
    point.type === "Point" &&
    Array.isArray(point.coordinates) &&
    point.coordinates.length >= 2
  ) {
    return {
      lng: Number(point.coordinates[0]),
      lat: Number(point.coordinates[1]),
    };
  }
  if (point.lat != null && point.lng != null) {
    return { lat: Number(point.lat), lng: Number(point.lng) };
  }
  return null;
}

/**
 * POST /api/sessions/start
 */
export async function start(req: Request, res: Response) {
  try {
    const userId =
      req.body.userId || req.user?.id || (req.headers["x-user-id"] as string);
    const {
      origin,
      destination,
      destinationName,
      edgeIds,
      profileId,
      estimatedArrival,
    } = req.body;

    const parsedOrigin = parseLatLng(origin);
    const parsedDest = parseLatLng(destination);

    if (!userId || !parsedOrigin || !parsedDest) {
      return res.status(400).json({
        error:
          "userId, origin, and destination (GeoJSON Point or {lat, lng}) must be provided",
      });
    }

    const session = await sessionService.startSession({
      userId,
      origin: parsedOrigin,
      destination: parsedDest,
      destinationName,
      edgeIds,
      profileId,
      estimatedArrival,
    });
    res.status(201).json(session);
  } catch (error) {
    console.error("Error starting session:", error);
    res.status(500).json({ error: "Failed to start session" });
  }
}

/**
 * POST | PATCH /api/sessions/:id/location
 */
export async function updateLocation(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const parsed = parseLatLng(req.body.location ?? req.body);
    const accuracyM =
      req.body.accuracyM != null ? Number(req.body.accuracyM) : undefined;

    if (!parsed) {
      return res.status(400).json({
        error: "location (GeoJSON Point) or lat/lng must be provided",
      });
    }

    const ping = await sessionService.recordLocationPing({
      sessionId: id,
      lat: parsed.lat,
      lng: parsed.lng,
      accuracyM,
    });
    res.status(201).json(ping);
  } catch (error) {
    console.error("Error recording location ping:", error);
    res.status(500).json({ error: "Failed to record location ping" });
  }
}

/**
 * POST /api/sessions/:id/end
 */
export async function end(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const userId =
      req.body.userId || req.user?.id || (req.headers["x-user-id"] as string);
    const { status = "completed", destinationName } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId must be provided" });
    }
    if (status !== "completed" && status !== "cancelled") {
      return res
        .status(400)
        .json({ error: "status must be 'completed' or 'cancelled'" });
    }
    const result = await sessionService.endSession(
      id,
      userId,
      status,
      destinationName,
    );
    if (!result) {
      return res.status(404).json({
        error: "Session not found or userId does not match",
      });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error("Error ending travel session:", error);
    res.status(500).json({ error: "Failed to end travel session" });
  }
}

/**
 * GET /api/sessions/:id/summary
 */
export async function getSummary(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const requesterId =
      (req.query.requesterId as string) ||
      req.user?.id ||
      (req.headers["x-user-id"] as string);
    const summary = await sessionService.getSessionSummary(id, requesterId);
    if (!summary) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.status(200).json(summary);
  } catch (error) {
    console.error("Error getting session summary:", error);
    res.status(500).json({ error: "Failed to get session summary" });
  }
}