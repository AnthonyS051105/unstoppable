// Membaca Authorization: Bearer, verifikasi JWT, isi req.user = { id, role }.
// Token kedaluwarsa -> 401 TOKEN_EXPIRED (klien akan me-refresh). SDD §3.1.
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors.js";
import { verifyAccessToken } from "../modules/auth/token.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    return next(new AppError("UNAUTHENTICATED", "Token tidak ada.", 401));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
}
