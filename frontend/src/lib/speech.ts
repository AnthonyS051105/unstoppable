let hooks = { before: () => {}, after: () => {} };

export function setSpeechHooks(h: { before: () => void; after: () => void }) {
  hooks = h;
}

export function speak(text: string, rate = 0.9): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  hooks.before();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "id-ID";
  u.rate = rate || 0.9;
  u.onend = () => hooks.after();
  u.onerror = () => hooks.after();
  speechSynthesis.speak(u);
  return true;
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
}
