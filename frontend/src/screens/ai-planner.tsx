"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heading } from "@/components/shared";
import { Badge, Btn, Icon, LinkBtn } from "@/components/ui";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useApp } from "@/hooks/useApp";
import { errorMessage } from "@/lib/api-client";
import { aiPlannerApi } from "@/lib/api/ai-planner";
import { companionsApi } from "@/lib/api/companions";
import { transitDemoApi } from "@/lib/api/transit-demo";
import {
  applyWalkBlocked,
  applyWalkPreview,
  live,
  loadBuildings,
  planRoute,
  setRouteOrigin,
  useLive,
} from "@/lib/live";
import { allPlaces, placeByName, placeHref, retainFacility, type Place } from "@/lib/places";
import {
  assistanceInviteHref,
  buildAssistancePrefill,
  buildCompanionHandoffNote,
  buildMultimodalSpeechSummary,
  buildPlanAssessment,
  buildWibDepartureIso,
  formatCurrencyIdr,
  formatWibHHMMFromIso,
  shouldDefaultDemoTransit,
  shouldUseManualFallback,
  type PlanRouteStatus,
} from "@/lib/planner-recommendations";
import { cancelSpeech, speak as speakRaw } from "@/lib/speech";
import type {
  AiPlannerExtraction,
  AiPlannerInputMode,
  AiPlannerMessage,
  AvailableVolunteer,
  GeoPoint,
  MultimodalLeg,
  MultimodalOption,
  MultimodalRecommendationResponse,
  UserPlacePreference,
} from "@/types/api";

interface SpeechRecognitionEventLike {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal?: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SelectedDestinationPlan {
  destinationName: string;
  destinationLocation: GeoPoint;
  matchSource: "preference" | "building" | "node" | "manual";
  plannedTime: string | null;
  contextNotes: string | null;
  surveyedAt: string | null;
  place: Place;
}

const WALK_TOLERANCE_OPTIONS: Array<[number, string]> = [
  [50, "Maks. 50 m (sangat pendek)"],
  [150, "Maks. 150 m (pendek)"],
  [300, "Maks. 300 m (ringan)"],
  [800, "Maks. 800 m (standar)"],
  [1500, "Maks. 1.500 m (jauh)"],
];

const WALK_ROLE_LABEL: Record<string, string> = {
  direct_walk: "Jalan kaki langsung",
  first_mile: "Jalan kaki awal ke halte",
  transfer_walk: "Jalan kaki transit antar-halte",
  last_mile: "Jalan kaki akhir ke tujuan",
};

const distanceText = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function modeBadgeProps(opt: MultimodalOption): { label: string; kind: string; icon: string } {
  if (opt.mode === "transit") return { label: "Bus / Shuttle Demo", kind: "yellow", icon: "bus" };
  if (opt.mode === "companion") return { label: "Butuh Pendamping", kind: "red", icon: "handshake" };
  return { label: "Jalan Kaki", kind: "green", icon: "footprints" };
}

function accessibilityLabel(val: "accessible" | "not_accessible" | "unknown"): { text: string; kind: string } {
  if (val === "accessible") return { text: "Ramah aksesibilitas (sintetis)", kind: "green" };
  if (val === "not_accessible") return { text: "Bertangga / tidak ramah kursi roda", kind: "red" };
  return { text: "Aksesibilitas belum diketahui (unknown)", kind: "yellow" };
}

function renderLegSummary(leg: MultimodalLeg, idx: number) {
  if (leg.type === "walk") {
    return (
      <li key={`walk-${idx}`} className="list-item">
        <Icon name="footprints" />
        <div>
          <strong>
            {WALK_ROLE_LABEL[leg.role] || "Jalan kaki"}: {leg.fromLabel} → {leg.toLabel}
          </strong>
          <small>
            {distanceText(leg.distanceM)} · ±{leg.durationMin} menit · {leg.edgeIds.length} segmen graf
            {leg.hasStairs ? ` · ${leg.stepCount} anak tangga` : " · bebas tangga"}
            {leg.surveyedAt ? ` · survei ${leg.surveyedAt}` : " · tanpa tanggal survei lapangan"}
          </small>
        </div>
      </li>
    );
  }

  if (leg.type === "transfer") {
    return (
      <li key={`transfer-${idx}`} className="list-item">
        <Icon name="arrow-up-down" />
        <div>
          <strong>
            Transfer: {leg.fromCorridorName} → {leg.toCorridorName}
          </strong>
          <small>
            {leg.fromStopName} → {leg.toStopName} · jalan {distanceText(leg.walkDistanceM)} (±{leg.walkDurationMin} mnt) ·
            batas min. {leg.minTransferMinutes} mnt
            {leg.actualTransferWindowMinutes !== null ? ` · jendela aktual ${leg.actualTransferWindowMinutes} mnt` : ""}
          </small>
          {!leg.catchable && leg.reasonIfUncatchable && (
            <p className="small" style={{ color: "var(--red)" }}>
              {leg.reasonIfUncatchable}
            </p>
          )}
        </div>
      </li>
    );
  }

  const acc = accessibilityLabel(leg.boardingAccessibility);
  return (
    <li key={`transit-${idx}`} className="list-item">
      <Icon name="bus" />
      <div className="stack-sm">
        <div className="row between">
          <strong>
            {leg.routeShortName} · {leg.headsign}
          </strong>
          <Badge label="Data demo" kind="yellow" icon="bus" />
        </div>
        <small>
          Naik: {leg.boardStop.name} ({leg.departureTimeWib || "jadwal tidak tersedia"}) → Turun: {leg.alightStop.name} (
          {leg.arrivalTimeWib || "-"})
        </small>
        <small>
          Tunggu ±{leg.waitMinutes ?? "-"} mnt · naik kendaraan ±{leg.durationMin} mnt · {formatCurrencyIdr(leg.fareIdr)}
        </small>
        <div className="row">
          <Badge label={acc.text} kind={acc.kind} icon="info" />
          {leg.isStale && <Badge label="Jadwal demo usang" kind="red" icon="triangle-alert" />}
          {!leg.catchable && <Badge label="Jadwal tidak terkejar" kind="red" icon="triangle-alert" />}
        </div>
      </div>
    </li>
  );
}

export function AIPlannerScreen() {
  useLive();
  const { state, update, go, toast, announce, startTrip } = useApp();
  const { startSession } = useActiveSession();
  const voice = useVoice();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiPlannerMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [aiErrorDetail, setAiErrorDetail] = useState<string | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);

  const [preferences, setPreferences] = useState<UserPlacePreference[]>([]);
  const [manualFilter, setManualFilter] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<SelectedDestinationPlan | null>(null);
  const [routeStatus, setRouteStatus] = useState<PlanRouteStatus>("idle");
  const [volunteers, setVolunteers] = useState<AvailableVolunteer[]>([]);
  const [volunteersLoading, setVolunteersLoading] = useState(false);
  const [volunteersError, setVolunteersError] = useState<string | null>(null);
  const [multimodal, setMultimodal] = useState<MultimodalRecommendationResponse | null>(null);
  const [multimodalError, setMultimodalError] = useState<string | null>(null);

  const [demoOverride, setDemoOverride] = useState<boolean | null>(null);
  const [departureTimeHHMM, setDepartureTimeHHMM] = useState<string>("");
  const [maxWalkMeters, setMaxWalkMeters] = useState<number>(800);

  const [isConfirming, setIsConfirming] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const reviewSeqRef = useRef(0);

  const profileId = state.profiles[0] || "blind";
  const currentOrigin = live.origin;
  const demoTransitEnabled =
    demoOverride ??
    shouldDefaultDemoTransit({
      userName: state.name,
      originLabel: currentOrigin?.label,
      destinationName: selectedPlan?.destinationName ?? state.destination,
    });

  const stopDictation = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const readAloud = useCallback(
    (text: string) => {
      if (!speakRaw(text, state.voiceRate)) {
        toast("Suara belum tersedia di browser ini. Teks tetap dapat dibaca.");
      }
    },
    [state.voiceRate, toast],
  );

  const connectAi = useCallback(async () => {
    setIsInitializing(true);
    setAiErrorDetail(null);
    try {
      const conv = await aiPlannerApi.startConversation();
      if (!mountedRef.current) return;
      setConversationId(conv.id);
      setAiUnavailable(false);
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          conversationId: conv.id,
          sender: "assistant",
          inputMode: "text",
          content:
            "Halo! Mau pergi ke mana hari ini? Anda bisa mengetik atau berbicara nama tujuan dan jam rencana keberangkatan (mis. ke Klinik Timur jam 09.00).",
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      if (!mountedRef.current) return;
      setConversationId(null);
      setAiUnavailable(true);
      setAiErrorDetail(errorMessage(err));
    } finally {
      if (mountedRef.current) setIsInitializing(false);
    }

    try {
      const prefs = await aiPlannerApi.getPreferences();
      if (mountedRef.current && Array.isArray(prefs)) {
        setPreferences(prefs);
      }
    } catch {
      // Optional personalization; safe to ignore when unavailable or guest.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      if (!mountedRef.current) return;
      void connectAi();
      if (live.catalogue.status === "idle" || live.catalogue.status === "error") {
        void loadBuildings();
      }
      if (typeof window !== "undefined") {
        const w = window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionInstance;
          webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
        };
        if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
          setVoiceSupported(false);
        }
      }
    });
    const onVisibility = () => {
      if (document.hidden) stopDictation();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      stopDictation();
      cancelSpeech();
    };
  }, [connectAi, stopDictation]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimTranscript, isSending]);

  const computeRecommendation = useCallback(
    async (planTarget: SelectedDestinationPlan) => {
      const seq = ++reviewSeqRef.current;

      if (!live.origin) {
        setRouteStatus("idle");
        setMultimodal(null);
        setMultimodalError(null);
        setVolunteersLoading(true);
        setVolunteersError(null);
        try {
          const list = await companionsApi.available(planTarget.destinationLocation.coordinates);
          if (!mountedRef.current || seq !== reviewSeqRef.current) return;
          setVolunteers(Array.isArray(list) ? list : []);
        } catch (err) {
          if (!mountedRef.current || seq !== reviewSeqRef.current) return;
          setVolunteers([]);
          setVolunteersError(errorMessage(err));
        } finally {
          if (mountedRef.current && seq === reviewSeqRef.current) setVolunteersLoading(false);
        }
        return;
      }

      setRouteStatus("planning");
      setMultimodalError(null);
      setVolunteersLoading(true);
      setVolunteersError(null);

      try {
        const requestedDepartureIso = buildWibDepartureIso(
          departureTimeHHMM || formatWibHHMMFromIso(planTarget.plannedTime),
        );
        const rec = await transitDemoApi.recommend({
          origin: live.origin.point,
          destination: planTarget.destinationLocation,
          profileId,
          demoContext: demoTransitEnabled,
          requestedDepartureIso,
          maxWalkMeters,
        });
        if (!mountedRef.current || seq !== reviewSeqRef.current) return;

        setMultimodal(rec);
        const verified = Array.isArray(rec.companionRecommendation?.verifiedVolunteers)
          ? rec.companionRecommendation.verifiedVolunteers
          : [];
        setVolunteers(verified);
        setVolunteersLoading(false);

        if (rec.recommended?.previewWalkRoute) {
          applyWalkPreview(
            planTarget.place.id,
            profileId,
            live.origin,
            rec.recommended.previewWalkRoute,
          );
          setRouteStatus("ok");
        } else {
          const reasonMsg =
            rec.recommended?.rationale ||
            rec.companionRecommendation?.reasons?.[0] ||
            "Rute mandiri belum terjangkau.";
          applyWalkBlocked(planTarget.place.id, profileId, reasonMsg, {
            reasons: (rec.companionRecommendation?.reasons ?? []).map((m) => ({
              type: "no_path_in_graph",
              message: m,
            })),
            nearestReachablePoint: null,
            suggestion: "request_companion",
          });
          setRouteStatus("unreachable");
        }
        return;
      } catch (err) {
        if (!mountedRef.current || seq !== reviewSeqRef.current) return;
        setMultimodal(null);
        setMultimodalError(errorMessage(err));
      }

      // Graceful fallback to direct pedestrian R2 routing if multimodal endpoint is unavailable
      try {
        const [routeRes, volList] = await Promise.allSettled([
          planRoute(planTarget.place, profileId),
          companionsApi.available(planTarget.destinationLocation.coordinates),
        ]);
        if (!mountedRef.current || seq !== reviewSeqRef.current) return;

        if (volList.status === "fulfilled") {
          setVolunteers(Array.isArray(volList.value) ? volList.value : []);
        } else {
          setVolunteers([]);
          setVolunteersError(errorMessage(volList.reason));
        }
        setVolunteersLoading(false);

        if (routeRes.status === "fulfilled") {
          if (routeRes.value === "ok") setRouteStatus("ok");
          else if (routeRes.value === "unreachable") setRouteStatus("unreachable");
        } else {
          setRouteStatus("error");
        }
      } catch {
        if (!mountedRef.current || seq !== reviewSeqRef.current) return;
        setVolunteersLoading(false);
        setRouteStatus("error");
      }
    },
    [demoTransitEnabled, departureTimeHHMM, maxWalkMeters, profileId],
  );

  // Recompute whenever settings/origin change with an active destination selected
  const originCoordKey = currentOrigin ? currentOrigin.point.coordinates.join(",") : "";
  useEffect(() => {
    if (!selectedPlan) return;
    queueMicrotask(() => {
      if (mountedRef.current) {
        void computeRecommendation(selectedPlan);
      }
    });
  }, [
    selectedPlan,
    originCoordKey,
    profileId,
    demoTransitEnabled,
    departureTimeHHMM,
    maxWalkMeters,
    computeRecommendation,
  ]);

  const selectDestination = useCallback((planTarget: SelectedDestinationPlan) => {
    setSelectedPlan(planTarget);
  }, []);

  const handleExtractionReady = useCallback(
    (extraction: AiPlannerExtraction) => {
      if (!extraction.destinationLocation || !extraction.destinationText) return;
      const extractedHHMM = formatWibHHMMFromIso(extraction.plannedTime);
      if (extractedHHMM) {
        setDepartureTimeHHMM(extractedHHMM);
      }
      const existing = placeByName(extraction.destinationText);
      const place: Place = existing ?? {
        id: `place-ai-${Date.now()}`,
        name: extraction.destinationText,
        kind: "Tujuan terdata",
        icon: "map-pin",
        meta: "Lokasi tercocokkan dari database aplikasi",
        surveyedAt: null,
        coord: extraction.destinationLocation.coordinates,
      };
      if (!existing) retainFacility(place);

      selectDestination({
        destinationName: extraction.destinationText,
        destinationLocation: extraction.destinationLocation,
        matchSource: extraction.matchSource ?? "building",
        plannedTime: extraction.plannedTime,
        contextNotes: extraction.contextNotes,
        surveyedAt: existing?.surveyedAt ?? null,
        place,
      });
    },
    [selectDestination],
  );

  const handlePickManualPlace = useCallback(
    (place: Place) => {
      if (!place.coord) {
        toast("Tempat ini belum memiliki koordinat terverifikasi di server.");
        return;
      }
      retainFacility(place);
      selectDestination({
        destinationName: place.name,
        destinationLocation: { type: "Point", coordinates: place.coord },
        matchSource: "manual",
        plannedTime: null,
        contextNotes: null,
        surveyedAt: place.surveyedAt,
        place,
      });
      announce(`Tujuan ${place.name} dipilih secara manual.`);
    },
    [announce, selectDestination, toast],
  );

  const handlePickPreference = useCallback(
    (pref: UserPlacePreference) => {
      const existing = placeByName(pref.placeName);
      const place: Place = existing ?? {
        id: `pref-${pref.id}`,
        name: pref.placeName,
        kind: "Tujuan tersimpan",
        icon: "map-pin",
        meta: `Dikunjungi ${pref.visitCount} kali`,
        surveyedAt: null,
        coord: pref.placeLocation.coordinates,
      };
      if (!existing) retainFacility(place);

      selectDestination({
        destinationName: pref.placeName,
        destinationLocation: pref.placeLocation,
        matchSource: "preference",
        plannedTime: null,
        contextNotes: null,
        surveyedAt: existing?.surveyedAt ?? null,
        place,
      });
      announce(`Tujuan tersimpan ${pref.placeName} dipilih.`);
    },
    [announce, selectDestination],
  );

  const handleDetectGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("Browser tidak mendukung GPS. Pilih titik asal dari daftar.");
      return;
    }
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        setDetectingGps(false);
        setRouteOrigin({
          label: "Lokasi GPS Anda",
          point: { type: "Point", coordinates: [pos.coords.longitude, pos.coords.latitude] },
        });
        toast("Lokasi GPS terdeteksi.");
      },
      () => {
        if (!mountedRef.current) return;
        setDetectingGps(false);
        toast("Izin lokasi tidak tersedia. Pilih titik asal dari daftar di atas.");
      },
      { timeout: 6000, maximumAge: 60_000 },
    );
  }, [toast]);

  const handleSendMessage = useCallback(
    async (textToSend: string, mode: AiPlannerInputMode = "text") => {
      const trimmed = textToSend.trim();
      if (!trimmed || isSending) return;
      if (aiUnavailable) {
        toast("Asisten AI sedang tidak aktif. Pilih tujuan langsung dari daftar manual di bawah.");
        return;
      }

      setIsSending(true);
      setAiErrorDetail(null);
      setInputText("");
      setInterimTranscript("");

      let optimisticId: string | null = null;
      try {
        let convId = conversationId;
        if (!convId) {
          const newConv = await aiPlannerApi.startConversation();
          if (!mountedRef.current) return;
          convId = newConv.id;
          setConversationId(newConv.id);
        }

        optimisticId = `user-${Date.now()}`;
        const optimisticMsg: AiPlannerMessage = {
          id: optimisticId,
          conversationId: convId,
          sender: "user",
          inputMode: mode,
          content: trimmed,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimisticMsg]);

        const response = await aiPlannerApi.sendMessage(convId, trimmed, mode);
        if (!mountedRef.current) return;

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          response.userMessage,
          response.assistantMessage,
        ]);

        if (response.readyToConfirm && response.extraction?.destinationLocation) {
          handleExtractionReady(response.extraction);
        }

        if (response.assistantMessage?.content && state.voice) {
          readAloud(response.assistantMessage.content);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        if (optimisticId) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        if (mode === "text") {
          setInputText(trimmed);
        }
        const msg = errorMessage(err);
        setAiErrorDetail(msg);
        if (shouldUseManualFallback(err)) {
          setAiUnavailable(true);
          toast("Asisten AI sementara tidak tersedia. Gunakan pemilihan tujuan manual di bawah.");
        } else {
          toast(msg);
        }
      } finally {
        if (mountedRef.current) setIsSending(false);
      }
    },
    [aiUnavailable, conversationId, handleExtractionReady, isSending, readAloud, state.voice, toast],
  );

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopDictation();
      return;
    }
    if (typeof window === "undefined") return;
    if (aiUnavailable) {
      toast("Asisten AI sedang nonaktif. Gunakan daftar pencarian manual di bawah.");
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const RecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setVoiceSupported(false);
      toast("Browser tidak mendukung input suara. Silakan ketik atau pilih tujuan secara manual.");
      return;
    }

    if (voice.wanted || voice.listening) {
      voice.stop("Mikrofon dialihkan ke dikte AI Planner.");
    }
    cancelSpeech();

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = "id-ID";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        if (recognition !== recognitionRef.current) return;
        setIsListening(true);
        setInterimTranscript("");
        announce("Mendengarkan suara Anda. Sebutkan nama tempat tujuan.");
      };

      recognition.onresult = (event) => {
        if (recognition !== recognitionRef.current) return;
        let current = "";
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript;
        }
        setInterimTranscript(current);
        const last = event.results[event.results.length - 1];
        if (last?.isFinal) {
          const finalText = current.trim();
          stopDictation();
          if (finalText) {
            void handleSendMessage(finalText, "voice");
          }
        }
      };

      recognition.onerror = (event) => {
        if (recognition !== recognitionRef.current) return;
        stopDictation();
        if (event.error === "no-speech") {
          toast("Tidak ada suara terdengar. Coba lagi atau ketik tujuan.");
        } else if (event.error === "not-allowed") {
          toast("Izin mikrofon ditolak. Gunakan ketikan teks atau daftar tujuan manual.");
        } else if (event.error !== "aborted") {
          toast("Gangguan pengenalan suara browser. Gunakan ketikan teks.");
        }
      };

      recognition.onend = () => {
        if (recognition !== recognitionRef.current) return;
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch {
      stopDictation();
      toast("Mikrofon tidak dapat dimulai. Gunakan ketikan teks.");
    }
  }, [aiUnavailable, announce, handleSendMessage, isListening, stopDictation, toast, voice]);

  const fallbackAssessment = useMemo(() => {
    if (!selectedPlan) return null;
    return buildPlanAssessment({
      destinationName: selectedPlan.destinationName,
      destinationLocation: selectedPlan.destinationLocation,
      matchSource: selectedPlan.matchSource,
      profileId,
      plannedTime: selectedPlan.plannedTime,
      contextNotes: selectedPlan.contextNotes,
      routeStatus,
      route: live.plan?.placeId === selectedPlan.place.id ? live.plan.route : null,
      unreachable: live.blocked?.placeId === selectedPlan.place.id ? live.blocked : null,
      surveyedAt: selectedPlan.surveyedAt,
      volunteers,
    });
  }, [profileId, routeStatus, selectedPlan, volunteers]);

  const canStartNavigation = Boolean(
    selectedPlan && live.origin && live.plan && live.plan.placeId === selectedPlan.place.id && live.plan.route.reachable,
  );

  const handleConfirmPedestrian = useCallback(
    async (targetAction: "preview" | "trip") => {
      if (!selectedPlan || !canStartNavigation || !live.plan || !live.origin || isConfirming) {
        return;
      }
      setIsConfirming(true);
      try {
        update((s) => ({
          destination: selectedPlan.destinationName,
          recent: [selectedPlan.destinationName, ...s.recent.filter((x) => x !== selectedPlan.destinationName)].slice(0, 5),
        }));

        let resultingSessionId: string | undefined;
        if (targetAction === "trip") {
          const started = await startSession({
            origin: live.origin.point,
            destination: selectedPlan.destinationLocation,
            destinationName: selectedPlan.destinationName,
            edgeIds: live.plan.route.edgeIds,
            profileId,
          });
          resultingSessionId = started?.id;
        }

        if (conversationId) {
          try {
            await aiPlannerApi.confirmConversation(conversationId, {
              destinationText: selectedPlan.destinationName,
              destinationLocation: selectedPlan.destinationLocation,
              plannedTime:
                buildWibDepartureIso(departureTimeHHMM) || selectedPlan.plannedTime || undefined,
              resultingSessionId,
            });
          } catch {
            // Do not block the verified route if conversation archival is unavailable.
          }
        }

        if (targetAction === "trip") {
          startTrip();
          toast(`Perjalanan dimulai menuju ${selectedPlan.destinationName}.`);
        } else {
          go("preview");
        }
      } catch (err) {
        toast(`Gagal membuka rute: ${errorMessage(err)}`);
      } finally {
        if (mountedRef.current) setIsConfirming(false);
      }
    },
    [
      canStartNavigation,
      conversationId,
      departureTimeHHMM,
      go,
      isConfirming,
      profileId,
      selectedPlan,
      startSession,
      startTrip,
      toast,
      update,
    ],
  );

  const handleOpenCompanionForm = useCallback(
    (volunteer?: AvailableVolunteer) => {
      if (!selectedPlan) return;
      const handoffNote = buildCompanionHandoffNote({
        contextNotes: selectedPlan.contextNotes,
        recommendedTitle: multimodal?.recommended?.title,
        rationale: multimodal?.recommended?.rationale,
      });
      update({
        destination: selectedPlan.destinationName,
        pendingDestination: buildAssistancePrefill({
          destinationName: selectedPlan.destinationName,
          destinationLocation: selectedPlan.destinationLocation,
          address: selectedPlan.place.kind,
          contextNotes: handoffNote,
        }),
      });
      go(assistanceInviteHref(volunteer, { timeHHMM: departureTimeHHMM || formatWibHHMMFromIso(selectedPlan.plannedTime) }));
    },
    [departureTimeHHMM, go, multimodal?.recommended?.rationale, multimodal?.recommended?.title, selectedPlan, update],
  );

  const cataloguePlaces = allPlaces().filter((p) => Boolean(p.coord));
  const originOptions = useMemo(() => {
    const opts = cataloguePlaces.map((p) => ({ id: p.id, name: p.name, place: p }));
    if (currentOrigin?.id && !opts.some((o) => o.id === currentOrigin.id)) {
      opts.unshift({
        id: currentOrigin.id,
        name: currentOrigin.label,
        place: {
          id: currentOrigin.id,
          name: currentOrigin.label,
          kind: "Titik asal",
          icon: "map-pin",
          meta: "",
          surveyedAt: null,
          coord: currentOrigin.point.coordinates,
        },
      });
    }
    return opts;
  }, [cataloguePlaces, currentOrigin]);

  const filteredPlaces = useMemo(() => {
    const q = manualFilter.trim().toLowerCase();
    const list = q
      ? cataloguePlaces.filter((p) => p.name.toLowerCase().includes(q) || p.kind.toLowerCase().includes(q))
      : cataloguePlaces;
    return list.slice(0, 10);
  }, [cataloguePlaces, manualFilter]);

  const effectiveVolunteers = multimodal?.companionRecommendation?.verifiedVolunteers ?? fallbackAssessment?.verifiedVolunteers ?? [];
  const effectiveCompanionRecommended = multimodal
    ? multimodal.companionRecommendation.recommended
    : Boolean(fallbackAssessment?.companionRecommended);
  const effectiveCompanionReasons = multimodal
    ? multimodal.companionRecommendation.reasons
    : fallbackAssessment?.companionReasons ?? [];

  return (
    <div className="content-page narrow ai-planner-screen">
      <Heading
        title="Perencana Perjalanan"
        subtitle="Rekomendasi rute jalan kaki terverifikasi dan data transportasi demo"
        back="home"
      />

      {/* Demo Transport Banner & Trip Parameters */}
      <section className="card stack" aria-labelledby="planner-controls-heading">
        <div className="row between">
          <div className="row">
            <Badge
              label={demoTransitEnabled ? "Data transportasi demo" : "Mode jalan kaki murni"}
              kind={demoTransitEnabled ? "yellow" : "blue"}
              icon={demoTransitEnabled ? "bus" : "footprints"}
            />
          </div>
          <Btn
            label={demoTransitEnabled ? "Demo Transit: Aktif" : "Demo Transit: Mati"}
            action="toggle-demo-transit"
            kind={demoTransitEnabled ? "primary" : ""}
            icon="bus"
            aria-pressed={demoTransitEnabled}
            onClick={() => setDemoOverride(!demoTransitEnabled)}
          />
        </div>
        <h2 id="planner-controls-heading" className="sr-only">
          Pengaturan asal, waktu berangkat, dan batas jalan kaki
        </h2>
        <p className="small">
          {demoTransitEnabled
            ? "Data transportasi demo (bus/shuttle sintetis) aktif khusus untuk pasangan lokasi [DEMO]. Lokasi non-demo tetap menggunakan rute pejalan kaki tanpa data transit nyata."
            : "Mode transportasi demo dinonaktifkan. Rencana perjalanan hanya menghitung jalur pejalan kaki terverifikasi."}
        </p>

        <div className="grid-2">
          <label className="field">
            <span>Titik asal perjalanan</span>
            <select
              aria-label="Titik asal perjalanan"
              value={live.origin?.label === "Lokasi GPS Anda" ? "gps" : live.origin?.id ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setRouteOrigin(null);
                  return;
                }
                const picked = originOptions.find((o) => o.id === val);
                if (picked?.place.coord) {
                  setRouteOrigin({
                    id: picked.id,
                    label: picked.name,
                    point: { type: "Point", coordinates: picked.place.coord },
                  });
                }
              }}
            >
              <option value="">Pilih titik asal…</option>
              {live.origin?.label === "Lokasi GPS Anda" && <option value="gps">Lokasi GPS Anda</option>}
              {originOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Batas nyaman jalan kaki</span>
            <select
              aria-label="Batas nyaman jalan kaki"
              value={String(maxWalkMeters)}
              onChange={(e) => setMaxWalkMeters(Number(e.target.value) || 800)}
            >
              {WALK_TOLERANCE_OPTIONS.map(([meters, text]) => (
                <option key={meters} value={String(meters)}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Niat jam berangkat (WIB, bukan jadwal resmi)</span>
            <input
              type="time"
              aria-label="Niat jam berangkat WIB"
              value={departureTimeHHMM}
              onChange={(e) => setDepartureTimeHHMM(e.target.value)}
            />
          </label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <Btn
              label={detectingGps ? "Mencari GPS…" : "Gunakan GPS Saat Ini"}
              action="planner-gps"
              icon="locate-fixed"
              disabled={detectingGps}
              onClick={handleDetectGps}
            />
            {departureTimeHHMM && (
              <Btn
                label="Pakai Jam Sekarang"
                action="reset-time"
                onClick={() => setDepartureTimeHHMM("")}
              />
            )}
          </div>
        </div>
      </section>

      {/* Graceful degradation banner when Gemini AI backend is unavailable */}
      {aiUnavailable && (
        <section className="card stack" role="alert" aria-labelledby="ai-fallback-title">
          <div className="row between">
            <Badge label="Asisten AI tidak tersedia" kind="yellow" icon="triangle-alert" />
            <Btn
              label="Coba Hubungkan Ulang AI"
              action="retry-ai"
              icon="repeat"
              disabled={isInitializing}
              onClick={() => void connectAi()}
            />
          </div>
          <h2 id="ai-fallback-title">Lanjutkan dengan pemilihan tujuan manual</h2>
          <p>
            Layanan ekstraksi bahasa AI saat ini belum dapat digunakan{aiErrorDetail ? ` (${aiErrorDetail})` : ""}.
            Daftar di bawah menampilkan lokasi terverifikasi langsung dari server aplikasi — bukan hasil Gemini AI.
          </p>
          <div className="row">
            <LinkBtn label="Cari Rute Manual" route="search" kind="primary" icon="search" />
            <LinkBtn label="Ke Beranda & Peta" route="home" icon="home" />
          </div>
        </section>
      )}

      {/* AI Conversation Section */}
      {!aiUnavailable && (
        <section className="card stack" aria-label="Asisten percakapan perjalanan">
          <div className="row between">
            <Badge label="Suara & Teks" kind="blue" icon="volume-2" />
            <span className="small">
              {voiceSupported ? "Mikrofon dikte siap saat ditekan" : "Mikrofon tidak didukung browser"}
            </span>
          </div>

          <div
            className="stack"
            aria-live="polite"
            role="log"
            aria-label="Riwayat percakapan perencanaan"
            style={{ maxHeight: "300px", overflowY: "auto" }}
          >
            {isInitializing ? (
              <p role="status">Menghubungkan ke perencana perjalanan AI…</p>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender === "user";
                return (
                  <div
                    key={msg.id}
                    className="card stack-sm"
                    style={{
                      background: isUser ? "var(--color-family)" : "var(--white)",
                      borderColor: isUser ? "var(--color-family-line)" : "var(--line)",
                    }}
                  >
                    <div className="row between">
                      <span className="row small">
                        <Icon name={isUser ? (msg.inputMode === "voice" ? "mic" : "user") : "route"} />
                        <strong>{isUser ? "Anda" : "Perencana AI"}</strong>
                      </span>
                      {!isUser && (
                        <Btn
                          label="Dengarkan"
                          kind="sm"
                          icon="volume-2"
                          onClick={() => readAloud(msg.content)}
                        />
                      )}
                    </div>
                    <p>{msg.content}</p>
                  </div>
                );
              })
            )}

            {isListening && interimTranscript && (
              <p className="notice" role="status">
                Mendengarkan: <em>{interimTranscript}</em>
              </p>
            )}
            {isSending && (
              <p className="small" role="status">
                Memproses pesan dengan perencana server…
              </p>
            )}
            <div ref={chatBottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage(inputText, "text");
            }}
            className="row"
          >
            <input
              type="text"
              className="input"
              style={{ flex: "1 1 200px" }}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Contoh: Saya mau ke Klinik Timur jam 09.00"
              disabled={isSending || isInitializing}
              aria-label="Ketik tujuan perjalanan"
            />
            {voiceSupported && (
              <Btn
                label={isListening ? "Batal" : "Bicara"}
                action="planner-mic"
                kind={isListening ? "danger" : ""}
                icon={isListening ? "mic-off" : "mic"}
                disabled={isSending || isInitializing}
                onClick={toggleVoiceInput}
              />
            )}
            <Btn
              type="submit"
              label="Kirim"
              kind="primary"
              icon="send"
              disabled={!inputText.trim() || isSending || isInitializing}
            />
          </form>
        </section>
      )}

      {/* Manual Verified Destination Picker */}
      <section className="card stack" aria-labelledby="manual-picker-heading">
        <div className="row between">
          <h2 id="manual-picker-heading">Pilih Tujuan Terdata (Tanpa AI)</h2>
          <LinkBtn label="Pencarian Lengkap" route="search" icon="search" />
        </div>
        <label className="field">
          <span>Cari nama gedung atau tempat terverifikasi</span>
          <input
            type="search"
            value={manualFilter}
            onChange={(e) => setManualFilter(e.target.value)}
            placeholder="Ketik nama tempat…"
            aria-label="Filter tujuan terdata"
          />
        </label>

        {preferences.length > 0 && !manualFilter.trim() && (
          <div className="stack-sm">
            <strong className="small">Tujuan sering Anda kunjungi:</strong>
            <div className="row">
              {preferences.slice(0, 4).map((pref) => (
                <Btn
                  key={pref.id}
                  label={pref.placeName}
                  icon="clock"
                  onClick={() => handlePickPreference(pref)}
                />
              ))}
            </div>
          </div>
        )}

        {live.catalogue.status === "loading" ? (
          <p role="status">Memuat daftar gedung terverifikasi dari server…</p>
        ) : live.catalogue.status === "error" ? (
          <div className="notice" role="alert">
            Daftar gedung gagal dimuat ({live.catalogue.error}).{" "}
            <Btn label="Muat Ulang" icon="repeat" onClick={() => void loadBuildings()} />
          </div>
        ) : filteredPlaces.length === 0 ? (
          <p className="small">
            Tidak ada gedung terdata yang cocok dengan “{manualFilter.trim()}”. Coba{" "}
            <LinkBtn label="Buka Pencarian Rute" route="search" icon="search" />.
          </p>
        ) : (
          <ul className="list">
            {filteredPlaces.map((p) => (
              <li key={p.id} className="list-item">
                <Icon name="building-2" />
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.kind} · {p.surveyedAt ? `Disurvei ${p.surveyedAt}` : "Belum disurvei penuh"}
                  </small>
                </div>
                <Btn
                  label="Pilih"
                  action={`pick-${p.id}`}
                  kind={selectedPlan?.place.id === p.id ? "primary" : ""}
                  onClick={() => handlePickManualPlace(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reviewable Multimodal / Pedestrian / Companion Assessment Card */}
      {selectedPlan && (
        <section className="card stack" aria-labelledby="review-plan-heading">
          <div className="row between">
            <div className="row">
              {multimodal?.providerStatus.active && (
                <Badge label="Data transportasi demo" kind="yellow" icon="bus" />
              )}
              {fallbackAssessment && (
                <Badge label={fallbackAssessment.matchSourceLabel} kind="blue" icon="circle-check" />
              )}
            </div>
            <Btn
              label="Baca Ringkasan"
              action="speak-summary"
              icon="volume-2"
              onClick={() => {
                if (multimodal) {
                  readAloud(buildMultimodalSpeechSummary(multimodal, selectedPlan.destinationName));
                } else if (fallbackAssessment) {
                  readAloud(
                    `${fallbackAssessment.destinationName}. ${
                      fallbackAssessment.pedestrianSummary.distanceM !== null
                        ? `Jarak pejalan kaki ${distanceText(fallbackAssessment.pedestrianSummary.distanceM)}.`
                        : fallbackAssessment.pedestrianSummary.unreachableReasons.join(" ") ||
                          "Pilih titik asal untuk menghitung rute."
                    } ${fallbackAssessment.transitNotice}`,
                  );
                }
              }}
            />
          </div>

          <h2 id="review-plan-heading">{selectedPlan.destinationName}</h2>

          {selectedPlan.contextNotes && (
            <p className="small">
              <strong>Catatan kebutuhan Anda:</strong> {selectedPlan.contextNotes}
            </p>
          )}

          {!live.origin ? (
            <div className="notice stack-sm">
              <p>Pilih titik asal di bagian atas atau gunakan GPS untuk menghitung rute dan rekomendasi moda.</p>
              <div className="row">
                <Btn
                  label={detectingGps ? "Mencari GPS…" : "Gunakan GPS Saat Ini"}
                  kind="primary"
                  icon="locate-fixed"
                  disabled={detectingGps}
                  onClick={handleDetectGps}
                />
                <LinkBtn label="Atur Asal di Beranda" route="home" icon="home" />
              </div>
            </div>
          ) : routeStatus === "planning" ? (
            <p role="status">
              Menghitung rute pejalan kaki & kecocokan transportasi demo dari {live.origin.label}…
            </p>
          ) : multimodal ? (
            <>
              {/* Departure intent vs synthetic demo feed notice */}
              <div className="notice stack-sm">
                <div className="row between">
                  <strong>Niat keberangkatan: {multimodal.departureIntent.wibClock}</strong>
                  <Badge
                    label={multimodal.providerStatus.active ? "Data transportasi demo" : "Hanya jalan kaki"}
                    kind={multimodal.providerStatus.active ? "yellow" : "blue"}
                    icon={multimodal.providerStatus.active ? "bus" : "footprints"}
                  />
                </div>
                <p className="small">{multimodal.departureIntent.disclaimer}</p>
                <p className="small">{multimodal.providerStatus.message}</p>
              </div>

              {/* Single Recommended Option */}
              {(() => {
                const rec = multimodal.recommended;
                const mb = modeBadgeProps(rec);
                return (
                  <article className="card border stack-sm" aria-labelledby="recommended-option-heading">
                    <div className="row between">
                      <Badge label={mb.label} kind={mb.kind} icon={mb.icon} />
                      {rec.synthetic && <Badge label="Sintetis (bukan GTFS)" kind="yellow" icon="info" />}
                    </div>
                    <h3 id="recommended-option-heading">{rec.title}</h3>
                    <p>{rec.rationale}</p>

                    {rec.mode !== "companion" && (
                      <div className="row">
                        <Badge label={`±${rec.totalDurationMin} menit`} kind="blue" icon="clock" />
                        <Badge label={`Jalan kaki ${distanceText(rec.totalWalkM)}`} kind="blue" icon="footprints" />
                        <Badge label={formatCurrencyIdr(rec.totalFareIdr)} kind="green" icon="info" />
                        {rec.transfers > 0 && (
                          <Badge label={`${rec.transfers}x transit`} kind="yellow" icon="arrow-up-down" />
                        )}
                      </div>
                    )}

                    {rec.accessibilityUnknown && (
                      <div className="notice" role="alert">
                        <strong>Peringatan aksesibilitas:</strong> Sebagian sarana memiliki status aksesibilitas{" "}
                        <code>unknown</code> (belum diketahui).
                      </div>
                    )}

                    {rec.hasStaleSchedule && (
                      <div className="notice" role="alert">
                        <strong>Jadwal usang:</strong> Data keberangkatan demo melebihi batas kesegaran dan tidak dapat diandalkan.
                      </div>
                    )}

                    {rec.warnings.length > 0 && (
                      <ul className="list">
                        {rec.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}

                    {rec.legs.length > 0 && (
                      <div className="stack-sm">
                        <h4>Langkah perjalanan berurutan</h4>
                        <ul className="list">{rec.legs.map((leg, i) => renderLegSummary(leg, i))}</ul>
                      </div>
                    )}
                  </article>
                );
              })()}

              {/* Alternatives behind <details> so primary card stays calm and focused */}
              {multimodal.alternatives.length > 0 && (
                <details className="card stack-sm">
                  <summary>
                    <strong>Lihat opsi alternatif & alasan ({multimodal.alternatives.length})</strong>
                    <Icon name="chevron-down" />
                  </summary>
                  <div className="stack-sm">
                    {multimodal.alternatives.map((alt) => {
                      const mb = modeBadgeProps(alt);
                      return (
                        <div key={alt.id} className="card border stack-sm">
                          <div className="row between">
                            <div className="row">
                              <Badge label={mb.label} kind={mb.kind} icon={mb.icon} />
                              {alt.synthetic && <Badge label="Data demo" kind="yellow" icon="info" />}
                            </div>
                            <Badge
                              label={alt.eligible ? `Skor ${Math.round(alt.score)}` : "Tidak memenuhi syarat"}
                              kind={alt.eligible ? "blue" : "red"}
                              icon={alt.eligible ? "check" : "triangle-alert"}
                            />
                          </div>
                          <strong>{alt.title}</strong>
                          <p className="small">{alt.rationale}</p>
                          {alt.mode !== "companion" && (alt.totalWalkM > 0 || alt.totalDurationMin > 0) && (
                            <p className="small">
                              Estimasi: {alt.totalDurationMin} mnt · jalan kaki {distanceText(alt.totalWalkM)} ·{" "}
                              {formatCurrencyIdr(alt.totalFareIdr)}
                            </p>
                          )}
                          {alt.disqualificationReasons.length > 0 && (
                            <ul className="list">
                              {alt.disqualificationReasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </>
          ) : (
            /* Fallback pedestrian-only view if transit-demo API is unavailable */
            fallbackAssessment && (
              <div className="stack-sm">
                {multimodalError && (
                  <div className="notice" role="alert">
                    Rekomendasi multimoda belum dapat dimuat ({multimodalError}). Menampilkan perhitungan rute pejalan kaki.
                  </div>
                )}
                {fallbackAssessment.pedestrianSummary.status === "ok" ? (
                  <div className="notice stack-sm">
                    <strong>
                      {distanceText(fallbackAssessment.pedestrianSummary.distanceM ?? 0)}
                      {fallbackAssessment.pedestrianSummary.durationMin
                        ? ` · ±${fallbackAssessment.pedestrianSummary.durationMin} menit`
                        : ""}
                    </strong>
                    <p className="small">{fallbackAssessment.transitNotice}</p>
                  </div>
                ) : fallbackAssessment.pedestrianSummary.status === "unreachable" ? (
                  <div className="notice stack-sm" role="alert">
                    <Badge label="Rute pejalan kaki tidak terjangkau" kind="red" icon="triangle-alert" />
                    {fallbackAssessment.pedestrianSummary.unreachableReasons.map((reason, idx) => (
                      <p key={idx}>{reason}</p>
                    ))}
                  </div>
                ) : (
                  <p className="small">
                    Gagal memuat perhitungan rute.{" "}
                    <Btn
                      label="Hitung Ulang"
                      icon="repeat"
                      onClick={() => void computeRecommendation(selectedPlan)}
                    />
                  </p>
                )}
              </div>
            )
          )}

          {/* Verified Companion Suggestion & Explicit Review Handoff */}
          <div className="stack-sm">
            <div className="row between">
              <h3>Rekomendasi Pendamping</h3>
              {effectiveCompanionRecommended && <Badge label="Disarankan" kind="yellow" icon="handshake" />}
            </div>
            {effectiveCompanionReasons.length > 0 ? (
              <ul className="list">
                {effectiveCompanionReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="small">
                Anda tetap dapat meminta relawan terverifikasi bila merasa lebih nyaman ditemani.
              </p>
            )}

            {volunteersLoading ? (
              <p className="small" role="status">
                Memeriksa relawan terverifikasi di sekitar tujuan…
              </p>
            ) : volunteersError ? (
              <p className="small">Daftar relawan belum tersedia ({volunteersError}).</p>
            ) : effectiveVolunteers.length > 0 ? (
              <ul className="list">
                {effectiveVolunteers.slice(0, 3).map((v) => (
                  <li key={v.id} className="list-item">
                    <Icon name="shield-check" />
                    <div>
                      <strong>{v.name}</strong>
                      <small>
                        Relawan terverifikasi · Rating {v.ratingAvg.toFixed(1)} · {v.totalHelps} pendampingan ·{" "}
                        {distanceText(v.distanceM)}
                      </small>
                    </div>
                    <Btn
                      label={`Pilih ${v.name.replace(/^\[DEMO\]\s*/i, "").split(" ")[0] || "Relawan"}`}
                      action={`invite-volunteer-${v.id}`}
                      onClick={() => handleOpenCompanionForm(v)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">Belum ada relawan terverifikasi yang sedang aktif di sekitar tujuan saat ini.</p>
            )}

            <Btn
              label="Isi Formulir Permintaan Pendamping"
              action="open-companion-form"
              icon="handshake"
              onClick={() => handleOpenCompanionForm()}
            />
          </div>

          {/* Explicit Confirmation Buttons (never auto-triggered by speech) */}
          <hr className="divider" />
          <div className="row">
            <Btn
              label={
                multimodal?.recommended.mode === "transit"
                  ? "Pratinjau Jalan Kaki Awal"
                  : "Lihat Pratinjau Rute"
              }
              action="preview-route"
              icon="route"
              disabled={!canStartNavigation || isConfirming}
              onClick={() => void handleConfirmPedestrian("preview")}
            />
            <Btn
              label={
                isConfirming
                  ? "Menyiapkan…"
                  : multimodal?.recommended.mode === "transit"
                    ? "Konfirmasi & Jalan ke Halte"
                    : "Konfirmasi & Mulai Perjalanan"
              }
              action="confirm-route"
              kind="primary"
              icon="check"
              disabled={!canStartNavigation || isConfirming}
              onClick={() => void handleConfirmPedestrian("trip")}
            />
            {routeStatus === "unreachable" && (
              <LinkBtn
                label="Detail Tidak Terjangkau"
                route="unreachable"
                icon="info"
                onClick={() => update({ destination: selectedPlan.destinationName })}
              />
            )}
            <LinkBtn
              label="Detail Tempat"
              route={placeHref(selectedPlan.place).replace(/^\//, "")}
              icon="info"
            />
          </div>
          {!canStartNavigation && live.origin && routeStatus !== "planning" && (
            <p className="small">
              Navigasi mandiri tidak tersedia karena jalur pejalan kaki/boarding terhalang atau melebihi batas jalan kaki. Gunakan rekomendasi pendamping di atas untuk peninjauan aman.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export const AiPlannerScreen = AIPlannerScreen;
