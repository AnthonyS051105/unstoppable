// AppError + kode standar. Satu-satunya bentuk error yang boleh dilempar dari
// service/controller — middleware/error-handler.ts yang mengubahnya jadi response.
// Lihat docs/API_CONTRACT.md §1.5 dan backend/docs/SDD.md §2.

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "NOT_VERIFIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ROUTE_UNREACHABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SPEECH_UNAVAILABLE";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string, // Bahasa Indonesia, layak dibaca pengguna
    public httpStatus: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
