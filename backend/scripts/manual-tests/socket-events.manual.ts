// Jalankan: npx tsx scripts/manual-tests/socket-events.manual.ts <sessionId> <blindUserId> <caregiverId>
// sessionId HARUS milik blindUserId sungguhan di DB (isOwnedBy dicek server)
// -- buat sesi dulu lewat POST /api/sessions/start, dan pastikan blindUserId
// punya CaregiverRelationship ke caregiverId (lihat sos-broadcast.dev.seed.ts).
import { io } from "socket.io-client";

const [, , sessionId, blindUserId, caregiverId] = process.argv;
if (!sessionId || !blindUserId || !caregiverId) {
  console.error("Usage: tsx socket-events.manual.ts <sessionId> <blindUserId> <caregiverId>");
  process.exit(1);
}

// Caregiver subscribe ke room personalnya (bukan room sesi) -- location:shared
// sekarang dikirim per-penerima ke room user:{id}, bukan broadcast ke
// session:{id} mentah-mentah (lihat realtime/location.handlers.ts).
const caregiver = io("http://localhost:4000");
caregiver.on("connect", () => {
  console.log("[caregiver] connected, subscribing");
  caregiver.emit("sos:subscribe", caregiverId); // room user:{id} sama dipakai semua event personal
});
caregiver.on("location:shared", (data) => console.log("[caregiver] terima location:shared", data));
caregiver.on("session:ended", (data) => console.log("[caregiver] terima session:ended", data));

setTimeout(() => {
  const blindUser = io("http://localhost:4000");
  blindUser.on("connect", () => {
    console.log("[blindUser] connected");
    blindUser.emit("session:join", sessionId);

    setTimeout(() => {
      blindUser.emit("location:update", {
        sessionId,
        userId: blindUserId,
        coordinates: [110.37, -7.77],
      });
    }, 500);

    setTimeout(() => process.exit(0), 1500);
  });
}, 500);
