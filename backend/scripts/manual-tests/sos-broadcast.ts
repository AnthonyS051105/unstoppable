import { io } from "socket.io-client";

// Ganti dengan userId (blind user) yang punya CaregiverRelationship di DB lokal
// dan caregiverId dari relasi itu.
const userId = process.argv[2] ?? "REPLACE_WITH_BLIND_USER_ID";
const caregiverId = process.argv[3] ?? "REPLACE_WITH_CAREGIVER_ID";
const apiBase = "http://localhost:4000";

const caregiver = io(apiBase);
caregiver.on("connect", () => {
  console.log("[caregiver] connected, subscribing");
  caregiver.emit("sos:subscribe", caregiverId);
});
caregiver.on("sos:triggered", (data) => {
  console.log("[caregiver] terima sos:triggered", data);
  process.exit(0);
});

setTimeout(async () => {
  console.log("[test] POST /api/sos/trigger");
  const res = await fetch(`${apiBase}/api/sos/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      triggerType: "manual",
      lat: -7.77,
      lng: 110.37,
    }),
  });
  console.log("[test] response", res.status, await res.json());
}, 500);

setTimeout(() => {
  console.error("[test] timeout — sos:triggered tidak diterima caregiver");
  process.exit(1);
}, 5000);
