// Controller HANYA menerjemahkan req/res <-> service. Semua handler dibungkus
// asyncHandler, response memakai amplop ok()/created() (docs/API_CONTRACT.md §1.1),
// error dilempar sebagai AppError. Identitas HANYA dari req.user!.id (requireAuth
// mengisinya di route).
import { asyncHandler } from "../../shared/async-handler.js";
import { ok, created } from "../../shared/response.js";
import {
    startConversation,
    sendMessage,
    getConversation,
    confirmConversation,
    getUserPlacePreferences,
} from "./ai-planner.service.js";

/**
 * POST /api/ai-planner/conversations
 */
export const startConversationHandler = asyncHandler(async (req, res) => {
    const data = await startConversation(req.user!.id);
    created(res, data);
});

/**
 * POST /api/ai-planner/conversations/:id/message
 */
export const sendMessageHandler = asyncHandler(async (req, res) => {
    const data = await sendMessage(String(req.params.id), req.user!.id, req.body);
    ok(res, data);
});

/**
 * GET /api/ai-planner/conversations/:id
 */
export const getConversationHandler = asyncHandler(async (req, res) => {
    const data = await getConversation(String(req.params.id), req.user!.id);
    ok(res, data);
});

/**
 * POST /api/ai-planner/conversations/:id/confirm
 */
export const confirmConversationHandler = asyncHandler(async (req, res) => {
    const data = await confirmConversation(String(req.params.id), req.user!.id, req.body);
    ok(res, data);
});

/**
 * GET /api/ai-planner/preferences
 */
export const getPreferencesHandler = asyncHandler(async (req, res) => {
    const data = await getUserPlacePreferences(req.user!.id);
    ok(res, data);
});
