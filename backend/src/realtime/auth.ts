// Autentikasi socket.io handshake -- docs/API_CONTRACT.md §15: "auth via
// auth: { token } saat handshake". Sebelum ini, semua handler menerima
// userId/sessionId mentah dari client tanpa verifikasi identitas (siapa saja
// bisa subscribe ke room user manapun) -- middleware ini menutup celah itu
// dengan pola yang sama seperti middleware/auth.ts di REST (requireAuth).
import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../modules/auth/token.js";

export interface AuthenticatedUser {
  id: string;
  role: string;
}

// Socket.io v4 mengetik `socket.data` sebagai `SocketData` generik (default
// Record<string, unknown>) -- augmentasi `interface Socket` langsung
// ditolak TypeScript (conflicting declaration). Modul lain cukup import tipe
// ini dan tulis `(socket.data as SocketDataWithUser).user`, atau pakai
// `getSocketUser(socket)` di bawah supaya tidak berulang cast manual.
export interface SocketDataWithUser {
  user: AuthenticatedUser;
}

export function getSocketUser(socket: Socket): AuthenticatedUser {
  return (socket.data as SocketDataWithUser).user;
}

// Dipasang sebagai io.use() -- dijalankan SEKALI per koneksi, sebelum event
// handler mana pun terpasang. Token invalid/tidak ada -> connection ditolak
// (socket tidak pernah masuk ke registerSocketHandlers()), konsisten dengan
// requireAuth() di REST yang menolak 401 sebelum controller jalan.
export function registerSocketAuth(io: Server): void {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      (socket.data as SocketDataWithUser).user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });
}
