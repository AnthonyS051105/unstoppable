import type { Server, Socket } from "socket.io";

export function registerSosHandlers(io: Server, socket: Socket) {
  // Caregiver join room personalnya supaya bisa menerima notifikasi SOS
  socket.on("sos:subscribe", (userId: string) => {
    socket.join(`user:${userId}`);
  });
}

// Dipanggil dari sos.controller.ts (bukan dari client) setiap ada insiden baru
export function broadcastSosTriggered(io: Server, caregiverIds: string[], payload: unknown) {
  for (const id of caregiverIds) {
    io.to(`user:${id}`).emit("sos:triggered", payload);
  }
}
