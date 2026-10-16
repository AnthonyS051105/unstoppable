"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Btn, Icon, LinkBtn } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { errorMessage } from "@/lib/api-client";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/push";

// Asks for notification permission only with a reason on screen (SDD §9, FE-GUIDE §3.4):
// after linking family, after scheduling a trip, and on /notification-settings. Never on app open.

export type PushContext = "family" | "trip" | "settings";

const REASON: Record<PushContext, string> = {
  family: "Izinkan pemberitahuan agar kami bisa menanyakan kabar Anda di perjalanan.",
  trip: "Izinkan pemberitahuan agar kami mengingatkan waktu berangkat.",
  settings: "Pemberitahuan dipakai untuk menanyakan kabar Anda di perjalanan dan mengingatkan waktu berangkat, juga saat aplikasi tertutup.",
};

const FALLBACK = "Anda tetap bisa melihat kabar di menu Notifikasi.";
const DENIED = `Pemberitahuan dimatikan di pengaturan browser. ${FALLBACK}`;
const UNSUPPORTED = `Browser ini belum bisa menerima pemberitahuan. ${FALLBACK}`;

const INSTALL_STEPS: [icon: string, text: string][] = [
  ["share", "Ketuk tombol Bagikan di bagian bawah Safari."],
  ["square-plus", "Pilih Tambahkan ke Layar Utama, lalu ketuk Tambah."],
  ["smartphone", "Buka Unstoppable dari ikon di Layar Utama, lalu izinkan pemberitahuan dari halaman ini."],
];
const INSTALL_INTRO = "Di iPhone, pemberitahuan hanya bisa diterima dari aplikasi yang dipasang di Layar Utama.";

const laterKey = (c: PushContext) => `unstoppable-push-later-v1:${c}`;

function readLater(c: PushContext) {
  try {
    return localStorage.getItem(laterKey(c)) === "1";
  } catch {
    return false;
  }
}

export function PushPermission({ context }: { context: PushContext }) {
  const { toast, announce, speak } = useApp();
  const settings = context === "settings";
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  /** Set once the user pressed a button here, so a refusal is explained even on contextual cards. */
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [later, setLater] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const check = useCallback(() => {
    pushStatus()
      .then(setStatus)
      .catch(() => setStatus("unsupported"));
  }, []);

  useEffect(() => {
    // Permission and subscription state only exist in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLater(!settings && readLater(context));
    check();
  }, [check, context, settings]);

  // The button that was pressed disappears with the new state; keep focus on the card.
  const focusResult = () => setTimeout(() => resultRef.current?.focus(), 30);

  const enable = async () => {
    setBusy(true);
    setError("");
    setAsked(true);
    try {
      const r = await enablePush();
      setStatus(r);
      const text =
        r === "granted" ? "Pemberitahuan aktif di perangkat ini." : r === "denied" ? DENIED : r === "unsupported" ? UNSUPPORTED : INSTALL_INTRO;
      if (r === "needs-install") setShowSteps(true);
      announce(text);
      if (r !== "granted") speak(text);
      focusResult();
    } catch (e) {
      setError(errorMessage(e));
      check();
      focusResult();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disablePush();
      toast("Pemberitahuan dimatikan di perangkat ini.");
      focusResult();
    } finally {
      setBusy(false);
      check();
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(laterKey(context), "1");
    } catch {}
    setLater(true);
    announce("Baik. Anda bisa mengaktifkannya nanti di Pengaturan Notifikasi.");
  };

  const readSteps = () => {
    setShowSteps(true);
    speak(`${INSTALL_INTRO} ${INSTALL_STEPS.map(([, t], i) => `Langkah ${i + 1}. ${t}`).join(" ")}`);
  };

  // Contextual cards stay out of the way unless there is something to ask or to explain.
  if (!settings) {
    if (later || status === "loading") return null;
    if (status === "granted" && !asked) return null;
    if ((status === "denied" || status === "unsupported") && !asked) return null;
  }

  return (
    <div className="notice stack" ref={resultRef} tabIndex={-1} data-push-permission={context} aria-busy={busy || status === "loading"}>
      {status === "loading" && <p>Memeriksa izin pemberitahuan…</p>}

      {status === "granted" && (
        <>
          <div className="row">
            <Badge label="Aktif" kind="green" icon="circle-check" />
          </div>
          <p>Pemberitahuan aktif di perangkat ini.</p>
          {settings && (
            <div className="row">
              <Btn label={busy ? "Mematikan…" : "Matikan di perangkat ini"} action="push-disable" disabled={busy} onClick={disable} />
            </div>
          )}
        </>
      )}

      {status === "default" && (
        <>
          <p>
            <Icon name="bell" /> {REASON[context]}
          </p>
          <div className="row">
            <Btn label={busy ? "Menunggu izin…" : "Izinkan pemberitahuan"} action="push-enable" kind="primary" disabled={busy} onClick={enable} />
            {!settings && <Btn label="Nanti" action="push-later" onClick={dismiss} />}
          </div>
        </>
      )}

      {status === "needs-install" && (
        <>
          <p>
            <Icon name="bell" /> {REASON[context]}
          </p>
          <p>{INSTALL_INTRO}</p>
          {showSteps && (
            <ol className="step-list" aria-label="Langkah memasang ke Layar Utama">
              {INSTALL_STEPS.map(([icon, text], n) => (
                <li key={icon}>
                  <span className="num">{n + 1}</span>
                  <Icon name={icon} />
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="row">
            <Btn label={showSteps ? "Bacakan langkah" : "Tunjukkan caranya"} action="push-install-steps" kind="primary" icon="volume-2" onClick={readSteps} />
            {!settings && <Btn label="Nanti" action="push-later" onClick={dismiss} />}
          </div>
        </>
      )}

      {(status === "denied" || status === "unsupported") && (
        <>
          <div className="row">
            <Badge label={status === "denied" ? "Dimatikan" : "Tidak tersedia"} icon="bell" />
          </div>
          <p>{status === "denied" ? DENIED : UNSUPPORTED}</p>
          <div className="row">
            <LinkBtn label="Buka Notifikasi" route="notifications" />
          </div>
        </>
      )}

      {error && (
        <div className="warning red" role="alert">
          <Icon name="triangle-alert" />
          <span>
            Pemberitahuan belum aktif. {error}{" "}
            <button type="button" className="btn" data-action="push-retry" onClick={enable} disabled={busy}>
              Coba lagi
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
