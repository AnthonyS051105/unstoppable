import { io } from "socket.io-client";

const sessionId = "test-session-123";

// simulasi caregiver: join room sesi, dengarkan event
const caregiver = io("http://localhost:4000");
caregiver.on("connect", () => {
  console.log("[caregiver] connected");
  caregiver.emit("session:join", sessionId);
});
caregiver.on("location:updated", (data) => console.log("[caregiver] terima location:updated", data));
// session:ended sekarang di-broadcast dari session.controller.ts (endpoint /end),
// bukan dari event socket "session:end" — lihat scripts/manual-tests/sos-broadcast.ts
// untuk pola test broadcast HTTP -> socket. Blocker: session.controller.ts belum ada (PIC Nael).
caregiver.on("session:ended", (data) => console.log("[caregiver] terima session:ended", data));

// simulasi blind user: join room sama, kirim lokasi
setTimeout(() => {
  const blindUser = io("http://localhost:4000");
  blindUser.on("connect", () => {
    console.log("[blindUser] connected");
    blindUser.emit("session:join", sessionId);

    setTimeout(() => {
      blindUser.emit("location:update", { sessionId, lat: -7.77, lng: 110.37 });
    }, 500);

    setTimeout(() => process.exit(0), 1500);
  });
}, 500);
