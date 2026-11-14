import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { volunteersRouter } from "./volunteers.routes.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { signAccessToken } from "../auth/token.js";
import { prisma } from "../../config/prisma.js";
import {
  validateMagicBytes,
  resetUploadRateLimitForTest,
  BUCKET_NAME,
} from "./volunteers.storage.js";

const mockStorage = {
  getBucket: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      getBucket: (...args: any[]) => mockStorage.getBucket(...args),
      from: (bucket: string) => ({
        upload: (...args: any[]) => mockStorage.upload(...args),
        createSignedUrl: (...args: any[]) => mockStorage.createSignedUrl(...args),
      }),
    },
  }),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    volunteerProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

let server: Server;
let base: string;
const volunteerId = "11111111-1111-4111-8111-111111111111";
const adminId = "99999999-9999-4999-8999-999999999999";

beforeAll(async () => {
  process.env.JWT_SECRET = "dev-unit-secret-only";
  process.env.SUPABASE_URL = "https://mock.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";

  const app = express();
  app.use(express.json());
  app.use("/volunteers", volunteersRouter);
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
  resetUploadRateLimitForTest();
});

const headers = (role = "volunteer", sub = volunteerId) => ({
  Authorization: `Bearer ${signAccessToken({ sub, role })}`,
});

// Helper fixture buffer
const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("Magic byte signature validation", () => {
  it("menerima JPEG dan PNG dengan signature yang valid", () => {
    expect(() => validateMagicBytes(validJpeg, "image/jpeg")).not.toThrow();
    expect(() => validateMagicBytes(validPng, "image/png")).not.toThrow();
  });

  it("menolak berkas dengan signature tidak cocok atau format palsu", () => {
    expect(() => validateMagicBytes(Buffer.from("bukan-gambar"), "image/jpeg")).toThrow();
    expect(() => validateMagicBytes(validJpeg, "image/png")).toThrow();
    expect(() => validateMagicBytes(Buffer.alloc(0), "image/jpeg")).toThrow();
  });
});

describe("POST /volunteers/identity-document", () => {
  it("menolak request tanpa autentikasi dengan 401", async () => {
    const res = await fetch(`${base}/volunteers/identity-document`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it.each(["blind_user", "mobility_user", "caregiver", "admin"])(
    "menolak role %s dengan 403 karena unggah dokumen awal khusus role volunteer",
    async (role) => {
      const res = await fetch(`${base}/volunteers/identity-document`, {
        method: "POST",
        headers: headers(role),
      });
      expect(res.status).toBe(403);
    },
  );

  it("menolak jika tidak ada berkas document yang dikirim", async () => {
    const form = new FormData();
    const res = await fetch(`${base}/volunteers/identity-document`, {
      method: "POST",
      headers: headers("volunteer"),
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("menolak jika profil relawan sudah terdaftar (conflict 409)", async () => {
    vi.mocked(prisma.volunteerProfile.findUnique).mockResolvedValue({ userId: volunteerId } as any);

    const form = new FormData();
    form.append("document", new Blob([validJpeg], { type: "image/jpeg" }), "ktp.jpg");

    const res = await fetch(`${base}/volunteers/identity-document`, {
      method: "POST",
      headers: headers("volunteer"),
      body: form,
    });

    expect(res.status).toBe(409);
  });

  it("mengembalikan 503 jika bucket belum dibuat atau bersifat publik", async () => {
    vi.mocked(prisma.volunteerProfile.findUnique).mockResolvedValue(null);
    mockStorage.getBucket.mockResolvedValue({ data: { public: true }, error: null });

    const form = new FormData();
    form.append("document", new Blob([validJpeg], { type: "image/jpeg" }), "ktp.jpg");

    const res = await fetch(`${base}/volunteers/identity-document`, {
      method: "POST",
      headers: headers("volunteer"),
      body: form,
    });

    expect(res.status).toBe(503);
  });

  it("berhasil mengunggah dokumen jika bucket privat tersedia dan mengembalikan referensi kanonik 201", async () => {
    vi.mocked(prisma.volunteerProfile.findUnique).mockResolvedValue(null);
    mockStorage.getBucket.mockResolvedValue({ data: { public: false }, error: null });
    mockStorage.upload.mockResolvedValue({ error: null });

    const form = new FormData();
    form.append("document", new Blob([validJpeg], { type: "image/jpeg" }), "ktp.jpg");

    const res = await fetch(`${base}/volunteers/identity-document`, {
      method: "POST",
      headers: headers("volunteer"),
      body: form,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: any };
    expect(body.success).toBe(true);
    expect(body.data.idCardUrl).toMatch(
      new RegExp(`^storage://${BUCKET_NAME}/${volunteerId}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(body.data.mimeType).toBe("image/jpeg");
    expect(mockStorage.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${volunteerId}/[0-9a-f-]{36}\\.jpg$`)),
      expect.any(Buffer),
      expect.objectContaining({ upsert: false, metadata: { ownerId: volunteerId } }),
    );
  });
});

describe("POST /volunteers/apply dengan referensi kanonik", () => {
  it("menolak URL publik atau skema selain storage://volunteer-identities", async () => {
    const res = await fetch(`${base}/volunteers/apply`, {
      method: "POST",
      headers: { ...headers("volunteer"), "Content-Type": "application/json" },
      body: JSON.stringify({
        motivation: "Ingin mendampingi sesama difabel di transportasi umum",
        idCardUrl: "https://example.com/ktp.jpg",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("menolak referensi kanonik milik akun orang lain", async () => {
    const otherUserId = "22222222-2222-4222-8222-222222222222";
    const res = await fetch(`${base}/volunteers/apply`, {
      method: "POST",
      headers: { ...headers("volunteer", volunteerId), "Content-Type": "application/json" },
      body: JSON.stringify({
        motivation: "Ingin mendampingi sesama difabel di transportasi umum",
        idCardUrl: `storage://volunteer-identities/${otherUserId}/33333333-3333-4333-8333-333333333333.jpg`,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("menerima referensi kanonik milik sendiri dan membuat profil pending tanpa capability", async () => {
    const validRef = `storage://volunteer-identities/${volunteerId}/33333333-3333-4333-8333-333333333333.jpg`;
    vi.mocked(prisma.volunteerProfile.create).mockResolvedValue({
      verificationStatus: "pending",
      canCompanion: false,
      canMapData: false,
      ratingAvg: 0 as any,
      totalHelps: 0,
      isActive: false,
    } as any);

    const res = await fetch(`${base}/volunteers/apply`, {
      method: "POST",
      headers: { ...headers("volunteer", volunteerId), "Content-Type": "application/json" },
      body: JSON.stringify({
        motivation: "Ingin mendampingi sesama difabel di transportasi umum",
        idCardUrl: validRef,
        serviceAreaNote: "Area Jakarta Pusat",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: any };
    expect(body.success).toBe(true);
    expect(body.data.verificationStatus).toBe("pending");
    expect(body.data.canCompanion).toBe(false);
    expect(body.data.canMapData).toBe(false);
    expect(body.data.idCardUrl).toBeUndefined(); // profil umum tidak membocorkan reference
  });
});

describe("GET /volunteers/me/identity-document dan /volunteers/:id/identity-document", () => {
  it("relawan membaca dokumen sendiri: signed URL 60 detik dan Cache-Control no-store", async () => {
    const validRef = `storage://volunteer-identities/${volunteerId}/33333333-3333-4333-8333-333333333333.jpg`;
    vi.mocked(prisma.volunteerProfile.findUnique).mockResolvedValue({
      idCardUrl: validRef,
    } as any);
    mockStorage.getBucket.mockResolvedValue({ data: { public: false }, error: null });
    mockStorage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://mock.supabase.co/signed-url-for-doc" },
      error: null,
    });

    const res = await fetch(`${base}/volunteers/me/identity-document`, {
      headers: headers("volunteer", volunteerId),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { success: boolean; data: any };
    expect(body.data.url).toBe("https://mock.supabase.co/signed-url-for-doc");
    expect(body.data.expiresInSeconds).toBe(60);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "volunteer.identity.read",
        actorId: volunteerId,
        targetUserId: volunteerId,
      }),
    });
  });

  it("menolak relawan lain membaca dokumen target dengan 403", async () => {
    const otherVolunteer = "44444444-4444-4444-8444-444444444444";
    const res = await fetch(`${base}/volunteers/${volunteerId}/identity-document`, {
      headers: headers("volunteer", otherVolunteer),
    });
    expect(res.status).toBe(403);
  });

  it("admin berwenang membaca dokumen relawan target dengan signed URL 60 detik", async () => {
    const validRef = `storage://volunteer-identities/${volunteerId}/33333333-3333-4333-8333-333333333333.jpg`;
    vi.mocked(prisma.volunteerProfile.findUnique).mockResolvedValue({
      idCardUrl: validRef,
    } as any);
    mockStorage.getBucket.mockResolvedValue({ data: { public: false }, error: null });
    mockStorage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://mock.supabase.co/signed-url-for-admin" },
      error: null,
    });

    const res = await fetch(`${base}/volunteers/${volunteerId}/identity-document`, {
      headers: headers("admin", adminId),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { success: boolean; data: any };
    expect(body.data.url).toBe("https://mock.supabase.co/signed-url-for-admin");
    expect(body.data.expiresInSeconds).toBe(60);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "volunteer.identity.read",
        actorId: adminId,
        targetUserId: volunteerId,
      }),
    });
  });
});
