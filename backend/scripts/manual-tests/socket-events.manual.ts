import { io } from "socket.io-client";

const sessionId = "test-session-123";

// simulasi caregiver: join room sesi, dengarkan event
const caregiver = io("http://localhost:4000");
caregiver.on("connect", () => {
  console.log("[caregiver] connected");
  caregiver.emit("session:join", sessionId);
});
caregiver.on("location:updated", (data) => console.log("[caregiver] terima location:updated", data));
caregiver.on("session:ended", (data) => console.log("[caregiver] terima session:ended", data));

// simulasi blind user: join room sama, kirim lokasi, lalu tutup sesi
setTimeout(() => {
  const blindUser = io("http://localhost:4000");
  blindUser.on("connect", () => {
    console.log("[blindUser] connected");
    blindUser.emit("session:join", sessionId);

    setTimeout(() => {
      blindUser.emit("location:update", { sessionId, lat: -7.77, lng: 110.37 });
    }, 500);

    setTimeout(() => {
      blindUser.emit("session:end", sessionId);
    }, 1000);

    setTimeout(() => process.exit(0), 2000);
  });
}, 500);
