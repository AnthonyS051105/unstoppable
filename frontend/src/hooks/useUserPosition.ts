"use client";

import { useSyncExternalStore } from "react";
import { createPositionStore, initialPosition } from "@/lib/user-position";

const position = createPositionStore();
const serverSnapshot = () => initialPosition;
const inactiveSubscribe = () => () => {};
export type UserPosition = ReturnType<typeof useUserPosition>;

export function useUserPosition(enabled = true) {
  const snapshot = useSyncExternalStore(enabled ? position.subscribe : inactiveSubscribe, position.getSnapshot, serverSnapshot);
  return { ...snapshot, retry: position.retry };
}
