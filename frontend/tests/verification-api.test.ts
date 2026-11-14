import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError } from "../src/lib/api-client";
import { canVerify, verificationApi } from "../src/lib/api/verification";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function reply(data: unknown, meta?: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data, ...(meta ? { meta } : {}) }), { status });
}

test("canVerify hanya mengizinkan peran admin sebagai verifikator (API_DOCS §9)", () => {
  assert.equal(canVerify("admin"), true);
  assert.equal(canVerify("volunteer"), false);
  assert.equal(canVerify("mapper"), false);
  assert.equal(canVerify("blind_user"), false);
  assert.equal(canVerify("mobility_user"), false);
  assert.equal(canVerify("caregiver"), false);
  assert.equal(canVerify(undefined), false);
});

test("verificationApi.queue memanggil GET /verification/queue dengan filter type dan paginasi", async () => {
  let calledUrl = "";
  const mockItem = {
    id: "edge:501",
    itemType: "edge" as const,
    itemId: "501",
    changeType: "create" as const,
    submittedBy: { id: "user-1", name: "Rina Safitri" },
    submittedAt: "2026-11-01T08:00:00.000Z",
    preview: { sourceNodeId: "1", targetNodeId: "2", widthCm: 140 },
    currentValue: null,
  };

  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return reply([mockItem], { page: 2, limit: 10, total: 25 });
  };

  const res = await verificationApi.queue({ type: "edge", page: 2, limit: 10 });
  assert.match(calledUrl, /\/verification\/queue\?/);
  assert.match(calledUrl, /type=edge/);
  assert.match(calledUrl, /page=2/);
  assert.match(calledUrl, /limit=10/);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0]?.id, "edge:501");
  assert.equal(res.meta?.total, 25);
});

test("verificationApi.approve memanggil POST /verification/:id/approve dengan format id kanonik", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/verification\/node%3A101\/approve$/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.note, "Disetujui lapangan");
    return reply({ id: "node:101", itemType: "node", status: "approved" });
  };

  const res = await verificationApi.approve("node:101", { note: "Disetujui lapangan" });
  assert.equal(res.id, "node:101");
  assert.equal(res.status, "approved");
});

test("verificationApi.reject memvalidasi alasan wajib dan memanggil POST /verification/:id/reject", async () => {
  assert.throws(
    () => verificationApi.reject("edge:501", "   "),
    (err: unknown) => err instanceof ApiError && err.code === "VALIDATION_ERROR",
  );

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/verification\/edge%3A501\/reject$/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.reason, "Lebar jalur kurang dari 120 cm");
    return reply({ id: "edge:501", itemType: "edge", status: "rejected" });
  };

  const res = await verificationApi.reject("edge:501", "Lebar jalur kurang dari 120 cm");
  assert.equal(res.id, "edge:501");
  assert.equal(res.status, "rejected");
});

test("verificationApi.reviewVolunteer memanggil PATCH /volunteers/:id/verification", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/volunteers\/vol-123\/verification$/);
    assert.equal(init?.method, "PATCH");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.verificationStatus, "verified");
    assert.equal(body.canCompanion, true);
    assert.equal(body.canMapData, true);
    return reply({
      id: "vol-123",
      verificationStatus: "verified",
      canCompanion: true,
      canMapData: true,
    });
  };

  const res = await verificationApi.reviewVolunteer("vol-123", {
    verificationStatus: "verified",
    canCompanion: true,
    canMapData: true,
  });
  assert.equal(res.verificationStatus, "verified");
  assert.equal(res.canMapData, true);
});
