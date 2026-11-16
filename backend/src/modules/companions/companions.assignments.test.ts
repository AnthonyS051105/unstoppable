import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { companionsRouter } from "./companions.routes.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { signAccessToken } from "../auth/token.js";
import { prisma } from "../../config/prisma.js";
import * as service from "./companions.service.js";

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    companionRequest: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("../volunteers/volunteers.service.js", () => ({}));
vi.mock("../../realtime/index.js", () => ({
  getIo: () => ({ to: () => ({ emit: vi.fn() }) }),
}));

let server: Server;
let base: string;
const volunteerId = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  process.env.JWT_SECRET = "dev-unit-secret-only";
  const app = express();
  app.use(express.json());
  app.use("/companions", companionsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

beforeEach(() => {
  vi.clearAllMocks();
});

const headers = (role = "volunteer", sub = volunteerId) => ({
  Authorization: `Bearer ${signAccessToken({ sub, role })}`,
});

describe("GET /companions/assignments (I6-ASSIGNMENTS-CONTRACT)", () => {
  it("menolak request tanpa token dengan 401", async () => {
    const res = await fetch(`${base}/companions/assignments`);
    expect(res.status).toBe(401);
  });

  it("menolak token tidak valid dengan 401", async () => {
    const res = await fetch(`${base}/companions/assignments`, {
      headers: { Authorization: "Bearer token-palsu" },
    });
    expect(res.status).toBe(401);
  });

  it.each(["blind_user", "mobility_user", "caregiver", "admin"])(
    "menolak role %s dengan 403 karena endpoint khusus volunteer",
    async (role) => {
      const res = await fetch(`${base}/companions/assignments`, {
        headers: headers(role),
      });
      expect(res.status).toBe(403);
    },
  );

  it.each(["owner=other", "status=confirmed", "volunteerId=other", "unknown=1"])(
    "menolak parameter query %s dengan 400",
    async (query) => {
      const res = await fetch(`${base}/companions/assignments?${query}`, {
        headers: headers("volunteer"),
      });
      expect(res.status).toBe(400);
    },
  );

  it("mengambil assignment milik token caller dan memetakan privasi confirmed vs non-confirmed", async () => {
    const requesterId = "22222222-2222-4222-8222-222222222222";
    const thirdPartyId = "33333333-3333-4333-8333-333333333333";
    const mockRows = [
      {
        id: "req-1",
        destinationName: "Stasiun MRT Bundaran HI",
        scheduledStart: new Date("2026-11-15T09:00:00.000Z"),
        estimatedDurationMin: 60,
        assistanceTypes: ["memandu_jalan"],
        status: "confirmed",
        meetingPointNote: "Pintu utara halte Transjakarta",
        notes: "Membawa tongkat putih",
        requesterId,
        requester: { id: requesterId, name: "Budi Santoso" },
        checkins: [
          { actorId: requesterId, checkinType: "meet" },
          { actorId: volunteerId, checkinType: "meet" },
          { actorId: thirdPartyId, checkinType: "complete" }, // third party checkin must be ignored
        ],
      },
      {
        id: "req-2",
        destinationName: "Halte CSW",
        scheduledStart: new Date("2026-11-14T10:00:00.000Z"),
        estimatedDurationMin: 45,
        assistanceTypes: ["bantu_kursi_roda"],
        status: "completed",
        meetingPointNote: "Lobby barat",
        notes: "Perlu bantuan ramp",
        requesterId,
        requester: { id: requesterId, name: "Budi Santoso" },
        checkins: [
          { actorId: requesterId, checkinType: "meet" },
          { actorId: volunteerId, checkinType: "meet" },
          { actorId: requesterId, checkinType: "complete" },
          { actorId: volunteerId, checkinType: "complete" },
        ],
      },
      {
        id: "req-3",
        destinationName: "Taman Ismail Marzuki",
        scheduledStart: new Date("2026-11-13T14:00:00.000Z"),
        estimatedDurationMin: 90,
        assistanceTypes: ["dampingi_acara"],
        status: "cancelled",
        meetingPointNote: "Plaza teater",
        notes: "Acara seni",
        requesterId,
        requester: { id: requesterId, name: "Budi Santoso" },
        checkins: [],
      },
    ];

    vi.mocked(prisma.companionRequest.findMany).mockResolvedValue(mockRows as any);

    const res = await fetch(`${base}/companions/assignments`, {
      headers: headers("volunteer", volunteerId),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: any[] };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);

    // Filter verification
    expect(prisma.companionRequest.findMany).toHaveBeenCalledWith({
      where: {
        selectedVolunteerId: volunteerId,
        status: { in: ["confirmed", "completed", "cancelled"] },
      },
      orderBy: { scheduledStart: "desc" },
      select: expect.any(Object),
    });

    // req-1: confirmed -> requester, meetingPointNote, notes kept
    expect(body.data[0]).toEqual({
      id: "req-1",
      destinationName: "Stasiun MRT Bundaran HI",
      scheduledStart: "2026-11-15T09:00:00.000Z",
      estimatedDurationMin: 60,
      assistanceTypes: ["memandu_jalan"],
      status: "confirmed",
      requester: { id: requesterId, name: "Budi Santoso" },
      meetingPointNote: "Pintu utara halte Transjakarta",
      notes: "Membawa tongkat putih",
      checkins: {
        requester: { meet: true, complete: false },
        volunteer: { meet: true, complete: false },
      },
    });

    // req-2: completed -> privacy terminal (requester, meetingPointNote, notes are null)
    expect(body.data[1]).toEqual({
      id: "req-2",
      destinationName: "Halte CSW",
      scheduledStart: "2026-11-14T10:00:00.000Z",
      estimatedDurationMin: 45,
      assistanceTypes: ["bantu_kursi_roda"],
      status: "completed",
      requester: null,
      meetingPointNote: null,
      notes: null,
      checkins: {
        requester: { meet: true, complete: true },
        volunteer: { meet: true, complete: true },
      },
    });

    // req-3: cancelled -> privacy terminal (requester, meetingPointNote, notes are null)
    expect(body.data[2]).toEqual({
      id: "req-3",
      destinationName: "Taman Ismail Marzuki",
      scheduledStart: "2026-11-13T14:00:00.000Z",
      estimatedDurationMin: 90,
      assistanceTypes: ["dampingi_acara"],
      status: "cancelled",
      requester: null,
      meetingPointNote: null,
      notes: null,
      checkins: {
        requester: { meet: false, complete: false },
        volunteer: { meet: false, complete: false },
      },
    });
  });
});
