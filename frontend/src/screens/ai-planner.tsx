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
import { live, loadBuildings, planRoute, setRouteOrigin, useLive } from "@/lib/live";
import { allPlaces, placeByName, placeHref, retainFacility, type Place } from "@/lib/places";
import {
  assistanceInviteHref,
  buildAssistancePrefill,
  buildPlanAssessment,
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

const distanceText = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

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
  const [isConfirming, setIsConfirming] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const reviewSeqRef = useRef(0);

  const profileId = state.profiles[0] || "blind";

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
            "Halo! Mau pergi ke mana hari ini? Anda bisa mengetik atau berbicara nama tujuan dan perkiraan waktu keberangkatan.",
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

  const computeRouteAndVolunteers = useCallback(
    async (planTarget: SelectedDestinationPlan) => {
      const seq = ++reviewSeqRef.current;

      setVolunteersLoading(true);
      setVolunteersError(null);
      companionsApi
        .available(planTarget.destinationLocation.coordinates)
        .then((list) => {
          if (!mountedRef.current || seq !== reviewSeqRef.current) return;
          setVolunteers(Array.isArray(list) ? list : []);
        })
        .catch((err) => {
          if (!mountedRef.current || seq !== reviewSeqRef.current) return;
          setVolunteers([]);
          setVolunteersError(errorMessage(err));
        })
        .finally(() => {
          if (mountedRef.current && seq === reviewSeqRef.current) {
            setVolunteersLoading(false);
          }
        });

      if (!live.origin) {
        setRouteStatus("idle");
        return;
      }

      setRouteStatus("planning");
      try {
        const result = await planRoute(planTarget.place, profileId);
        if (!mountedRef.current || seq !== reviewSeqRef.current) return;
        if (result === "ok") setRouteStatus("ok");
        else if (result === "unreachable") setRouteStatus("unreachable");
      } catch {
        if (!mountedRef.current || seq !== reviewSeqRef.current) return;
        setRouteStatus("error");
      }
    },
    [profileId],
  );

  const selectDestination = useCallback(
    (planTarget: SelectedDestinationPlan) => {
      setSelectedPlan(planTarget);
      void computeRouteAndVolunteers(planTarget);
    },
    [computeRouteAndVolunteers],
  );

  const handleExtractionReady = useCallback(
    (extraction: AiPlannerExtraction) => {
      if (!extraction.destinationLocation || !extraction.destinationText) return;
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
      toast("Browser tidak mendukung GPS. Pilih titik asal melalui Beranda.");
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
        toast("Lokasi GPS terdeteksi. Menghitung rute pejalan kaki…");
        if (selectedPlan) {
          void computeRouteAndVolunteers(selectedPlan);
        }
      },
      () => {
        if (!mountedRef.current) return;
        setDetectingGps(false);
        toast("Izin lokasi tidak tersedia. Silakan atur titik asal dari Beranda.");
      },
      { timeout: 6000, maximumAge: 60_000 },
    );
  }, [computeRouteAndVolunteers, selectedPlan, toast]);

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

  const assessment = useMemo(() => {
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

  const handleConfirmPedestrian = useCallback(
    async (targetAction: "preview" | "trip") => {
      if (!selectedPlan || !assessment?.canStartPedestrianTrip || !live.plan || !live.origin || isConfirming) {
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
              plannedTime: selectedPlan.plannedTime || undefined,
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
    [assessment?.canStartPedestrianTrip, conversationId, go, isConfirming, profileId, selectedPlan, startSession, startTrip, toast, update],
  );

  const handleOpenCompanionForm = useCallback(
    (volunteer?: AvailableVolunteer) => {
      if (!selectedPlan) return;
      update({
        destination: selectedPlan.destinationName,
        pendingDestination: buildAssistancePrefill({
          destinationName: selectedPlan.destinationName,
          destinationLocation: selectedPlan.destinationLocation,
          address: selectedPlan.place.kind,
          contextNotes: selectedPlan.contextNotes,
        }),
      });
      go(assistanceInviteHref(volunteer));
    },
    [go, selectedPlan, update],
  );

  const cataloguePlaces = allPlaces().filter((p) => Boolean(p.coord));
  const filteredPlaces = useMemo(() => {
    const q = manualFilter.trim().toLowerCase();
    const list = q
      ? cataloguePlaces.filter((p) => p.name.toLowerCase().includes(q) || p.kind.toLowerCase().includes(q))
      : cataloguePlaces;
    return list.slice(0, 8);
  }, [cataloguePlaces, manualFilter]);

  return (
    <div className="content-page narrow ai-planner-screen">
      <Heading
        title="Perencana Perjalanan"
        subtitle="Sebutkan tujuan atau pilih langsung dari lokasi terverifikasi"
        back="home"
      />

      {/* Graceful degradation banner when Gemini AI backend is unavailable */}
      {aiUnavailable && (
        <section className="card stack" role="alert" aria-labelledby="ai-fallback-title">
          <div className="row between">
            <div className="row">
              <Badge label="Asisten AI tidak tersedia" kind="yellow" icon="triangle-alert" />
            </div>
            <Btn
              label="Coba Hubungkan Ulang AI"
              action="retry-ai"
              kind="sm"
              icon="repeat"
              disabled={isInitializing}
              onClick={() => void connectAi()}
            />
          </div>
          <h2 id="ai-fallback-title">Lanjutkan dengan pemilihan tujuan manual</h2>
          <p>
            Layanan ekstraksi bahasa AI saat ini belum dapat digunakan{aiErrorDetail ? ` (${aiErrorDetail})` : ""}. Daftar di bawah menampilkan
            lokasi terverifikasi langsung dari server aplikasi — bukan hasil Gemini AI.
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
            style={{ maxHeight: "340px", overflowY: "auto" }}
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
              style={{ flex: 1 }}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Contoh: Saya mau ke Gedung PAU jam 09.30"
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

      {/* Manual Verified Destination Picker (always works offline from Gemini) */}
      <section className="card stack" aria-labelledby="manual-picker-heading">
        <div className="row between">
          <h2 id="manual-picker-heading">Pilih Tujuan Terdata (Tanpa AI)</h2>
          <LinkBtn label="Pencarian Lengkap" route="search" kind="sm" icon="search" />
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
                  kind="sm"
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
            <Btn label="Muat Ulang" kind="sm" icon="repeat" onClick={() => void loadBuildings()} />
          </div>
        ) : filteredPlaces.length === 0 ? (
          <p className="small">
            Tidak ada gedung terdata yang cocok dengan “{manualFilter.trim()}”. Coba{" "}
            <LinkBtn label="Buka Pencarian Rute" route="search" kind="sm" icon="search" />.
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
                  kind={selectedPlan?.place.id === p.id ? "primary sm" : "sm"}
                  onClick={() => handlePickManualPlace(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reviewable Trip & Multimodal / Companion Assessment Card */}
      {selectedPlan && assessment && (
        <section className="card stack" aria-labelledby="review-plan-heading">
          <div className="row between">
            <Badge label={assessment.matchSourceLabel} kind="blue" icon="circle-check" />
            <Btn
              label="Baca Ringkasan"
              kind="sm"
              icon="volume-2"
              onClick={() =>
                readAloud(
                  `${assessment.destinationName}. ${
                    assessment.pedestrianSummary.distanceM !== null
                      ? `Jarak pejalan kaki ${distanceText(assessment.pedestrianSummary.distanceM)}.`
                      : assessment.pedestrianSummary.unreachableReasons.join(" ") || "Pilih titik asal untuk menghitung rute."
                  } ${assessment.transitNotice}`,
                )
              }
            />
          </div>

          <h2 id="review-plan-heading">{assessment.destinationName}</h2>

          {assessment.plannedTimeWib && (
            <div className="notice">
              <strong>Rencana waktu: {assessment.plannedTimeWib}</strong>
              <p className="small">{assessment.plannedTimeDisclaimer}</p>
            </div>
          )}

          {selectedPlan.contextNotes && (
            <p className="small">
              <strong>Catatan kebutuhan Anda:</strong> {selectedPlan.contextNotes}
            </p>
          )}

          {/* Origin & Pedestrian Route Verification */}
          <div className="stack-sm">
            <h3>Rute Pejalan Kaki Terverifikasi</h3>
            {!live.origin ? (
              <div className="notice stack-sm">
                <p>Pilih titik asal terlebih dahulu untuk menghitung rute pejalan kaki dari data server.</p>
                <div className="row">
                  <Btn
                    label={detectingGps ? "Mencari GPS…" : "Gunakan GPS Saat Ini"}
                    kind="primary sm"
                    icon="locate-fixed"
                    disabled={detectingGps}
                    onClick={handleDetectGps}
                  />
                  <LinkBtn label="Atur Asal di Beranda" route="home" kind="sm" icon="home" />
                </div>
              </div>
            ) : assessment.pedestrianSummary.status === "planning" ? (
              <p role="status">Menghitung rute ramah profil Anda dari {live.origin.label}…</p>
            ) : assessment.pedestrianSummary.status === "ok" ? (
              <div className="notice stack-sm">
                <div className="row between">
                  <strong>
                    {distanceText(assessment.pedestrianSummary.distanceM ?? 0)}
                    {assessment.pedestrianSummary.durationMin ? ` · ±${assessment.pedestrianSummary.durationMin} menit` : ""}
                  </strong>
                  <Badge
                    label={
                      assessment.pedestrianSummary.barrierCount > 0
                        ? `${assessment.pedestrianSummary.barrierCount} hambatan aktif`
                        : "Tanpa hambatan aktif"
                    }
                    kind={assessment.pedestrianSummary.barrierCount > 0 ? "yellow" : "green"}
                    icon={assessment.pedestrianSummary.barrierCount > 0 ? "triangle-alert" : "check"}
                  />
                </div>
                <p className="small">
                  Asal: {live.origin.label} ·{" "}
                  {assessment.pedestrianSummary.surveyedAtLabel
                    ? `Data survei: ${assessment.pedestrianSummary.surveyedAtLabel}`
                    : "Belum memiliki tanggal survei terbaru"}
                </p>
                {assessment.pedestrianSummary.barrierMessages.length > 0 && (
                  <ul className="list">
                    {assessment.pedestrianSummary.barrierMessages.map((msg, idx) => (
                      <li key={idx}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : assessment.pedestrianSummary.status === "unreachable" ? (
              <div className="notice stack-sm" role="alert">
                <Badge label="Rute pejalan kaki tidak terjangkau" kind="red" icon="triangle-alert" />
                {assessment.pedestrianSummary.unreachableReasons.map((reason, idx) => (
                  <p key={idx}>{reason}</p>
                ))}
                {assessment.pedestrianSummary.hasNearestReachablePoint && (
                  <p className="small">Tersedia titik terdekat yang masih dapat dijangkau pada layar detail rute.</p>
                )}
                <LinkBtn label="Lihat Detail Tidak Terjangkau" route="unreachable" kind="sm" icon="info" />
              </div>
            ) : (
              <p className="small">
                Gagal memuat perhitungan rute.{" "}
                <Btn label="Hitung Ulang" kind="sm" icon="repeat" onClick={() => void computeRouteAndVolunteers(selectedPlan)} />
              </p>
            )}
          </div>

          {/* Honest Transit / Multimodal Boundary */}
          <div className="notice stack-sm">
            <div className="row">
              <Icon name="bus" />
              <strong>Integrasi Transportasi Umum</strong>
            </div>
            <p className="small">{assessment.transitNotice}</p>
          </div>

          {/* Verified Companion Suggestion & Read-only Preview */}
          <div className="stack-sm">
            <div className="row between">
              <h3>Rekomendasi Pendamping</h3>
              {assessment.companionRecommended && <Badge label="Disarankan" kind="yellow" icon="handshake" />}
            </div>
            {assessment.companionReasons.length > 0 ? (
              <ul className="list">
                {assessment.companionReasons.map((reason, idx) => (
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
            ) : assessment.verifiedVolunteers.length > 0 ? (
              <ul className="list">
                {assessment.verifiedVolunteers.slice(0, 3).map((v) => (
                  <li key={v.id} className="list-item">
                    <Icon name="shield-check" />
                    <div>
                      <strong>{v.name}</strong>
                      <small>
                        Relawan terverifikasi · Rating {v.ratingAvg.toFixed(1)} · {v.totalHelps} pendampingan · {distanceText(v.distanceM)}
                      </small>
                    </div>
                    <Btn
                      label="Pilih"
                      kind="sm"
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
              label="Lihat Pratinjau Rute"
              action="preview-route"
              icon="route"
              disabled={!assessment.canStartPedestrianTrip || isConfirming}
              onClick={() => void handleConfirmPedestrian("preview")}
            />
            <Btn
              label={isConfirming ? "Menyiapkan…" : "Konfirmasi & Mulai Perjalanan"}
              action="confirm-route"
              kind="primary"
              icon="check"
              disabled={!assessment.canStartPedestrianTrip || isConfirming}
              onClick={() => void handleConfirmPedestrian("trip")}
            />
            <LinkBtn
              label="Detail Tempat"
              route={placeHref(selectedPlan.place).replace(/^\//, "")}
              kind="sm"
              icon="info"
            />
          </div>
          {!assessment.canStartPedestrianTrip && (
            <p className="small">
              Konfirmasi memulai perjalanan aktif hanya tersedia setelah rute pejalan kaki terverifikasi dan terjangkau ditemukan.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export const AiPlannerScreen = AIPlannerScreen;
