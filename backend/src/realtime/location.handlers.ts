// §15.2/15.3 location:update -- server memvalidasi sessionId dan menyimpan
// ping sebelum meneruskan lokasi ke caregiver yang berhak.
import type { Server, Socket } from "socket.io";
import { AppError } from "../shared/errors.js";
import { assertCanViewLocation } from "../middleware/rbac.js";
import * as sessionsService from "../modules/sessions/sessions.service.js";
import * as sosService from "../modules/sos/sos.service.js";
import { getSocketUser } from "./auth.js";

interface LocationUpdate {
  sessionId: string;
  coordinates: [number, number]; // [lng, lat], GeoJSON
  accuracyM?: number;
}

export function registerLocationHandlers(io: Server, socket: Socket) {
  socket.on("location:update", async (data: LocationUpdate) => {
    const userId = getSocketUser(socket).id;
    if (!data?.sessionId || !Array.isArray(data.coordinates) || data.coordinates.length < 2) {
      socket.emit("location:update:error", { message: "Payload location:update tidak valid." });
      return;
    }

    const [lng, lat] = data.coordinates;
    const recorded = await sessionsService.recordLocationPing({
      sessionId: data.sessionId,
      userId,
      lng,
      lat,
      accuracyM: data.accuracyM,
    });

    if (!recorded) {
      socket.emit("location:update:error", { message: "Sesi tidak aktif atau bukan milik Anda." });
      return;
    }

    const caregiverIds = await sosService.getCaregiverIds(userId);
    const payload = {
      sessionId: data.sessionId,
      userId,
      coordinates: data.coordinates,
      recordedAt: recorded.ping.recordedAt.toISOString(),
    };

    for (const caregiverId of caregiverIds) {
      try {
        await assertCanViewLocation(caregiverId, userId);
        io.to(`user:${caregiverId}`).emit("location:shared", payload);
      } catch (err) {
        if (!(err instanceof AppError && err.code === "FORBIDDEN")) throw err;
        // Caregiver ini belum berhak melihat lokasi saat ini -- kondisi normal.
      }
    }

    if (recorded.arrivalCheck) {
      io.to(`user:${userId}`).emit("session:arrival-check", {
        sessionId: recorded.arrivalCheck.sessionId,
        destinationName: recorded.arrivalCheck.destinationName,
        autoEndAt: recorded.arrivalCheck.autoEndAt.toISOString(),
      });
    }
  });
}
