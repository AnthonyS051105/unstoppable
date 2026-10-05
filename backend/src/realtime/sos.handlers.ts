// SOS realtime gateway -- docs/API_CONTRACT.md §15. Controller di
// modules/sos/sos.controller.ts memanggil fungsi broadcastSos* di sini
// (bukan sebaliknya) setelah state insiden tersimpan di DB.
import type { Server, Socket } from "socket.io";
import * as sosService from "../modules/sos/sos.service.js";
import { SOS_RESPONSE_STATUSES, type SosResponseStatus } from "../modules/sos/sos.types.js";
import { getSocketUser } from "./auth.js";

export function registerSosHandlers(io: Server, socket: Socket) {
  // Room personal `user:{id}` kini di-join OTOMATIS saat handshake (lihat
  // realtime/index.ts, kontrak §15.1) -- jadi sos:triggered/sos:update/
  // sos:resolved langsung sampai tanpa perlu event ini. `sos:subscribe`
  // dipertahankan sebagai no-op idempoten demi kompatibilitas klien lama yang
  // masih mengirimnya; join berulang ke room yang sama tidak berefek apa-apa.
  socket.on("sos:subscribe", () => {
    socket.join(`user:${getSocketUser(socket).id}`);
  });

  // §15.2 sos:respond -- relawan merespons dari client lewat socket (selain
  // REST POST /sos/:id/respond). volunteerId diambil dari token, bukan
  // payload -- mencegah relawan A mengirim respons atas nama relawan B.
  // Validasi bentuk payload minimal di sini; kepemilikan & transisi status
  // tetap dijaga sos.service.ts.
  socket.on(
    "sos:respond",
    async (data: { sosId?: string; responseStatus?: string }) => {
      const volunteerId = getSocketUser(socket).id;
      if (!data?.sosId || !SOS_RESPONSE_STATUSES.includes(data.responseStatus as SosResponseStatus)) {
        socket.emit("sos:respond:error", { message: "Payload sos:respond tidak valid." });
        return;
      }

      try {
        const response = await sosService.respondToSos(
          data.sosId,
          volunteerId,
          data.responseStatus as SosResponseStatus,
        );
        const ownerId = await sosService.getSosOwnerId(data.sosId);
        if (ownerId) {
          const sosStatus = await sosService.getSosStatus(data.sosId);
          broadcastSosUpdate(io, ownerId, {
            sosId: data.sosId,
            status: sosStatus.status,
            escalationLevel: sosStatus.escalationLevel,
            responders: sosStatus.responders,
          });
        }
        socket.emit("sos:respond:ack", response);
      } catch (err) {
        socket.emit("sos:respond:error", {
          message: err instanceof Error ? err.message : "Gagal mengirim respons SOS.",
        });
      }
    },
  );
}

// §15.3 sos:triggered -- broadcast ke caregiver yang tertaut pengguna.
// (Bukan nama event di §15.3 kontrak, tapi dipakai sebagai notifikasi caregiver
// yang lebih ringan dari sos:update; dipertahankan untuk kompatibilitas FE yang
// sudah mengonsumsinya -- lihat docs/API_CONTRACT.md §17 catatan penyimpangan.)
export function broadcastSosTriggered(io: Server, caregiverIds: string[], payload: unknown) {
  for (const id of caregiverIds) {
    io.to(`user:${id}`).emit("sos:triggered", payload);
  }
}

// §15.3 sos:new -- ke relawan dalam radius (sudah difilter di
// sos.service.ts#findNearbyVolunteers sebelum sampai sini). Payload kontrak:
// { sosId, user: {id,name}, coordinates, distanceM, triggerType }. distanceM
// bersifat per-relawan (jarak area layanan relawan -> titik insiden), jadi tiap
// relawan menerima payload yang di-tailor dengan distanceM-nya sendiri.
export interface SosNewRecipient {
  volunteerId: string;
  distanceM: number;
}

export interface SosNewBasePayload {
  sosId: string;
  user: { id: string; name: string | null };
  coordinates: [number, number];
  triggerType: string;
}

export function broadcastSosNew(io: Server, recipients: SosNewRecipient[], base: SosNewBasePayload) {
  for (const { volunteerId, distanceM } of recipients) {
    io.to(`user:${volunteerId}`).emit("sos:new", { ...base, distanceM });
  }
}

// §15.3 sos:update -- ke pengguna pemilik insiden (room user:{id} juga
// menjangkau caregiver yang subscribe ke room yang sama lewat sos:subscribe).
export function broadcastSosUpdate(io: Server, userId: string, payload: unknown) {
  io.to(`user:${userId}`).emit("sos:update", payload);
}

// §15.3 sos:resolved -- ke semua pihak terkait (pengguna sendiri + caregiver).
export function broadcastSosResolved(io: Server, userIds: string[], payload: unknown) {
  for (const id of userIds) {
    io.to(`user:${id}`).emit("sos:resolved", payload);
  }
}
