// B14 (§15.3) -- pengingat rencana perjalanan, tiap menit. Query ada di
// trips.service.ts; notifikasi lewat notifyInbox (kotak notifikasi + socket;
// pengganti notify()/push B13 di luar cakupan). Semua idempoten lewat penanda
// reminded_at / late_notified_at / status.
import * as trips from "../modules/trips/trips.service.js";
import * as sessions from "../modules/sessions/sessions.service.js";
import { notifyInbox } from "../modules/notifications/notifications.service.js";

function timeLabel(d: Date): string {
  // Jam WIB ringkas untuk teks lansia, mis. "09.00".
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(":", ".");
}

export async function sendPlannedTripReminders(): Promise<void> {
  // 1. depart_at - 15 menit: ingatkan lansia menekan "Mulai".
  for (const t of await trips.dueReminders()) {
    await notifyInbox([t.userId], {
      type: "trip",
      event: "trip:reminder",
      title: "Waktunya bersiap berangkat",
      body: `Pukul ${timeLabel(t.departAt)} Anda akan ke ${t.destinationName}. Tekan Mulai saat berangkat.`,
      url: `/preview?trip=${t.id}`,
      payload: { tripId: t.id, destinationName: t.destinationName, departAt: t.departAt },
    });
  }

  // 2. depart_at + 30 menit, masih planned: beri tahu lansia & keluarga.
  for (const t of await trips.dueLateNotifications()) {
    const watchers = await sessions.statusWatchersOf(t.userId);
    await notifyInbox([t.userId], {
      type: "trip",
      event: "trip:not-started",
      title: "Jadi berangkat?",
      body: `Perjalanan ke ${t.destinationName} belum dimulai. Mulai sekarang atau batalkan.`,
      url: `/preview?trip=${t.id}`,
      payload: { tripId: t.id, destinationName: t.destinationName, departAt: t.departAt },
    });
    if (watchers.length) {
      await notifyInbox(watchers, {
        type: "trip",
        event: "trip:not-started",
        title: "Perjalanan belum dimulai",
        body: `Perjalanan ke ${t.destinationName} belum dimulai.`,
        url: "/monitor",
        payload: { tripId: t.id, destinationName: t.destinationName, departAt: t.departAt },
      });
    }
  }

  // 3. depart_at + 3 jam, masih planned -> missed (tanpa notifikasi lagi).
  const missed = await trips.markMissed();
  if (missed) console.log(`[sendPlannedTripReminders] ${missed} rencana ditandai missed.`);
}
