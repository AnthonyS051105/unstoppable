// Unit test MURNI (vitest) untuk computeInviteExpiry (B4 §4.2). Fungsi ini tak
// menyentuh DB, tapi modulnya meng-import prisma & volunteers.service, jadi
// keduanya di-mock agar import tidak membawa efek samping.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({ prisma: {} }));
vi.mock("../volunteers/volunteers.service.js", () => ({}));

import { computeInviteExpiry } from "./companions.service.js";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("computeInviteExpiry (§12.1)", () => {
  const now = new Date("2026-10-16T08:00:00.000Z");

  it("3 hari lagi -> +12 jam (tidak melewati start - 2 jam)", () => {
    const start = new Date(now.getTime() + 3 * 24 * HOUR);
    const result = computeInviteExpiry(start, now);
    expect(result.getTime()).toBe(now.getTime() + 12 * HOUR);
  });

  it("10 jam lagi -> +30 menit (jadwal < 24 jam)", () => {
    const start = new Date(now.getTime() + 10 * HOUR);
    const result = computeInviteExpiry(start, now);
    expect(result.getTime()).toBe(now.getTime() + 30 * MIN);
  });

  it("2 jam 20 menit lagi -> dipotong ke start - 2 jam", () => {
    const start = new Date(now.getTime() + 2 * HOUR + 20 * MIN);
    const result = computeInviteExpiry(start, now);
    // window 30 menit, tapi dipotong ke latest = start - 2 jam = now + 20 menit.
    expect(result.getTime()).toBe(start.getTime() - 2 * HOUR);
  });

  it("40 menit lagi -> 30 menit (cutoff 2 jam sudah lewat, 30 mnt belum lewat start)", () => {
    const start = new Date(now.getTime() + 40 * MIN);
    const result = computeInviteExpiry(start, now);
    // latest (start - 2 jam) di masa lalu -> beri 30 menit; min(now+30m, start) = now+30m.
    expect(result.getTime()).toBe(now.getTime() + 30 * MIN);
  });

  it("20 menit lagi -> dipotong ke start (30 mnt akan melewati start)", () => {
    const start = new Date(now.getTime() + 20 * MIN);
    const result = computeInviteExpiry(start, now);
    // min(now+30m, start) = start, karena start < now+30m.
    expect(result.getTime()).toBe(start.getTime());
  });
});
