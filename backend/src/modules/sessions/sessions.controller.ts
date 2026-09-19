import type { Request, Response } from "express";
import * as sessionService from "./sessions.service.js";

/**
 * POST /api/sessions/start
 */
export async function start(req: Request, res: Response) {
    try {
        const { userId, origin, destination, routeCoordinates, estimatedArrival } = req.body;
        if (!userId || !origin || !destination) {
        return res.status(400).json({
            error: "userId, origin (lat, lng), and destination (lat, lng) must be provided",
            });
        }
        if (origin.lat == null || origin.lng == null || destination.lat == null || destination.lng == null) {
        return res.status(400).json({
            error: "origin and destination must have lat and lng properties",
        });
        }

        const session = await sessionService.startSession({
            userId,
            origin,
            destination,
            routeCoordinates,
            estimatedArrival,
        });
        res.status(201).json(session);
    } catch (error) {
        console.error("Error starting session:", error);
        res.status(500).json({ error: "Failed to start session" });
    }
}

/**
 * PATCH /api/sessions/:id/location
 */
export async function updateLocation(req: Request, res: Response) {
    try {
        const id = req.params.id as string;
        const { lat, lng } = req.body;

        if (lat == null || lng == null) {
            return res.status(400).json({ error: "lat and lng must be provided" });
        }

        const ping = await sessionService.recordLocationPing({ sessionId: id, lat, lng });
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
    const { userId, status = "completed", destinationName } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId must be provided" });
    }
    if (status !== "completed" && status !== "cancelled") {
      return res.status(400).json({ error: "status must be 'completed' or 'cancelled'" });
    }
    const result = await sessionService.endSession(id, userId, status, destinationName);
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
    const requesterId = (req.query.requesterId as string) || (req.headers["x-user-id"] as string);
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