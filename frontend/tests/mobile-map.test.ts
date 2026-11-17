import { test } from "node:test";
import assert from "node:assert/strict";
import { routeLabelPosition } from "../src/lib/route-label-layout";
import { createPositionStore } from "../src/lib/user-position";

test("route label fits visible map and leaves a gap around a diagonal route", () => {
  const position = routeLabelPosition([[{ x: 30, y: 30 }, { x: 280, y: 240 }]], { left: 12, top: 12, right: 290, bottom: 280 });
  assert.ok(position);
  assert.ok(position.x >= 12 && position.x + 132 <= 290);
  assert.ok(position.y >= 12 && position.y + 58 <= 280);
  // Sample the full route, including the segment between its two vertices.
  for (let i = 0; i <= 100; i++) {
    const p = { x: 30 + 250 * i / 100, y: 30 + 210 * i / 100 };
    assert.ok(p.x < position.x - 14 || p.x > position.x + 146 || p.y < position.y - 14 || p.y > position.y + 72);
  }
});

test("label hides when no free space exists and checks every disconnected route segment", () => {
  assert.equal(routeLabelPosition([[{ x: 30, y: 30 }]], { left: 0, top: 0, right: 80, bottom: 40 }), null);
  const lines = Array.from({ length: 20 }, (_, i) => [{ x: 0, y: i * 10 }, { x: 300, y: i * 10 }]);
  assert.equal(routeLabelPosition(lines, { left: 0, top: 0, right: 300, bottom: 200 }), null);
});

test("GPS shares one watcher, publishes subsequent movement, retries and cleans up", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let success: PositionCallback = () => {};
  let failure: PositionErrorCallback = () => {};
  let resume = () => {};
  let started = 0;
  const cleared: number[] = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: {
    watchPosition(ok: PositionCallback, fail: PositionErrorCallback, options: PositionOptions) {
      success = ok; failure = fail; assert.equal(options.enableHighAccuracy, true); return ++started;
    }, clearWatch(id: number) { cleared.push(id); },
  } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible",
    addEventListener(_event: string, cb: () => void) { resume = cb; }, removeEventListener() {},
  } });
  try {
    const store = createPositionStore();
    const offA = store.subscribe(() => {});
    const offB = store.subscribe(() => {});
    assert.equal(started, 1);
    success({ coords: { longitude: 110, latitude: -7 } } as GeolocationPosition);
    assert.deepEqual(store.getSnapshot().coord, [110, -7]);
    success({ coords: { longitude: 111, latitude: -8 } } as GeolocationPosition);
    assert.deepEqual(store.getSnapshot().coord, [111, -8]);
    failure({ code: 1 } as GeolocationPositionError);
    assert.equal(store.getSnapshot().status, "denied");
    const stale = success;
    store.retry();
    assert.equal(started, 2);
    stale({ coords: { longitude: 99, latitude: 99 } } as GeolocationPosition);
    assert.deepEqual(store.getSnapshot().coord, [111, -8]);
    resume(); assert.equal(started, 3);
    offA(); assert.deepEqual(cleared, [1, 2]);
    offB(); assert.deepEqual(cleared, [1, 2, 3]);
    assert.equal(store.getSnapshot().coord, null);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
