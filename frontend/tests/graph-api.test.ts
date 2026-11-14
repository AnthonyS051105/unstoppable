import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError } from "../src/lib/api-client";
import { canMapData, graphApi, type CreateEdgeInput, type CreateNodeInput } from "../src/lib/api/graph";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), { status });
}

test("canMapData mengizinkan peran admin, mapper, dan relawan terverifikasi dengan izin pemetaan", () => {
  assert.equal(canMapData("admin"), true);
  assert.equal(canMapData("mapper"), true);
  assert.equal(canMapData("volunteer", { verificationStatus: "verified", canMapData: true }), true);

  assert.equal(canMapData("volunteer", { verificationStatus: "verified", canMapData: false }), false);
  assert.equal(canMapData("volunteer", { verificationStatus: "pending", canMapData: true }), false);
  assert.equal(canMapData("volunteer", null), false);
  assert.equal(canMapData("blind_user"), false);
  assert.equal(canMapData("mobility_user"), false);
  assert.equal(canMapData("caregiver"), false);
  assert.equal(canMapData(undefined), false);
});

test("graphApi.listNodes memanggil GET /graph/nodes dengan query bbox, floorLevel, dan status", async () => {
  let calledUrl = "";
  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return reply([
      {
        id: "node-1",
        nodeType: "entrance",
        name: "Pintu Utama",
        buildingId: null,
        floorLevel: 0,
        location: { type: "Point", coordinates: [110.375, -7.765] },
        status: "approved",
      },
    ]);
  };

  const nodes = await graphApi.listNodes({
    bbox: [110.37, -7.77, 110.38, -7.76],
    floorLevel: 0,
    status: "all",
  });

  assert.match(calledUrl, /\/graph\/nodes\?/);
  assert.match(calledUrl, /bbox=110\.37%2C-7\.77%2C110\.38%2C-7\.76/);
  assert.match(calledUrl, /floorLevel=0/);
  assert.match(calledUrl, /status=all/);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]?.name, "Pintu Utama");
});

test("graphApi.createNode memvalidasi lokasi dan mengirim POST /graph/nodes", async () => {
  assert.throws(
    () =>
      graphApi.createNode({
        nodeType: "junction",
        location: { type: "Invalid" as unknown as "Point", coordinates: [] as unknown as [number, number] },
      }),
    (err: unknown) => err instanceof ApiError && err.code === "VALIDATION_ERROR",
  );

  const input: CreateNodeInput = {
    nodeType: "entrance",
    name: "Main Entrance FT",
    floorLevel: 1,
    location: { type: "Point", coordinates: [110.3725, -7.7651] },
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/graph\/nodes$/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.nodeType, "entrance");
    assert.equal(body.name, "Main Entrance FT");
    assert.equal(body.floorLevel, 1);
    assert.deepEqual(body.location, input.location);
    return reply({ id: "node-101", ...body, status: "draft" }, 201);
  };

  const created = await graphApi.createNode(input);
  assert.equal(created.id, "node-101");
  assert.equal(created.status, "draft");
});

test("graphApi.updateNode mengirim PATCH /graph/nodes/:id", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/graph\/nodes\/node%2F101$/);
    assert.equal(init?.method, "PATCH");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.name, "Nama Diperbarui");
    return reply({ id: "node/101", name: "Nama Diperbarui", status: "approved" });
  };

  const updated = await graphApi.updateNode("node/101", { name: "Nama Diperbarui" });
  assert.equal("name" in updated ? updated.name : null, "Nama Diperbarui");
});

test("graphApi.deleteNode mengirim DELETE /graph/nodes/:id", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/graph\/nodes\/node-101$/);
    assert.equal(init?.method, "DELETE");
    return new Response(null, { status: 204 });
  };

  await graphApi.deleteNode("node-101");
});

test("graphApi.createEdge menolak self-loop dan inkonsistensi tangga (BR-26)", async () => {
  assert.throws(
    () =>
      graphApi.createEdge({
        sourceNodeId: "node-1",
        targetNodeId: "node-1",
      }),
    (err: unknown) => err instanceof ApiError && err.code === "VALIDATION_ERROR",
  );

  assert.throws(
    () =>
      graphApi.createEdge({
        sourceNodeId: "node-1",
        targetNodeId: "node-2",
        hasStairs: true,
        stepCount: 0,
      }),
    (err: unknown) => err instanceof ApiError && err.code === "VALIDATION_ERROR",
  );

  const validEdge: CreateEdgeInput = {
    sourceNodeId: "node-1",
    targetNodeId: "node-2",
    surfaceType: "paving",
    widthCm: 150,
    hasStairs: false,
    stepCount: 0,
    slopePercent: 4.5,
    hasGuidingBlock: true,
    guidingBlockCondition: "baik",
  };

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/graph\/edges$/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.sourceNodeId, "node-1");
    assert.equal(body.targetNodeId, "node-2");
    assert.equal(body.surfaceType, "paving");
    assert.equal(body.widthCm, 150);
    return reply({ id: "edge-501", ...body, lengthM: 25.4, status: "draft" }, 201);
  };

  const created = await graphApi.createEdge(validEdge);
  assert.equal(created.id, "edge-501");
  assert.equal(created.lengthM, 25.4);
});

test("graphApi.updateEdge dan deleteEdge memanggil endpoint segmen dengan benar", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/graph\/edges\/edge-501$/);
    assert.equal(init?.method, "PATCH");
    return reply({ id: "edge-501", surfaceType: "aspal", status: "approved" });
  };
  const updated = await graphApi.updateEdge("edge-501", { surfaceType: "aspal" });
  assert.equal(updated.id, "edge-501");

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/graph\/edges\/edge-501$/);
    assert.equal(init?.method, "DELETE");
    return new Response(null, { status: 204 });
  };
  await graphApi.deleteEdge("edge-501");
});

test("graphApi.getCoverage memanggil GET /graph/coverage", async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/graph\/coverage$/);
    return reply([
      {
        buildingId: "b-1",
        name: "Fakultas Teknik",
        faculty: "FT",
        nodeCount: 15,
        edgeCount: 18,
        approvedRatio: 0.88,
        floorsMapped: [0, 1],
        floorCount: 3,
        lastSurveyedAt: "2026-11-01T10:00:00Z",
      },
    ]);
  };

  const cov = await graphApi.getCoverage();
  assert.equal(cov.length, 1);
  assert.equal(cov[0]?.name, "Fakultas Teknik");
  assert.equal(cov[0]?.approvedRatio, 0.88);
});

test("graphApi.validateTopology mengirim POST /graph/validate dengan body buildingId", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/graph\/validate$/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.buildingId, "b-100");
    return reply({
      valid: false,
      issues: [
        {
          type: "orphan_node",
          nodeId: "node-99",
          message: "Node not connected to any edge segment.",
        },
      ],
    });
  };

  const res = await graphApi.validateTopology("b-100");
  assert.equal(res.valid, false);
  assert.equal(res.issues.length, 1);
  assert.equal(res.issues[0]?.type, "orphan_node");
});
