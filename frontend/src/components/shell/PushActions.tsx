"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/hooks/useApp";
import { errorMessage } from "@/lib/api-client";
import { onNotificationAction, resumePush } from "@/lib/push";
import type { WellbeingStatus } from "@/types/api";

// Runs notification actions inside the signed-in app (docs/FE-GUIDE-F1-F4.md §3.2): the service
// worker only opens /trip?wellbeing=<answer>&session=<id> or posts that URL to an open window.
// The token never leaves the app. ?trip= / ?cancelTrip= belong to planned trips (F3).

const ANSWERS: readonly WellbeingStatus[] = ["arrived", "ok", "help"];

function wellbeingFrom(url: URL): { session: string; answer: WellbeingStatus } | null {
  const answer = url.searchParams.get("wellbeing") as WellbeingStatus | null;
  const session = url.searchParams.get("session");
  return answer && session && ANSWERS.includes(answer) ? { session, answer } : null;
}

export function PushActions() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status } = useAuth();
  const { answerWellbeing } = useActiveSession();
  const { go, toast, speak, modal } = useApp();
  const [alert, setAlert] = useState("");
  const done = useRef(new Set<string>());
  const pending = useRef<string | null>(null);
  const retry = useRef<(session: string, answer: WellbeingStatus) => void>(() => {});

  const urgent = useCallback((text: string) => {
    setAlert("");
    setTimeout(() => setAlert(text), 20);
  }, []);

  const run = useCallback(
    async (session: string, answer: WellbeingStatus) => {
      const key = `${session}:${answer}`;
      if (done.current.has(key)) return;
      done.current.add(key);
      if (answer === "help") {
        // Same path as the SOS button: show the SOS screen at once, then confirm what the server did.
        go("sos-active");
        urgent("Mengirim permintaan bantuan…");
      }
      try {
        await answerWellbeing(session, answer);
        if (answer === "ok") {
          const text = "Terima kasih. Kami akan menanyakan kabar Anda lagi dalam 15 menit.";
          toast(text);
          speak(text);
          router.replace("/trip");
        } else if (answer === "help") {
          const text = "Permintaan bantuan terkirim ke keluarga dan relawan terdekat.";
          urgent(text);
          speak(text);
        }
      } catch (e) {
        done.current.delete(key);
        if (answer !== "help") {
          toast(`${errorMessage(e)} ${answer === "arrived" ? "Akhiri perjalanan lewat tombol di Beranda." : ""}`.trim());
          router.replace(answer === "arrived" ? "/home" : "/trip");
          return;
        }
        // An SOS must never fail silently (CLAUDE.md §5.4): say so, and give another way.
        const text = `Permintaan bantuan belum terkirim. ${errorMessage(e)}`;
        urgent(text);
        speak(text);
        modal({
          title: "Permintaan bantuan belum terkirim",
          body: (
            <p>
              {errorMessage(e)} Coba kirim lagi, tekan dan tahan tombol SOS, atau telepon anggota keluarga Anda langsung.
            </p>
          ),
          confirmLabel: "Coba kirim lagi",
          cancelLabel: "Tutup",
          danger: true,
          focusConfirm: true,
          onConfirm: () => retry.current(session, answer),
        });
      }
    },
    [answerWellbeing, go, urgent, toast, speak, router, modal],
  );

  useEffect(() => {
    retry.current = (session, answer) => void run(session, answer);
  }, [run]);

  // A tap that opened this window: the action is in the URL. Wait for the session to be restored.
  useEffect(() => {
    if (status !== "authenticated") return;
    const url = new URL(window.location.href);
    const w = wellbeingFrom(url);
    if (!w) return;
    // Drop the query so a reload never answers twice.
    window.history.replaceState(null, "", url.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the action arrives in the URL, readable only after hydration
    void run(w.session, w.answer);
  }, [status, pathname, run]);

  // A tap while the app was already open: public/sw.js posts the URL instead of opening a window.
  useEffect(
    () =>
      onNotificationAction((target) => {
        const url = new URL(target, window.location.origin);
        const w = wellbeingFrom(url);
        if (!w) {
          router.push(target);
          return;
        }
        if (status === "authenticated") void run(w.session, w.answer);
        else pending.current = target;
      }),
    [router, run, status],
  );

  useEffect(() => {
    if (status === "authenticated" && pending.current) {
      const url = new URL(pending.current, window.location.origin);
      pending.current = null;
      const w = wellbeingFrom(url);
      if (w) void run(w.session, w.answer);
    }
  }, [status, run]);

  // Logout removes this device's subscription; signing in again where notifications were already
  // allowed stores it again without asking.
  useEffect(() => {
    if (status === "authenticated" && user) resumePush().catch(() => {});
  }, [status, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
      {alert}
    </div>
  );
}
