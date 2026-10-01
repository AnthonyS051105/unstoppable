// §15.2/15.3 location:update -- docs/API_CONTRACT.md. Server memvalidasi bahwa
// sessionId benar milik user pengirim (§15.4, wajib) sebelum memproses, dan
// hanya meneruskan ke caregiver yang berhak melihat lokasi ini saat ini
// (locationSharingMode -- CLAUDE.local.md §5.3: "Lokasi hanya untuk: pemiliknya,
// caregiver sesuai locationSharingMode, relawan hanya selama SOS aktif").
//
// userId diambil dari token (socket.data.user, lihat realtime/auth.ts), BUKAN
// dari payload client -- payload yang mengaku jadi user lain tidak mungkin lagi
// lolos verifikasi identitas; isOwnedBy() di bawah sekarang murni mengecek
// sessionId yang diklaim benar milik user yang sudah terverifikasi ini.
import type { Server, Socket } from "socket.io";
import { AppError } from "../shared/errors.js";
import { assertCanViewLocation } from "../middleware/rbac.js";
import * as sessionsService from "../modules/sessions/sessions.service.js";
import * as sosService from "../modules/sos/sos.service.js";
import { getSocketUser } from "./auth.js";

interface LocationUpdate {
  sessionId: string;
  coordinates: [number, number]; // [lng, lat], GeoJSON (§1.2)
  accuracyM?: number;
}

export function registerLocationHandlers(io: Server, socket: Socket) {
  socket.on("location:update", async (data: LocationUpdate) => {
    const userId = getSocketUser(socket).id;
    if (!data?.sessionId || !Array.isArray(data.coordinates) || data.coordinates.length < 2) {
      socket.emit("location:update:error", { message: "Payload location:update tidak valid." });
      return;
    }

    const owned = await sessionsService.isOwnedBy(data.sessionId, userId);
    if (!owned) {
      socket.emit("location:update:error", { message: "Sesi ini bukan milik Anda." });
      return;
    }

    const payload = {
      sessionId: data.sessionId,
      userId,
      coordinates: data.coordinates,
      recordedAt: new Date().toISOString(),
    };

    // Teruskan HANYA ke caregiver yang berhak melihat lokasi ini saat ini --
    // bukan broadcast room polos. assertCanViewLocation() sumber kebenaran
    // tunggal untuk aturan ini (sama dipakai GET /sos/:id/status), dipanggil
    // per-caregiver supaya mode 'sos_only'/companion aktif tetap dihormati.
    const caregiverIds = await sosService.getCaregiverIds(userId);
    for (const caregiverId of caregiverIds) {
      try {
        await assertCanViewLocation(caregiverId, userId);
        io.to(`user:${caregiverId}`).emit("location:shared", payload);
      } catch (err) {
        if (!(err instanceof AppError && err.code === "FORBIDDEN")) throw err;
        // Caregiver ini belum berhak melihat lokasi saat ini (mis. sos_only
        // tapi tidak ada SOS aktif) -- lewati diam-diam, ini kondisi normal,
        // bukan error.
      }
    }
  });
}
