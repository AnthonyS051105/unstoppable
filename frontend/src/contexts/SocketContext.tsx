"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { refreshTokens, SOCKET_URL, tokens } from "@/lib/api-client";

// One socket.io connection per signed-in user (frontend/docs/SDD.md §2.4).
// The socket is never the only path (API_CONTRACT §15.4): every consumer must
// keep a REST fallback and switch to polling while `fallback` is true.

type Ctx = {
  socket: Socket | null;
  isConnected: boolean;
  /** True once the socket has been down for more than 10 s while signed in → use REST polling. */
  fallback: boolean;
  /** Listens to a server event; returns the unsubscribe function. */
  subscribe: <T>(event: string, handler: (payload: T) => void) => () => void;
};

const SocketContext = createContext<Ctx | null>(null);
const FALLBACK_AFTER_MS = 10_000;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(tokens.access);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setConnected] = useState(false);
  const [fallback, setFallback] = useState(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => tokens.subscribe(setToken), []);
  const signedIn = !!token;

  useEffect(() => {
    if (!signedIn) return;
    // `auth` as a callback so every (re)connect sends the current access token.
    const s = io(SOCKET_URL, { auth: (cb) => cb({ token: tokens.access() }), transports: ["websocket", "polling"] });
    const armFallback = () => {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = setTimeout(() => setFallback(true), FALLBACK_AFTER_MS);
    };
    s.on("connect", () => {
      clearTimeout(fallbackTimer.current);
      setConnected(true);
      setFallback(false);
    });
    s.on("disconnect", () => {
      setConnected(false);
      armFallback();
    });
    s.on("connect_error", async (err) => {
      setConnected(false);
      armFallback();
      // Handshake rejected (expired access token): refresh once, then let socket.io retry.
      if (err.message === "UNAUTHENTICATED" && (await refreshTokens())) s.connect();
    });
    armFallback();
    setSocket(s);
    return () => {
      clearTimeout(fallbackTimer.current);
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setFallback(false);
    };
  }, [signedIn]);

  const subscribe = useCallback(
    <T,>(event: string, handler: (payload: T) => void) => {
      if (!socket) return () => {};
      socket.on(event, handler);
      return () => void socket.off(event, handler);
    },
    [socket],
  );

  const value = useMemo(() => ({ socket, isConnected, fallback, subscribe }), [socket, isConnected, fallback, subscribe]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside SocketProvider");
  return ctx;
}
