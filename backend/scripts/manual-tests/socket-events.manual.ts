// Jalankan: npx tsx scripts/manual-tests/socket-events.manual.ts <sessionId> <blindToken> <caregiverToken>
// sessionId HARUS milik pemilik blindToken sungguhan di DB (isOwnedBy dicek
// server) -- buat sesi dulu lewat POST /api/sessions/start, dan pastikan
// blind user punya CaregiverRelationship ke caregiver (lihat
// sos-broadcast.dev.seed.ts). Semua koneksi WAJIB auth: {token} -- socket
// tanpa token ditolak saat handshake (realtime/auth.ts).
import { io } from "socket.io-client";

const [, , sessionId, blindToken, caregiverToken] = process.argv;
if (!sessionId || !blindToken || !caregiverToken) {
  console.error("Usage: tsx socket-events.manual.ts <sessionId> <blindToken> <caregiverToken>");
  process.exit(1);
}

// Caregiver subscribe ke room personalnya (userId diambil dari token, bukan
// parameter) -- location:shared dikirim per-penerima ke room user:{id}, bukan
// broadcast ke session:{id} mentah-mentah (lihat realtime/location.handlers.ts).
const caregiver = io("http://localhost:4000", { auth: { token: caregiverToken } });
caregiver.on("connect", () => {
  console.log("[caregiver] connected (authed), subscribing");
  caregiver.emit("sos:subscribe");
});
caregiver.on("location:shared", (data) => console.log("[caregiver] terima location:shared", data));
caregiver.on("session:ended", (data) => console.log("[caregiver] terima session:ended", data));

setTimeout(() => {
  const blindUser = io("http://localhost:4000", { auth: { token: blindToken } });
  blindUser.on("connect", () => {
    console.log("[blindUser] connected (authed)");
    blindUser.emit("session:join", sessionId);

    setTimeout(() => {
      // userId TIDAK dikirim -- diambil dari token oleh server.
      blindUser.emit("location:update", { sessionId, coordinates: [110.37, -7.77] });
    }, 500);

    setTimeout(() => process.exit(0), 1500);
  });
}, 500);
