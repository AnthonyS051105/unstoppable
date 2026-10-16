"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useSocket } from "@/contexts/SocketContext";

/**
 * Listens to one server event while the component is mounted. The latest handler is always
 * called, so callers can pass inline functions without re-subscribing on every render.
 * Never the only path (API_CONTRACT §15.4): pair every event with a REST reload.
 */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { subscribe } = useSocket();
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribe<T>(event, (payload) => ref.current(payload)), [subscribe, event]);
}
