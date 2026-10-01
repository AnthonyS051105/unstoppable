import type { Request, Response, NextFunction } from "express";
import {
    startConversation,
    sendMessage,
    getConversation,
    confirmConversation,
    getUserPlacePreferences,
} from "./ai-planner.service.js";

export async function startConversationHandler(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await startConversation(req.user!.id);
        res.status(201).json({ data });
    } catch (err) {
        next(err);
    }
}

export async function sendMessageHandler(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await sendMessage(String(req.params.id), req.user!.id, req.body);
        res.status(200).json({ data });
    } catch (err) {
        next(err);
    }
}

export async function getConversationHandler(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await getConversation(String(req.params.id), req.user!.id);
        res.status(200).json({ data });
    } catch (err) {
        next(err);
    }
}

export async function confirmConversationHandler(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await confirmConversation(String(req.params.id), req.user!.id, req.body);
        res.status(200).json({ data });
    } catch (err) {
        next(err);
    }
}

export async function getPreferencesHandler(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await getUserPlacePreferences(req.user!.id);
        res.status(200).json({ data });
    } catch (err) {
        next(err);
    }
}