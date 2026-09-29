import dotenv from "dotenv";
dotenv.config({ override: true });
import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import {
  startConversation,
  sendMessage,
  getConversation,
  confirmConversation,
  getUserPlacePreferences,
} from "./ai-planner.service.js";

async function main() {
  console.log("[SMOKE] Starting AI Planner Service smoke test...");

  const user = await prisma.user.create({
    data: {
      passwordHash: "smoke_hash_unused",
      name: "Smoke Test AI User",
      phoneNumber: `+62819${Date.now().toString().slice(-8)}`,
      role: "blind_user",
      phoneVerified: true,
    },
  });

  const buildingRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO buildings (id, name, location, floor_count, has_lift, has_accessible_toilet, updated_at)
    VALUES (
      gen_random_uuid(),
      'Gedung Perpustakaan Pusat UGM Smoke',
      ST_SetSRID(ST_MakePoint(110.37825, -7.76942), 4326)::geography,
      3, true, true, NOW()
    )
    RETURNING id
  `;
  const buildingId = buildingRows[0].id;

  try {
    const conv = await startConversation(user.id);
    assert.equal(conv.status, "active");
    console.log("[PASS] 1. startConversation created active conversation:", conv.id);

    const msgRes = await sendMessage(conv.id, user.id, {
      content: "Saya mau ke Perpustakaan Pusat UGM jam 09:30",
      inputMode: "voice",
    });
    assert.equal(msgRes.readyToConfirm, true);
    assert.equal(msgRes.extraction.matchSource, "building");
    assert.ok(msgRes.extraction.destinationLocation);
    console.log("[PASS] 2. sendMessage extracted via LLM & matched building:", {
      destinationText: msgRes.extraction.destinationText,
      plannedTime: msgRes.extraction.plannedTime,
      contextNotes: msgRes.extraction.contextNotes,
    });

    const history = await getConversation(conv.id, user.id);
    assert.equal(history.messages.length, 2);
    assert.equal(history.extractions.length, 1);
    console.log("[PASS] 3. getConversation returned 2 messages and 1 extraction");

    const confirmed = await confirmConversation(conv.id, user.id, {});
    assert.equal(confirmed.conversation.status, "completed");
    console.log("[PASS] 4. confirmConversation marked conversation completed");

    const prefs = await getUserPlacePreferences(user.id);
    assert.equal(prefs.length, 1);
    assert.equal(prefs[0].visitCount, 1);
    console.log("[PASS] 5. getUserPlacePreferences returned saved place:", prefs[0].placeName);

    console.log("[SMOKE] All AI Planner Service checks passed.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.building.delete({ where: { id: buildingId } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[FAIL] AI Planner smoke test failed:", err);
  process.exit(1);
});