import type { Server, Socket } from "socket.io";

export function registerSessionHandlers(io: Server, socket: Socket) {
  // Blind user maupun caregiver join room sesi supaya bisa saling dengar event
  socket.on("session:join", (sessionId: string) => {
    socket.join(`session:${sessionId}`);
    console.log(`${socket.id} joined session:${sessionId}`);
  });

  socket.on("session:leave", (sessionId: string) => {
    socket.leave(`session:${sessionId}`);
  });

  // Dipanggil saat travel session ditutup (sampai tujuan / dibatalkan)
  socket.on("session:end", (sessionId: string) => {
    io.to(`session:${sessionId}`).emit("session:ended", { sessionId });
  });
}
