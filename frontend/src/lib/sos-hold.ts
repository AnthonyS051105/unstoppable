let cancel: (() => void) | null = null;

export function registerActiveHold(fn: () => void) {
  cancel = fn;
}

export function clearActiveHold(fn: () => void) {
  if (cancel === fn) cancel = null;
}

export function cancelActiveHold() {
  const fn = cancel;
  cancel = null;
  fn?.();
}
