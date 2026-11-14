"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { clearActiveHold, registerActiveHold } from "@/lib/sos-hold";
import { cancelSpeech } from "@/lib/speech";
import { sosApi } from "@/lib/api/sos";
import { errorMessage } from "@/lib/api-client";
import { getCurrentGpsLocation, getActiveSessionId, sosStore } from "@/lib/sos-state";

function useSosHold() {
  const { update, stateRef, go, announce, speak } = useApp();
  const [holding, setHolding] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelRef = useRef<() => void>(() => {});

  const cancel = () => {
    const wasHolding = timers.current.length > 0;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (wasHolding && stateRef.current.voice) cancelSpeech();
    setHolding(false);
    clearActiveHold(cancelRef.current);
  };
  useLayoutEffect(() => {
    cancelRef.current = cancel;
  });

  const start = () => {
    if (timers.current.length) return;
    const voice = stateRef.current.voice;
    setHolding(true);
    registerActiveHold(cancelRef.current);
    announce("Tahan tombol selama satu setengah detik untuk pemicu SOS darurat.");
    navigator.vibrate?.(35);
    if (voice) speak("3");
    timers.current = [
      setTimeout(() => {
        announce("2");
        if (voice) speak("2");
      }, 500),
      setTimeout(() => {
        announce("1");
        if (voice) speak("1");
      }, 1000),
      setTimeout(async () => {
        timers.current = [];
        setHolding(false);
        clearActiveHold(cancelRef.current);
        const none = stateRef.current.noResponder;
        const coords = await getCurrentGpsLocation();
        const sessionId = getActiveSessionId();

        if (none) {
          sosStore.set({
            sosId: "",
            status: "active",
            notifiedVolunteers: 0,
            notifiedCaregivers: 0,
            responders: [],
          });
          update({ sosActive: false });
          go("sos-empty");
          announce("Belum ada relawan yang bisa dihubungi di sekitar Anda.");
          navigator.vibrate?.([80, 70, 80]);
          return;
        }

        try {
          announce("Menghubungi relawan terdekat...");
          const res = await sosApi.trigger({
            triggerType: "manual_button",
            location: {
              type: "Point",
              coordinates: coords,
            },
            sessionId,
          });

          if (res.notifiedVolunteers > 0) {
            sosStore.set({
              sosId: res.sosId,
              status: res.status,
              notifiedVolunteers: res.notifiedVolunteers,
              notifiedCaregivers: res.notifiedCaregivers,
              responders: [],
              createdAt: new Date().toISOString(),
            });
            update({ sosActive: true });
            go("sos-active");
            announce("SOS aktif. Bantuan relawan terdekat diminta.");
            if (voice) speak("SOS aktif. Bantuan diminta.");
            navigator.vibrate?.([80, 70, 80]);
          } else {
            sosStore.set({
              sosId: res.sosId,
              status: res.status,
              notifiedVolunteers: 0,
              notifiedCaregivers: res.notifiedCaregivers,
              responders: [],
              createdAt: new Date().toISOString(),
            });
            update({ sosActive: false });
            go("sos-empty");
            announce("Belum ada relawan yang bisa dihubungi di sekitar Anda.");
            navigator.vibrate?.([80, 70, 80]);
          }
        } catch (error) {
          sosStore.set({
            sosId: "",
            status: "active",
            notifiedVolunteers: 0,
            notifiedCaregivers: 0,
            responders: [],
            error: errorMessage(error),
          });
          update({ sosActive: false });
          go("sos-empty");
          announce("Gagal terhubung ke jaringan relawan. Menampilkan nomor darurat.");
          navigator.vibrate?.([80, 70, 80]);
        }
      }, 1500),
    ];
  };

  useEffect(() => {
    const onHidden = () => document.hidden && cancelRef.current();
    const onBlur = () => cancelRef.current();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const props = {
    "data-sos-hold": "",
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.focus();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      start();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) start();
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        cancel();
      }
    },
    onBlur: cancel,
  };
  return { holding, props };
}

export function SosFab() {
  const { holding, props } = useSosHold();
  return (
    <button
      type="button"
      className={`btn danger fixed-sos${holding ? " holding" : ""}`}
      aria-label="Tahan 1,5 detik untuk SOS simulasi"
      style={{ overflow: "hidden" }}
      {...props}
    >
      <span className="hold-fill"></span>
      <Icon name="phone" />
      <span>SOS</span>
    </button>
  );
}

export function SosHoldButton() {
  const { holding, props } = useSosHold();
  return (
    <button
      type="button"
      className={`btn danger full${holding ? " holding" : ""}`}
      style={{ position: "relative", overflow: "hidden", minHeight: 65 }}
      {...props}
    >
      <span className="hold-fill"></span>
      <Icon name="phone" />
      <span>Tahan untuk SOS</span>
    </button>
  );
}
