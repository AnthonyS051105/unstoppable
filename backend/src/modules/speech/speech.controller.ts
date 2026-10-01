// Controller HANYA menerjemahkan req/res <-> service (backend/CLAUDE.local.md
// §3). Tidak ada panggilan microservice langsung di sini.
import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import { AppError } from "../../shared/errors.js";
import { synthesizeSchema } from "./speech.schema.js";
import * as speechService from "./speech.service.js";

/**
 * POST /api/speech/synthesize -- audio/mpeg (binary), bukan {success,data}.
 */
export const synthesize = asyncHandler(async (req, res) => {
  const input = synthesizeSchema.parse(req.body);
  const { buffer, contentType } = await speechService.synthesize(
    input.text,
    input.speedPercent ?? 100,
    input.lang ?? "id-ID",
  );
  res.set("Content-Type", contentType).send(buffer);
});

/**
 * POST /api/speech/transcribe -- multipart/form-data field "audio".
 */
export const transcribe = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("VALIDATION_ERROR", "Field 'audio' wajib diisi.", 400);
  }
  const result = await speechService.transcribe(req.file.buffer, req.file.originalname || "audio.webm");
  ok(res, result);
});
