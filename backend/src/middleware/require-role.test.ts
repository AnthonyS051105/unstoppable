// Unit test MURNI (vitest, tanpa DB) untuk guard requireRole (middleware/rbac.ts).
// Memverifikasi pengetatan otorisasi Task 11 §3:
//   - GET /users/me/dependents: hanya caregiver (+ admin superuser)
//   - POST /volunteers/apply: hanya blind_user / mobility_user
import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { requireRole } from "./rbac.js";
import { AppError } from "../shared/errors.js";

function runGuard(
  guard: ReturnType<typeof requireRole>,
  role: string | undefined,
): AppError | null | "passed" {
  const req = {
    user: role ? { id: "u1", role } : undefined,
    headers: {},
  } as unknown as Request;
  const res = {} as Response;
  let result: AppError | null | "passed" = "passed";
  guard(req, res, (err?: unknown) => {
    result = err ? (err as AppError) : "passed";
  });
  return result;
}

describe("requireRole — dependents guard (caregiver + admin)", () => {
  const guard = requireRole(["caregiver", "admin"]);

  it("caregiver boleh lewat", () => {
    expect(runGuard(guard, "caregiver")).toBe("passed");
  });

  it("admin boleh lewat (superuser)", () => {
    expect(runGuard(guard, "admin")).toBe("passed");
  });

  it("blind_user ditolak 403 FORBIDDEN", () => {
    const err = runGuard(guard, "blind_user");
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("FORBIDDEN");
    expect((err as AppError).httpStatus).toBe(403);
  });

  it("volunteer ditolak 403 FORBIDDEN", () => {
    const err = runGuard(guard, "volunteer");
    expect((err as AppError).httpStatus).toBe(403);
  });

  it("tanpa role (belum login) ditolak 401 UNAUTHENTICATED", () => {
    const err = runGuard(guard, undefined);
    expect((err as AppError).code).toBe("UNAUTHENTICATED");
    expect((err as AppError).httpStatus).toBe(401);
  });
});

describe("requireRole — volunteers apply guard (blind_user + mobility_user)", () => {
  const guard = requireRole(["blind_user", "mobility_user"]);

  it("blind_user boleh mendaftar", () => {
    expect(runGuard(guard, "blind_user")).toBe("passed");
  });

  it("mobility_user boleh mendaftar", () => {
    expect(runGuard(guard, "mobility_user")).toBe("passed");
  });

  it("caregiver ditolak 403 FORBIDDEN", () => {
    const err = runGuard(guard, "caregiver");
    expect((err as AppError).code).toBe("FORBIDDEN");
    expect((err as AppError).httpStatus).toBe(403);
  });

  it("volunteer ditolak 403 FORBIDDEN", () => {
    expect((runGuard(guard, "volunteer") as AppError).httpStatus).toBe(403);
  });

  it("admin ditolak 403 FORBIDDEN (mendaftar relawan adalah aksi end-user)", () => {
    expect((runGuard(guard, "admin") as AppError).httpStatus).toBe(403);
  });
});
