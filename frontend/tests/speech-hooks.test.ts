import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { cancelSpeech, setSpeechHooks, speak } from "../src/lib/speech";

type FakeUtterance = {
  text: string;
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const origWindow = (globalThis as Record<string, unknown>).window;
const origSynth = (globalThis as Record<string, unknown>).speechSynthesis;
const origUtterance = (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;

let utterances: FakeUtterance[] = [];
let cancelCount = 0;

beforeEach(() => {
  utterances = [];
  cancelCount = 0;
  const synth = {
    cancel: () => {
      cancelCount++;
    },
    speak: (u: FakeUtterance) => {
      utterances.push(u);
    },
  };
  (globalThis as Record<string, unknown>).window = { speechSynthesis: synth };
  (globalThis as Record<string, unknown>).speechSynthesis = synth;
  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = class {
    text: string;
    lang = "";
    rate = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  };
});

afterEach(() => {
  cancelSpeech();
  setSpeechHooks({ before: () => {}, after: () => {} });
  if (origWindow === undefined) delete (globalThis as Record<string, unknown>).window;
  else (globalThis as Record<string, unknown>).window = origWindow;
  if (origSynth === undefined) delete (globalThis as Record<string, unknown>).speechSynthesis;
  else (globalThis as Record<string, unknown>).speechSynthesis = origSynth;
  if (origUtterance === undefined) delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
  else (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = origUtterance;
});

test("stale onerror from superseded utterance does not re-enable recognition during active TTS", () => {
  let activeTts = false;
  let afterCalls = 0;
  setSpeechHooks({
    before: () => {
      activeTts = true;
    },
    after: () => {
      activeTts = false;
      afterCalls++;
    },
  });

  assert.equal(speak("Kalimat pertama"), true);
  assert.equal(activeTts, true);
  const first = utterances[0];

  assert.equal(speak("Kalimat kedua"), true);
  assert.equal(activeTts, true);
  const second = utterances[1];

  // Cancelled first utterance fires its delayed error callback while second is still speaking.
  first.onerror?.();
  assert.equal(activeTts, true);
  assert.equal(afterCalls, 0);

  // Only the active second utterance restores recognition once finished.
  second.onend?.();
  assert.equal(activeTts, false);
  assert.equal(afterCalls, 1);

  // Duplicate callback on the same utterance is ignored.
  second.onend?.();
  assert.equal(afterCalls, 1);
});

test("cancelSpeech resets active TTS hook once and ignores late utterance callbacks", () => {
  let beforeCalls = 0;
  let afterCalls = 0;
  setSpeechHooks({
    before: () => {
      beforeCalls++;
    },
    after: () => {
      afterCalls++;
    },
  });

  assert.equal(speak("Panduan belok kiri"), true);
  const u = utterances[0];
  cancelSpeech();

  assert.equal(beforeCalls, 1);
  assert.equal(afterCalls, 1);
  assert.ok(cancelCount >= 2);

  // Late browser onerror/onend after cancel must not call after() a second time.
  u.onerror?.();
  u.onend?.();
  assert.equal(afterCalls, 1);

  // Calling cancelSpeech when idle does not trigger after().
  cancelSpeech();
  assert.equal(afterCalls, 1);
});
