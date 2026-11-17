let hooks = { before: () => {}, after: () => {} };
let activeToken = 0;
let speaking = false;

export function setSpeechHooks(h: { before: () => void; after: () => void }) {
  hooks = h;
}

export function speak(text: string, rate = 0.9): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const token = ++activeToken;
  speaking = true;
  hooks.before();
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "id-ID";
    u.rate = rate || 0.9;
    const finish = () => {
      if (token !== activeToken || !speaking) return;
      speaking = false;
      hooks.after();
    };
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
    return true;
  } catch {
    if (token === activeToken && speaking) {
      speaking = false;
      hooks.after();
    }
    return false;
  }
}

export function cancelSpeech() {
  activeToken++;
  const wasSpeaking = speaking;
  speaking = false;
  if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
  if (wasSpeaking) hooks.after();
}
