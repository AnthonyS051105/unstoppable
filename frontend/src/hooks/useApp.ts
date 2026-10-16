"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useDemo } from "@/contexts/DemoStateContext";
import { useUi } from "@/contexts/UiContext";
import { href } from "@/lib/access";
import { STEPS } from "@/lib/data";
import { routeStats, wibNow } from "@/lib/demo-state";
import type { LocationValue } from "@/lib/geocode";
import { externalPlaceHref, placeBlocked, placeByName, placeHref } from "@/lib/places";
import { speak as speakRaw } from "@/lib/speech";
import { cancelPlan, live, loadBuildings, planRoute, useLive } from "@/lib/live";
import { errorMessage } from "@/lib/api-client";

let loadingTimer: ReturnType<typeof setTimeout> | undefined;
let buildingsRequested = false;

export const currentRoute = () => (typeof window === "undefined" ? "" : window.location.pathname.replace(/^\//, "") || "landing");

export function useApp() {
  const demo = useDemo();
  const ui = useUi();
  const router = useRouter();
  const { update, stateRef } = demo;
  const { toast, announce } = ui;
  const liveVersion = useLive();
  useEffect(() => {
    if (buildingsRequested) return;
    buildingsRequested = true;
    void loadBuildings();
  }, []);

  const go = useCallback((route: string) => router.push(href(route)), [router]);

  const speak = useCallback(
    (text: string) => {
      if (!speakRaw(text, stateRef.current.voiceRate)) toast("Suara belum tersedia di browser ini. Teks instruksi tetap dapat dibaca.");
    },
    [stateRef, toast],
  );

  const calculateRoute = useCallback((dest?: string) => {
    clearTimeout(loadingTimer);
    go("loading");
    const { profiles } = stateRef.current;
    const target = placeByName(dest ?? stateRef.current.destination);
    if (live.buildings && target?.coord) {
      if (!profiles[0]) {
        toast("Pilih kondisi Anda terlebih dahulu agar rute sesuai.");
        go("profile");
        return;
      }
      void planRoute(target, profiles[0])
        .then((r) => {
          if (r !== "stale" && currentRoute() === "loading") go(r === "ok" ? "preview" : "unreachable");
        })
        .catch((e) => {
          if (currentRoute() !== "loading") return;
          toast(errorMessage(e));
          go("home");
        });
      return;
    }
    loadingTimer = setTimeout(() => {
      if (currentRoute() === "loading") {
        const { destination, profiles } = stateRef.current;
        const place = placeByName(destination);
        go(place && placeBlocked(place, profiles) ? "unreachable" : "preview");
      }
    }, 950);
  }, [go, stateRef, toast]);

  const cancelLoading = useCallback(() => {
    clearTimeout(loadingTimer);
    cancelPlan();
  }, []);

  const pickDestination = useCallback(
    (d: string) => {
      update((s) => ({ destination: d, recent: [d, ...s.recent.filter((x) => x !== d)].slice(0, 5) }));
      calculateRoute(d);
    },
    [update, calculateRoute],
  );

  const openPlace = useCallback(
    (name: string) => {
      const p = placeByName(name);
      if (p) router.push(placeHref(p));
      else pickDestination(name);
    },
    [router, pickDestination],
  );

  const openLocation = useCallback(
    (l: LocationValue) => {
      const p = placeByName(l.name);
      router.push(p ? placeHref(p) : externalPlaceHref(l));
    },
    [router],
  );

  const addFamilyEvent = useCallback(
    (label: string) => update((s) => ({ familyEvents: [{ label, time: wibNow() }, ...s.familyEvents] })),
    [update],
  );

  const finishTrip = useCallback(() => {
    const s = stateRef.current;
    update({
      activeTrip: false,
      familyEvents: [{ label: "Sampai di " + s.destination, time: wibNow() }, ...s.familyEvents],
      history: [{ destination: s.destination, duration: routeStats(s).time, date: new Date().toLocaleString("id-ID") }, ...s.history],
    });
    go("arrived");
    announce("Anda telah tiba. Perjalanan selesai.");
  }, [stateRef, update, go, announce]);

  const startTrip = useCallback(() => {
    const s = stateRef.current;
    update({
      step: 0,
      paused: false,
      activeTrip: true,
      familyEvents: [{ label: "Berangkat menuju " + s.destination, time: wibNow() }, ...s.familyEvents],
    });
    go("trip");
    if (s.voice) speak(STEPS[0][0]);
  }, [stateRef, update, go, speak]);

  return useMemo(
    () => ({
      ...demo,
      ...ui,
      go,
      speak,
      calculateRoute,
      cancelLoading,
      pickDestination,
      openPlace,
      openLocation,
      addFamilyEvent,
      finishTrip,
      startTrip,
      liveVersion,
    }),
    [liveVersion, demo, ui, go, speak, calculateRoute, cancelLoading, pickDestination, openPlace, openLocation, addFamilyEvent, finishTrip, startTrip],
  );
}
