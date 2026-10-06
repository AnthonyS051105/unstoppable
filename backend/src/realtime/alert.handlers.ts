import type { Server, Socket } from "socket.io";

export function registerAlertHandlers(io: Server, socket: Socket) {
  // saat ini tidak ada event dari client untuk kategori ini
  // alert dikirim server->client lewat helper di bawah
}

export function broadcastAreaAlert(io: Server, sessionId: string, payload: unknown) {
  io.to(`session:${sessionId}`).emit("alert:area", payload);
}
