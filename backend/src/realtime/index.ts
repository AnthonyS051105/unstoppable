import type { Server, Socket } from "socket.io";
import { registerSessionHandlers } from "./session.handlers.js";
import { registerLocationHandlers } from "./location.handlers.js";
import { registerSosHandlers } from "./sos.handlers.js";
import { registerAlertHandlers } from "./alert.handlers.js";
import { registerSocketAuth, getSocketUser } from "./auth.js";

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
  registerSocketAuth(io);

  io.on("connection", (socket: Socket) => {
    const userId = getSocketUser(socket).id;
    console.log(`Client connected: ${socket.id} (user ${userId})`);

    // Auto-join room personal segera setelah handshake terautentikasi (kontrak
    // §15.1). Dulu join `user:{id}` hanya terjadi saat klien mengirim
    // `sos:subscribe`, sehingga notifikasi companion (`companion:*`) & lainnya
    // bisa tak sampai bila klien belum subscribe SOS. userId dari token
    // (socket.data.user), bukan payload client -- tidak ada cara join room
    // orang lain.
    socket.join(`user:${userId}`);

    registerSessionHandlers(io, socket);
    registerLocationHandlers(io, socket);
    registerSosHandlers(io, socket);
    registerAlertHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}
