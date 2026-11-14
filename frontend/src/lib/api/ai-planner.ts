import { api, jsonBody } from "@/lib/api-client";
import type {
  AiPlannerConversation,
  AiPlannerInputMode,
  ConfirmConversationInput,
  ConfirmConversationResponse,
  SendAiPlannerMessageResponse,
  UserPlacePreference,
} from "@/types/api";

export const aiPlannerApi = {
  /** POST /ai-planner/conversations: starts a new conversation */
  startConversation: () =>
    api<AiPlannerConversation>("/ai-planner/conversations", { method: "POST" }),

  /** POST /ai-planner/conversations/:id/message: sends message */
  sendMessage: (
    id: string,
    content: string,
    inputMode: AiPlannerInputMode = "text",
  ) =>
    api<SendAiPlannerMessageResponse>(
      `/ai-planner/conversations/${encodeURIComponent(id)}/message`,
      jsonBody({ content, inputMode }),
    ),

  /** GET /ai-planner/conversations/:id: gets conversation details and messages */
  getConversation: (id: string) =>
    api<AiPlannerConversation>(
      `/ai-planner/conversations/${encodeURIComponent(id)}`,
    ),

  /** POST /ai-planner/conversations/:id/confirm: confirms travel plan */
  confirmConversation: (id: string, payload?: ConfirmConversationInput) =>
    api<ConfirmConversationResponse>(
      `/ai-planner/conversations/${encodeURIComponent(id)}/confirm`,
      jsonBody(payload || {}),
    ),

  /** GET /ai-planner/preferences: gets frequently confirmed destination places */
  getPreferences: () =>
    api<UserPlacePreference[]>("/ai-planner/preferences"),
};
