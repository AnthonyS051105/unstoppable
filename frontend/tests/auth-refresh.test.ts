import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { refreshTokens, setSessionExpiredHandler, tokens } from "../src/lib/api-client";

// [DEV] synthetic tokens and injected fetch/storage only; no DB or real account.
const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const storage = new Map<string, string>();
const requests: ((response: Response) => void)[] = [];
let expired = 0;
const pair = (name: string) => ({ accessToken: `[DEV] ${name}-access`, refreshToken: `[DEV] ${name}-refresh` });
const success = (name: string) => new Response(JSON.stringify({ success: true, data: pair(name) }), { status: 200 });
const rejected = () => new Response(JSON.stringify({ success: false, error: { code: "UNAUTHENTICATED", message: "Sesi berakhir." } }), { status: 401 });

beforeEach(() => {
  storage.clear(); requests.length = 0; expired = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  globalThis.fetch = async () => new Promise<Response>(resolve => requests.push(resolve));
  setSessionExpiredHandler(() => expired++);
  tokens.clear();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  setSessionExpiredHandler(null);
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
});

test("successful refresh cannot restore a session after logout", async () => {
  tokens.set(pair("A"));
  const pending = refreshTokens();
  tokens.clear();
  requests[0]!(success("A-rotated"));
  assert.equal(await pending, false);
  assert.equal(tokens.access(), null);
  assert.equal(tokens.refresh(), null);
});

test("rejected refresh from a signed-out session does not announce a new expiry", async () => {
  tokens.set(pair("A"));
  const pending = refreshTokens();
  tokens.clear();
  requests[0]!(rejected());
  assert.equal(await pending, false);
  assert.equal(expired, 0);
});

for (const outcome of ["success", "rejected"] as const) {
  test(`old ${outcome} refresh cannot replace or clear account B`, async () => {
    tokens.set(pair("A"));
    const pending = refreshTokens();
    tokens.set(pair("B"));
    requests[0]!(outcome === "success" ? success("A-rotated") : rejected());
    await pending;
    assert.equal(tokens.access(), pair("B").accessToken);
    assert.equal(tokens.refresh(), pair("B").refreshToken);
    assert.equal(expired, 0);
  });
}

test("concurrent refreshes in the same session share one request", async () => {
  tokens.set(pair("A"));
  const first = refreshTokens();
  const second = refreshTokens();
  assert.equal(first, second);
  assert.equal(requests.length, 1);
  requests[0]!(success("A-rotated"));
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(tokens.refresh(), pair("A-rotated").refreshToken);
});

test("account B gets its own mutex and old completion cannot release it", async () => {
  tokens.set(pair("A"));
  const old = refreshTokens();
  tokens.set(pair("B"));
  const current = refreshTokens();
  const independent = current !== old && requests.length === 2;
  requests[0]!(success("A-rotated"));
  await old;
  if (independent) {
    assert.equal(refreshTokens(), current);
    requests[1]!(success("B-rotated"));
    assert.equal(await current, true);
  }
  assert.equal(independent, true, "B must not join A's in-flight refresh");
  assert.equal(tokens.access(), pair("B-rotated").accessToken);
});

test("a refresh queued behind a Web Lock is cancelled when session changes", async () => {
  let release!: () => void;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: {
    request: (_key: string, run: () => Promise<boolean>) => new Promise<boolean>(resolve => { release = () => { void run().then(resolve); }; }),
  } } });
  tokens.set(pair("A"));
  const pending = refreshTokens();
  tokens.set(pair("B"));
  release();
  // Drain even the faulty implementation so the suite cannot hang.
  if (requests.length) requests[0]!(success("unexpected"));
  await pending;
  assert.equal(requests.length, 0, "queued A refresh must not submit B's refresh token");
  assert.equal(tokens.access(), pair("B").accessToken);
});

test("a current rejected refresh clears the session and announces expiry once", async () => {
  tokens.set(pair("A"));
  const pending = refreshTokens();
  requests[0]!(rejected());
  assert.equal(await pending, false);
  assert.equal(tokens.access(), null);
  assert.equal(tokens.refresh(), null);
  assert.equal(expired, 1);
});

for (const outcome of ["success", "rejected"] as const) {
  test(`a cross-tab storage change ignores old ${outcome} refresh`, async () => {
    tokens.set(pair("A"));
    const pending = refreshTokens();
    // Another tab can change storage without this module's generation changing.
    storage.set("unstoppable-refresh-v1", pair("B").refreshToken);
    requests[0]!(outcome === "success" ? success("A-rotated") : rejected());
    assert.equal(await pending, false);
    assert.equal(tokens.refresh(), pair("B").refreshToken);
    assert.equal(expired, 0);
  });
}

test("temporary server failure preserves the current session for retry", async () => {
  tokens.set(pair("A"));
  const pending = refreshTokens();
  requests[0]!(new Response(JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: "[DEV] Coba lagi." } }), { status: 503 }));
  assert.equal(await pending, false);
  assert.equal(tokens.refresh(), pair("A").refreshToken);
  assert.equal(expired, 0);
});
