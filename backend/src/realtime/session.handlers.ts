import type { Server, Socket } from "socket.io";

export function registerSessionHandlers(_io: Server, socket: Socket) {
  // Blind user maupun caregiver join room sesi supaya bisa saling dengar event
  socket.on("session:join", (sessionId: string) => {
    socket.join(`session:${sessionId}`);
    console.log(`${socket.id} joined session:${sessionId}`);
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
