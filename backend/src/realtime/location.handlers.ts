import type { Server, Socket } from "socket.io";

interface LocationUpdate {
  sessionId: string;
  lat: number;
  lng: number;
}

export function registerLocationHandlers(io: Server, socket: Socket) {
  socket.on("location:update", (data: LocationUpdate) => {
    // broadcast ke room, kecuali si pengirim sendiri
    socket.to(`session:${data.sessionId}`).emit("location:updated", data);
  });
}
