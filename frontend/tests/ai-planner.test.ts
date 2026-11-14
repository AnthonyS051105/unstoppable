import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { aiPlannerApi } from "../src/lib/api/ai-planner";
import { ApiError } from "../src/lib/api-client";
import type {
  AiPlannerConversation,
  ConfirmConversationResponse,
  SendAiPlannerMessageResponse,
  UserPlacePreference,
} from "../src/types/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("aiPlannerApi.startConversation memanggil POST /ai-planner/conversations", async () => {
  assert.equal(typeof aiPlannerApi.startConversation, "function");

  const mockResponse: AiPlannerConversation = {
    id: "conv-uuid-1",
    userId: "user-uuid-1",
    status: "active",
    createdAt: "2026-11-14T14:00:00.000Z",
    completedAt: null,
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/ai-planner\/conversations$/);
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ success: true, data: mockResponse }), { status: 201 });
  };

  const result = await aiPlannerApi.startConversation();
  assert.deepEqual(result, mockResponse);
});

test("aiPlannerApi.sendMessage memanggil POST /ai-planner/conversations/:id/message dengan mode text", async () => {
  assert.equal(typeof aiPlannerApi.sendMessage, "function");

  const mockPayload = { content: "Saya mau ke Gedung PAU jam 9", inputMode: "text" as const };
  const mockResponse: SendAiPlannerMessageResponse = {
    userMessage: {
      id: "msg-1",
      conversationId: "conv-1",
      sender: "user",
      inputMode: "text",
      content: "Saya mau ke Gedung PAU jam 9",
      createdAt: "2026-11-14T14:01:00.000Z",
    },
    assistantMessage: {
      id: "msg-2",
      conversationId: "conv-1",
      sender: "assistant",
      inputMode: "text",
      content: "Destination Found: Gedung PAU UGM. Please confirm to calculate the accessible route.",
      createdAt: "2026-11-14T14:01:02.000Z",
    },
    extraction: {
      id: "ext-1",
      destinationText: "Gedung PAU UGM",
      destinationLocation: { type: "Point", coordinates: [110.3759, -7.7653] },
      matchSource: "building",
      plannedTime: "2026-11-14T02:00:00.000Z",
      contextNotes: null,
      clarificationRounds: 1,
    },
    readyToConfirm: true,
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/ai-planner\/conversations\/conv-1\/message$/);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), mockPayload);
    return new Response(JSON.stringify({ success: true, data: mockResponse }), { status: 200 });
  };

  const result = await aiPlannerApi.sendMessage("conv-1", "Saya mau ke Gedung PAU jam 9", "text");
  assert.deepEqual(result, mockResponse);
  assert.equal(result.readyToConfirm, true);
  assert.equal(result.extraction.destinationText, "Gedung PAU UGM");
});

test("aiPlannerApi.sendMessage memanggil dengan mode voice", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/ai-planner\/conversations\/conv-voice\/message$/);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { content: "Perpustakaan", inputMode: "voice" });
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          userMessage: { id: "m1", conversationId: "conv-voice", sender: "user", inputMode: "voice", content: "Perpustakaan", createdAt: "2026-11-14T14:01:00.000Z" },
          assistantMessage: { id: "m2", conversationId: "conv-voice", sender: "assistant", inputMode: "text", content: "Destination Found: Perpustakaan", createdAt: "2026-11-14T14:01:02.000Z" },
          extraction: { id: "e1", destinationText: "Perpustakaan", destinationLocation: { type: "Point", coordinates: [110.37, -7.76] }, clarificationRounds: 1 },
          readyToConfirm: true,
        },
      }),
      { status: 200 },
    );
  };

  const result = await aiPlannerApi.sendMessage("conv-voice", "Perpustakaan", "voice");
  assert.equal(result.userMessage.inputMode, "voice");
  assert.equal(result.readyToConfirm, true);
});

test("aiPlannerApi.getConversation memanggil GET /ai-planner/conversations/:id", async () => {
  assert.equal(typeof aiPlannerApi.getConversation, "function");

  const mockDetail: AiPlannerConversation = {
    id: "conv-uuid-1",
    userId: "user-uuid-1",
    status: "active",
    createdAt: "2026-11-14T14:00:00.000Z",
    completedAt: null,
    messages: [
      { id: "msg-1", conversationId: "conv-uuid-1", sender: "user", inputMode: "text", content: "Halo", createdAt: "2026-11-14T14:00:10.000Z" },
    ],
    extractions: [],
  };

  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/ai-planner\/conversations\/conv-uuid-1$/);
    return new Response(JSON.stringify({ success: true, data: mockDetail }), { status: 200 });
  };

  const result = await aiPlannerApi.getConversation("conv-uuid-1");
  assert.deepEqual(result, mockDetail);
});

test("aiPlannerApi.confirmConversation memanggil POST /ai-planner/conversations/:id/confirm dengan payload lengkap", async () => {
  assert.equal(typeof aiPlannerApi.confirmConversation, "function");

  const mockInput = {
    destinationText: "Gedung PAU UGM",
    destinationLocation: { type: "Point" as const, coordinates: [110.3759, -7.7653] as [number, number] },
    plannedTime: "2026-11-14T02:00:00.000Z",
    resultingSessionId: "session-1234",
  };

  const mockResponse: ConfirmConversationResponse = {
    conversation: {
      id: "conv-uuid-1",
      userId: "user-uuid-1",
      status: "completed",
      createdAt: "2026-11-14T14:00:00.000Z",
      completedAt: "2026-11-14T14:02:00.000Z",
    },
    confirmedDestination: {
      destinationText: "Gedung PAU UGM",
      destinationLocation: { type: "Point", coordinates: [110.3759, -7.7653] },
      plannedTime: "2026-11-14T02:00:00.000Z",
    },
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/ai-planner\/conversations\/conv-uuid-1\/confirm$/);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), mockInput);
    return new Response(JSON.stringify({ success: true, data: mockResponse }), { status: 200 });
  };

  const result = await aiPlannerApi.confirmConversation("conv-uuid-1", mockInput);
  assert.deepEqual(result, mockResponse);
  assert.equal(result.conversation.status, "completed");
});

test("aiPlannerApi.getPreferences memanggil GET /ai-planner/preferences", async () => {
  assert.equal(typeof aiPlannerApi.getPreferences, "function");

  const mockPreferences: UserPlacePreference[] = [
    {
      id: "pref-1",
      placeName: "Perpustakaan Pusat UGM",
      placeLocation: { type: "Point", coordinates: [110.375, -7.77] },
      visitCount: 5,
      lastVisitedAt: "2026-11-13T10:00:00.000Z",
    },
  ];

  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/ai-planner\/preferences$/);
    return new Response(JSON.stringify({ success: true, data: mockPreferences }), { status: 200 });
  };

  const result = await aiPlannerApi.getPreferences();
  assert.deepEqual(result, mockPreferences);
});

test("aiPlannerApi menangani error server dan melempar ApiError", async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "NOT_FOUND", message: "Percakapan AI Planner tidak ditemukan." },
      }),
      { status: 404 },
    );
  };

  await assert.rejects(
    aiPlannerApi.getConversation("invalid-conv-id"),
    (e: unknown) => e instanceof ApiError && e.code === "NOT_FOUND" && e.status === 404,
  );
});
