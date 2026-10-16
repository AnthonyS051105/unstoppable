// ws-actor.mjs — klien Socket.io untuk uji manual event WebSocket UNSTOPPABLE.
// Satu terminal = satu aktor (budi, caregiver, rina, rina2, admin).
//
// Jalankan dari folder backend (supaya socket.io-client ter-resolve dari node_modules):
//   TOKEN=<accessToken> LABEL=caregiver node scripts/manual-tests/ws-actor.mjs
//   (opsional) SOCKET_URL=http://localhost:4000
//
// Perintah di terminal (ketik lalu Enter):
//   emit <event> <json>      contoh: emit session:join "SESSION_ID"
//   emit <event>             contoh: emit sos:subscribe
//   quit
//
// Semua event masuk/keluar dicetak dengan timestamp milidetik.
// Token TIDAK pernah dicetak, aman untuk screenshot.
import { io } from "socket.io-client";
import readline from "node:readline";

const URL = process.env.SOCKET_URL ?? "http://localhost:4000";
const LABEL = process.env.LABEL ?? "actor";
const TOKEN = process.env.TOKEN; // kosong = sengaja uji handshake tanpa token

const ts = () => new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
const log = (tag, ...a) => console.log(`${ts()} [${LABEL}] ${tag}`, ...a);
const pretty = (v) => JSON.stringify(v, null, 2);

const socket = io(URL, {
  auth: TOKEN ? { token: TOKEN } : {},
  transports: ["websocket"],
  reconnection: false,
});

socket.on("connect", () => log("CONNECTED", `socketId=${socket.id}`));
socket.on("connect_error", (e) => log("CONNECT_ERROR", e.message));
socket.on("disconnect", (r) => log("DISCONNECTED", r));

// Tangkap SEMUA event dari server (server -> client).
socket.onAny((event, ...args) => log(`<= ${event}`, args.map(pretty).join(" ")));

// Catat juga event yang kita kirim (client -> server).
socket.onAnyOutgoing((event, ...args) => log(`=> ${event}`, args.map(pretty).join(" ")));

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const t = line.trim();
  if (t === "quit") {
    socket.close();
    process.exit(0);
  }
  const m = t.match(/^emit\s+(\S+)\s*(.*)$/);
  if (!m) return log("USAGE", "emit <event> <json>  |  quit");

  const [, event, raw] = m;
  let payload;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  const ack = (res) => log(`ACK ${event}`, pretty(res));
  if (payload === undefined) socket.emit(event, ack);
  else socket.emit(event, payload, ack);
});
