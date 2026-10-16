"use client";

import { useCallback, useEffect, useState } from "react";
import { Btn, Icon } from "@/components/ui";
import { useSocket } from "@/contexts/SocketContext";
import { fetchHealth } from "@/lib/api-client";

// Connection indicator (INTEGRATION-GUIDE I0, frontend/CLAUDE.md §6.3).
// Renders nothing while everything is reachable, so the v6 layout is unchanged;
// it never blocks the page, it only explains why data may be missing.

type Status = "ok" | "offline" | "server";

const RECHECK_MS = 15_000;

const TEXT: Record<Exclude<Status, "ok">, string> = {
  offline: "Tidak ada koneksi internet. Data terbaru belum dapat dimuat.",
  server: "Server Unstoppable belum dapat dihubungi. Kami mencoba lagi secara otomatis.",
};

export function ConnectionNotice({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status>("ok");
  const { socket, fallback } = useSocket();

  const check = useCallback(async (signal?: AbortSignal) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return setStatus("offline");
    try {
      const h = await fetchHealth(signal);
      setStatus(h.db === "ok" ? "ok" : "server");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setStatus(navigator.onLine ? "server" : "offline");
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check(ctrl.signal);
    const onOnline = () => void check();
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      ctrl.abort();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [check]);

  useEffect(() => {
    if (status === "ok") return;
    const t = setInterval(() => void check(), RECHECK_MS);
    return () => clearInterval(t);
  }, [status, check]);

  const text =
    status !== "ok" ? TEXT[status] : socket && fallback ? "Pembaruan langsung terputus. Kami mencoba menyambung kembali." : null;

  return (
    <div role="status" aria-live="polite" className={text ? `notice row ${className}` : "sr-only"}>
      {text ? (
        <>
          <Icon name="wifi-off" />
          <span className="fit">{text}</span>
          {status !== "ok" ? <Btn label="Coba lagi" action="connection-retry" kind="sm" onClick={() => void check()} /> : null}
        </>
      ) : null}
    </div>
  );
}
