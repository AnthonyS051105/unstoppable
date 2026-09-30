import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
    startConversationHandler,
    sendMessageHandler,
    getConversationHandler,
    confirmConversationHandler,
    getPreferencesHandler,
} from "./ai-planner.controller.js";

const router = Router();

router.use(requireAuth);

router.post("/conversations", startConversationHandler);
router.post("/conversations/:id/message", sendMessageHandler);
router.get("/conversations/:id", getConversationHandler);
router.post("/conversations/:id/confirm", confirmConversationHandler);
router.get("/preferences", getPreferencesHandler);

export default router;