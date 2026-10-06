// Unit test MURNI (vitest, tanpa DB/jaringan nyata) untuk getHealthSnapshot
// sesuai bentuk kontrak §16: { status, db, speech, uptimeSec, version }.
// prisma.$queryRaw & global.fetch di-mock supaya cek db/speech bisa diuji
// tanpa Postgres atau microservice yang berjalan.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../config/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "../../config/prisma.js";
import { getHealthSnapshot } from "./health.service.js";

const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

describe("getHealthSnapshot (§16)", () => {
  const originalFetch = globalThis.fetch;
  const originalSpeechUrl = process.env.SPEECH_SERVICE_URL;

  beforeEach(() => {
    queryRawMock.mockReset();
    process.env.SPEECH_SERVICE_URL = "http://speech.test:8080";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalSpeechUrl === undefined) delete process.env.SPEECH_SERVICE_URL;
    else process.env.SPEECH_SERVICE_URL = originalSpeechUrl;
  });

  it("mengembalikan semua field kontrak dengan db & speech ok saat sehat", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    const snap = await getHealthSnapshot();

    expect(Object.keys(snap).sort()).toEqual(
      ["db", "speech", "status", "uptimeSec", "version"].sort(),
    );
    expect(snap.status).toBe("ok");
    expect(snap.db).toBe("ok");
    expect(snap.speech).toBe("ok");
    expect(typeof snap.uptimeSec).toBe("number");
    expect(snap.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(typeof snap.version).toBe("string");
    expect(snap.version.length).toBeGreaterThan(0);
    // version dibaca dari package.json (bukan "unknown" saat file ketemu).
    expect(snap.version).not.toBe("unknown");
  });

  it("db=down saat query gagal, tetapi status tetap ok", async () => {
    queryRawMock.mockRejectedValue(new Error("connection refused"));
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    const snap = await getHealthSnapshot();

    expect(snap.status).toBe("ok");
    expect(snap.db).toBe("down");
    expect(snap.speech).toBe("ok");
  });

  it("speech=down saat microservice tidak merespons ok", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const snap = await getHealthSnapshot();

    expect(snap.db).toBe("ok");
    expect(snap.speech).toBe("down");
  });

  it("speech=down saat SPEECH_SERVICE_URL tidak diset (tanpa fetch)", async () => {
    delete process.env.SPEECH_SERVICE_URL;
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const snap = await getHealthSnapshot();

    expect(snap.speech).toBe("down");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("speech=down saat fetch melempar (timeout/jaringan)", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("timeout")) as unknown as typeof fetch;

    const snap = await getHealthSnapshot();

    expect(snap.speech).toBe("down");
  });
});
