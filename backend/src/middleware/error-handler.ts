// Satu-satunya tempat error berubah jadi HTTP response. WAJIB dipasang paling
// akhir di chain middleware (backend/docs/SDD.md §2.2).
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors.js";

function fail(code: string, message: string, details?: unknown) {
  return { success: false, error: { code, message, details } };
}

function formatZodIssues(err: ZodError) {
  return err.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as Request & { requestId?: string }).requestId;

  if (err instanceof ZodError) {
    return res
      .status(400)
      .json(fail("VALIDATION_ERROR", "Data yang dikirim tidak valid.", formatZodIssues(err)));
  }

  if (err instanceof AppError) {
    if (err.httpStatus >= 500) {
      console.error({ requestId, code: err.code, err });
    } else {
      console.warn({ requestId, code: err.code, message: err.message });
    }
    return res.status(err.httpStatus).json(fail(err.code, err.message, err.details));
  }

  console.error({ requestId, err }); // tak terduga -> jangan bocorkan detail ke klien
  return res
    .status(500)
    .json(fail("INTERNAL_ERROR", "Terjadi kesalahan pada sistem. Silakan coba lagi."));
}
