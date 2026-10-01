import type { Server, Socket } from "socket.io";
import { AppError } from "../shared/errors.js";
import { assertCanViewLocation } from "../middleware/rbac.js";
import * as sessionsService from "../modules/sessions/sessions.service.js";
import { getSocketUser } from "./auth.js";

export function registerSessionHandlers(_io: Server, socket: Socket) {
  // Blind user maupun caregiver join room sesi supaya bisa saling dengar
  // session:check/alert:area -- tapi hanya kalau berhak: pemilik sesi, atau
  // caregiver yang lolos assertCanViewLocation() (aturan yang sama dipakai
  // location:shared, supaya tidak ada dua sumber kebenaran berbeda untuk
  // "siapa boleh tahu keberadaan user ini").
  socket.on("session:join", async (sessionId: string) => {
    const userId = getSocketUser(socket).id;
    const owned = await sessionsService.isOwnedBy(sessionId, userId);
    if (owned) {
      socket.join(`session:${sessionId}`);
      return;
    }

    const session = await sessionsService.getSessionOwnerId(sessionId);
    if (!session) {
      socket.emit("session:join:error", { message: "Sesi tidak ditemukan." });
      return;
    }
    try {
      await assertCanViewLocation(userId, session);
      socket.join(`session:${sessionId}`);
    } catch (err) {
      if (!(err instanceof AppError && err.code === "FORBIDDEN")) throw err;
      socket.emit("session:join:error", { message: "Anda tidak berhak memantau sesi ini." });
    }
  });

  socket.on("session:leave", (sessionId: string) => {
    socket.leave(`session:${sessionId}`);
  });

  // session:ended di-broadcast dari sessions.controller.ts (endpoint /end) via getIo(),
  // bukan dari sini — socket cuma urus join/leave. Lihat getIo() di realtime/index.ts
  // untuk pola broadcast yang sama dipakai SOS.
}

// §15.3 session:check -- dead man's switch (jobs/check-stale-sessions.job.ts).
// Klien yang menyusun tampilan dari payload ini, backend hanya mengirim sinyal
// (CLAUDE.md §1: backend tidak pernah menentukan teks UI selain error.message).
export function broadcastSessionCheck(io: Server, sessionId: string, payload: unknown) {
  io.to(`session:${sessionId}`).emit("session:check", payload);
}
