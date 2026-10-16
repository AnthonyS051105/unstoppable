// Push only (ARCHITECTURE AD-10, frontend/docs/SDD.md §9). No fetch handler and no caches:
// offline support is out of scope.
//
// This worker never calls the API and never sees a token. An action button only opens or
// focuses the app with the action in the URL (or a postMessage to an open window); the
// signed-in app then makes the call (docs/FE-GUIDE-F1-F4.md §3.2).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let n;
  try {
    n = event.data ? event.data.json() : null;
  } catch {
    n = { body: event.data ? event.data.text() : "" };
  }
  n = n || {};
  const actions = fitActions(Array.isArray(n.actions) ? n.actions : []);
  event.waitUntil(
    self.registration.showNotification(n.title || "Unstoppable", {
      body: n.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "id",
      actions,
      data: { ...(n.data || {}), url: n.url || "/home" },
      // Questions with buttons stay until answered.
      requireInteraction: actions.length > 0,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openOrFocus(targetUrl(event.action, event.notification.data || {})));
});

// Chrome shows at most Notification.maxActions buttons (2) and drops the rest. The wellbeing
// check sends three; "Butuh bantuan" must never be the one that disappears.
function fitActions(actions) {
  const max = (self.Notification && self.Notification.maxActions) || actions.length;
  if (actions.length <= max) return actions;
  const keep = new Set([...actions.filter((a) => a.action === "help"), ...actions].slice(0, max));
  return actions.filter((a) => keep.has(a));
}

function targetUrl(action, data) {
  const id = (v) => encodeURIComponent(String(v));
  if (["arrived", "ok", "help"].includes(action) && data.sessionId) return `/trip?wellbeing=${action}&session=${id(data.sessionId)}`;
  if (action === "start" && data.plannedTripId) return `/preview?trip=${id(data.plannedTripId)}`;
  if (action === "cancel" && data.plannedTripId) return `/home?cancelTrip=${id(data.plannedTripId)}`;
  // Only same-origin paths: a payload can never send the user to another site.
  return typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/home";
}

async function openOrFocus(target) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
  if (win) {
    // Focus can be refused; the action must still reach the app.
    await win.focus().catch(() => {});
    win.postMessage({ type: "notification-action", url: target });
    return;
  }
  await self.clients.openWindow(target);
}
