import type { Server, Socket } from "socket.io";
import { registerSessionHandlers } from "./session.handlers.js";
import { registerLocationHandlers } from "./location.handlers.js";
import { registerSosHandlers } from "./sos.handlers.js";
import { registerAlertHandlers } from "./alert.handlers.js";

// Semua event socket.io didaftarkan di sini, satu file per kategori.
// Room convention:
//   session:<sessionId>   -> blind user (emitter) + caregiver yang memantau sesi itu
//   user:<userId>         -> notifikasi personal (mis. caregiver menerima alert SOS)
let ioInstance: Server | undefined;

// Dipanggil dari controller Express manapun yang perlu broadcast realtime
// (sos.controller.ts, session.controller.ts) — bukan dari dalam handler socket.
export function getIo(): Server {
  if (!ioInstance) {
    throw new Error("Socket.io belum diinisialisasi — registerSocketHandlers() belum dipanggil");
  }
  return ioInstance;
}

export function registerSocketHandlers(io: Server) {
  ioInstance = io;

  io.on("connection", (socket: Socket) => {
    console.log("Client connected:", socket.id);

    registerSessionHandlers(io, socket);
    registerLocationHandlers(io, socket);
    registerSosHandlers(io, socket);
    registerAlertHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}
