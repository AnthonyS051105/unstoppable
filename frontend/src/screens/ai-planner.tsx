"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heading } from "@/components/shared";
import { Badge, Btn, Circle, Icon, LinkBtn } from "@/components/ui";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { useApp } from "@/hooks/useApp";
import { errorMessage } from "@/lib/api-client";
import { aiPlannerApi } from "@/lib/api/ai-planner";
import { live, planRoute, setRouteOrigin } from "@/lib/live";
import { allPlaces, placeByName, retainFacility, type Place } from "@/lib/places";
import type {
  AiPlannerExtraction,
  AiPlannerInputMode,
  AiPlannerMessage,
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

// Quick fallback recommendations if preferences are empty
const DEFAULT_RECOMMENDATIONS = [
  "Gedung PAU UGM",
  "Perpustakaan Pusat UGM",
  "Fakultas Teknik UGM",
  "Kantin Pusat",
];

export function AIPlannerScreen() {
  const { state, update, toast, announce, speak, startTrip } = useApp();
  const { startSession } = useActiveSession();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiPlannerMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [preferences, setPreferences] = useState<UserPlacePreference[]>([]);
  const [latestExtraction, setLatestExtraction] = useState<AiPlannerExtraction | null>(null);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimTranscript, isSending]);

  // Check Web Speech API availability
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      };
      if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
        setVoiceSupported(false);
      }
    }
  }, []);

  // Initialize conversation and preferences
  useEffect(() => {
    let active = true;

    async function init() {
      setIsInitializing(true);
      setErrorStatus(null);
      try {
        const conv = await aiPlannerApi.startConversation();
        if (!active) return;
        setConversationId(conv.id);

        const welcomeMsg: AiPlannerMessage = {
          id: `welcome-${Date.now()}`,
          conversationId: conv.id,
          sender: "assistant",
          inputMode: "text",
          content:
            "Halo! Mau pergi ke mana hari ini? Anda bisa bicara langsung menggunakan tombol mikrofon atau mengetik tujuan Anda di bawah.",
          createdAt: new Date().toISOString(),
        };
        setMessages([welcomeMsg]);
      } catch (err) {
        if (!active) return;
        const msg = errorMessage(err);
        setErrorStatus(msg);
        toast(`Gagal memulai percakapan AI: ${msg}`);
      } finally {
        if (active) setIsInitializing(false);
      }

      // Fetch user place preferences
      try {
        const prefs = await aiPlannerApi.getPreferences();
        if (active && Array.isArray(prefs)) {
          setPreferences(prefs);
        }
      } catch {
        // Preferences are optional enhancements
      }
    }

    void init();

    return () => {
      active = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [toast]);

  // Read message aloud
  const readAloud = useCallback(
    (text: string) => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "id-ID";
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } else {
        speak(text);
      }
    },
    [speak],
  );

  // Send message to AI Planner
  const handleSendMessage = useCallback(
    async (textToSend: string, mode: AiPlannerInputMode = "text") => {
      const trimmed = textToSend.trim();
      if (!trimmed || isSending) return;

      let convId = conversationId;
      setIsSending(true);
      setErrorStatus(null);
      setInputText("");
      setInterimTranscript("");

      try {
        // Start a conversation if not already created
        if (!convId) {
          const newConv = await aiPlannerApi.startConversation();
          convId = newConv.id;
          setConversationId(newConv.id);
        }

        // Optimistically add user message
        const optimisticUserMsg: AiPlannerMessage = {
          id: `user-${Date.now()}`,
          conversationId: convId,
          sender: "user",
          inputMode: mode,
          content: trimmed,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimisticUserMsg]);

        // Send to backend
        const response = await aiPlannerApi.sendMessage(convId, trimmed, mode);

        // Update messages with server response
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticUserMsg.id),
          response.userMessage,
          response.assistantMessage,
        ]);

        if (response.extraction) {
          setLatestExtraction(response.extraction);
        }
        setReadyToConfirm(Boolean(response.readyToConfirm));

        // Read out assistant response to elderly user
        if (response.assistantMessage?.content) {
          readAloud(response.assistantMessage.content);
        }
      } catch (err) {
        const errorMsg = errorMessage(err);
        setErrorStatus(errorMsg);
        toast(errorMsg);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, isSending, readAloud, toast],
  );

  // Toggle voice recognition
  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    if (typeof window === "undefined") return;

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRecognitionClass = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      toast("Browser tidak mendukung input suara. Silakan ketik tujuan Anda.");
      setVoiceSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = "id-ID";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorStatus(null);
        setInterimTranscript("");
        announce("Mendengarkan suara Anda. Silakan sebutkan tujuan perjalanan.");
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let current = "";
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript;
        }
        setInterimTranscript(current);

        const last = event.results[event.results.length - 1];
        if (last && last.isFinal) {
          const finalTranscript = current.trim();
          setIsListening(false);
          if (finalTranscript) {
            void handleSendMessage(finalTranscript, "voice");
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        setIsListening(false);
        if (event.error === "no-speech") {
          toast("Tidak ada suara yang terdeteksi. Silakan coba lagi.");
        } else if (event.error === "not-allowed") {
          toast("Izin mikrofon tidak diberikan. Periksa izin browser Anda.");
        } else {
          toast("Gangguan input suara. Silakan gunakan ketikan teks.");
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      setIsListening(false);
      toast("Tidak dapat membuka mikrofon. Silakan gunakan ketikan teks.");
    }
  }, [isListening, announce, handleSendMessage, toast]);

  // Confirm travel plan and immediately open active route
  const handleConfirmRoute = useCallback(async () => {
    if (!latestExtraction || !conversationId || isConfirming) return;

    const destName = latestExtraction.destinationText || state.destination || "Tujuan Perjalanan";
    const destCoords = latestExtraction.destinationLocation?.coordinates;

    setIsConfirming(true);
    try {
      announce(`Mengonfirmasi rencana perjalanan menuju ${destName}.`);

      // 1. Prepare target place
      let targetPlace = placeByName(destName);
      if (!targetPlace && destCoords) {
        // Construct dynamic place for the resolved coordinates
        targetPlace = {
          id: `place-ai-${Date.now()}`,
          name: destName,
          kind: "Tujuan AI Planner",
          icon: "map-pin",
          meta: "Lokasi dikonfirmasi melalui AI Travel Planner",
          surveyedAt: null,
          coord: destCoords,
        };
        retainFacility(targetPlace);
      } else if (!targetPlace) {
        // Fallback to first available place if neither matched nor coords
        const places = allPlaces();
        targetPlace = places[0];
      }

      // 2. Ensure route origin exists
      if (!live.origin) {
        // Use GPS or fallback origin so planning succeeds
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          try {
            await new Promise<void>((resolve) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setRouteOrigin({
                    label: "Lokasi GPS Anda",
                    point: { type: "Point", coordinates: [pos.coords.longitude, pos.coords.latitude] },
                  });
                  resolve();
                },
                () => {
                  // Fallback to default campus gate/origin
                  setRouteOrigin({
                    label: "Pintu Masuk Kampus",
                    point: { type: "Point", coordinates: [110.3759, -7.7653] },
                  });
                  resolve();
                },
                { timeout: 3000 },
              );
            });
          } catch {
            setRouteOrigin({
              label: "Titik Asal Pejalan Kaki",
              point: { type: "Point", coordinates: [110.3759, -7.7653] },
            });
          }
        } else {
          setRouteOrigin({
            label: "Titik Asal Pejalan Kaki",
            point: { type: "Point", coordinates: [110.3759, -7.7653] },
          });
        }
      }

      // Update state destination
      update((s) => ({
        destination: destName,
        recent: [destName, ...s.recent.filter((x) => x !== destName)].slice(0, 5),
      }));

      // 3. Plan the accessible route
      const profileId = state.profiles[0] || "blind";
      if (targetPlace) {
        await planRoute(targetPlace, profileId);
      }

      // 4. Start active travel session
      const originPoint = live.origin?.point || {
        type: "Point" as const,
        coordinates: [110.3759, -7.7653] as [number, number],
      };
      const destPoint = destCoords
        ? { type: "Point" as const, coordinates: destCoords }
        : targetPlace?.coord
          ? { type: "Point" as const, coordinates: targetPlace.coord }
          : originPoint;

      const started = await startSession({
        origin: originPoint,
        destination: destPoint,
        destinationName: destName,
        edgeIds: live.plan?.route?.edgeIds || [],
        profileId,
      });

      // 5. Confirm conversation on backend with resultingSessionId
      await aiPlannerApi.confirmConversation(conversationId, {
        destinationText: destName,
        destinationLocation: destCoords ? { type: "Point", coordinates: destCoords } : undefined,
        plannedTime: latestExtraction.plannedTime || undefined,
        resultingSessionId: started?.id,
      });

      // 6. Immediately launch active trip / navigation route
      startTrip();
      toast(`Perjalanan aktif dimulai menuju ${destName}.`);
      announce(`Perjalanan aktif dimulai menuju ${destName}. Panduan langkah demi langkah aktif.`);
    } catch (err) {
      toast(`Gagal membuka rute: ${errorMessage(err)}`);
    } finally {
      setIsConfirming(false);
    }
  }, [
    latestExtraction,
    conversationId,
    isConfirming,
    state.destination,
    state.profiles,
    announce,
    update,
    startSession,
    startTrip,
    toast,
  ]);

  return (
    <div className="content-page narrow ai-planner-screen" style={{ paddingBottom: "120px" }}>
      <Heading
        title="AI Travel Planner"
        subtitle="Rencanakan rute ramah disabilitas dan lansia"
        back="home"
      />

      {/* Elderly Accessibility Notice & Mode Indicator */}
      <section
        className="card stack peek-keep"
        style={{
          borderLeft: "5px solid #ffc410",
          backgroundColor: "#fffdf5",
          padding: "16px",
        }}
        aria-label="Petunjuk penggunaan"
      >
        <div className="row between items-center">
          <div className="row items-center" style={{ gap: "8px" }}>
            <Badge label="Ramah Lansia" kind="warning" icon="volume-2" />
            <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#555" }}>
              Suara & Teks
            </span>
          </div>
          {voiceSupported ? (
            <span style={{ fontSize: "0.85rem", color: "#145c38", fontWeight: 600 }}>
              Mikrofon Siap
            </span>
          ) : (
            <span style={{ fontSize: "0.85rem", color: "#b42335" }}>
              Mikrofon tidak didukung
            </span>
          )}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: "1.05rem", lineHeight: 1.5 }}>
          Tekan tombol mikrofon besar untuk berbicara, atau ketik tempat tujuan Anda. Asisten AI akan mencocokkan tujuan dan menyiapkan rute aktif yang nyaman.
        </p>
      </section>

      {/* Suggested Destination Chips */}
      <section className="card stack" aria-labelledby="suggestions-heading">
        <h2 id="suggestions-heading" style={{ fontSize: "1.1rem", margin: 0 }}>
          Sering Dikunjungi / Rekomendasi
        </h2>
        <div
          className="row"
          style={{ flexWrap: "wrap", gap: "8px" }}
          role="group"
          aria-label="Pilihan tempat cepat"
        >
          {(preferences.length > 0
            ? preferences.map((p) => p.placeName)
            : DEFAULT_RECOMMENDATIONS
          ).map((name) => (
            <button
              key={name}
              type="button"
              className="btn btn-round"
              style={{
                fontSize: "0.95rem",
                padding: "8px 14px",
                backgroundColor: "#f4f6fa",
                border: "1px solid #dcdfe6",
                cursor: "pointer",
              }}
              onClick={() => void handleSendMessage(`Saya ingin pergi ke ${name}`, "text")}
            >
              <Icon name="map-pin" />
              <span>{name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Chat Conversation Thread */}
      <section
        className="card stack conversation-thread"
        aria-live="polite"
        role="log"
        aria-label="Riwayat percakapan dengan AI"
        style={{
          minHeight: "260px",
          maxHeight: "450px",
          overflowY: "auto",
          padding: "16px",
          backgroundColor: "#fafbfc",
        }}
      >
        {isInitializing ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#666" }}>
            <p style={{ fontSize: "1.1rem" }}>Menghubungkan ke Asisten Perjalanan AI…</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "4px",
                    fontSize: "0.85rem",
                    color: "#6c757d",
                  }}
                >
                  <Icon name={isUser ? (msg.inputMode === "voice" ? "mic" : "user") : "sparkles"} />
                  <strong>{isUser ? "Anda" : "Asisten AI"}</strong>
                </div>
                <div
                  className="message-bubble"
                  style={{
                    maxWidth: "85%",
                    padding: "14px 18px",
                    borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    backgroundColor: isUser ? "#ffd540" : "#ffffff",
                    color: "#11132d",
                    border: isUser ? "none" : "1px solid #e2e8f0",
                    fontSize: "1.1rem",
                    lineHeight: 1.5,
                    boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
                  }}
                >
                  <p style={{ margin: 0 }}>{msg.content}</p>
                  {!isUser && (
                    <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => readAloud(msg.content)}
                        aria-label="Dengarkan pesan asisten"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#174da8",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.9rem",
                          fontWeight: 600,
                          padding: "4px 8px",
                        }}
                      >
                        <Icon name="volume-2" />
                        <span>Dengarkan</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Live speech feedback */}
        {isListening && interimTranscript && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              marginBottom: "14px",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "#a66600", fontWeight: 600 }}>
              Mendengarkan...
            </span>
            <div
              style={{
                maxWidth: "85%",
                padding: "12px 16px",
                borderRadius: "18px 18px 4px 18px",
                backgroundColor: "#fff7df",
                color: "#624100",
                border: "1px dashed #ffd540",
                fontSize: "1.05rem",
                fontStyle: "italic",
              }}
            >
              {interimTranscript}
            </div>
          </div>
        )}

        {isSending && (
          <div style={{ padding: "10px", color: "#666", fontStyle: "italic", fontSize: "1rem" }}>
            Asisten AI sedang berpikir dan menganalisis lokasi…
          </div>
        )}

        <div ref={chatBottomRef} />
      </section>

      {/* Confirmation & Active Route Launch Card */}
      {latestExtraction && latestExtraction.destinationLocation && (
        <section
          className="card stack ai-confirmation-card peek-keep"
          style={{
            backgroundColor: "#eaf2ff",
            borderColor: "#174da8",
            borderWidth: "2px",
            padding: "20px",
          }}
          aria-labelledby="confirm-heading"
        >
          <div className="row items-center" style={{ gap: "8px" }}>
            <Badge label="Tujuan Teridentifikasi" kind="blue" icon="check" />
            {latestExtraction.matchSource && (
              <span style={{ fontSize: "0.85rem", color: "#174da8", fontWeight: 600 }}>
                Sumber: {latestExtraction.matchSource}
              </span>
            )}
          </div>
          <div>
            <h2 id="confirm-heading" style={{ fontSize: "1.35rem", margin: "6px 0 4px" }}>
              {latestExtraction.destinationText || "Tujuan Perjalanan"}
            </h2>
            {latestExtraction.plannedTime && (
              <p style={{ margin: "2px 0", fontSize: "1.05rem", color: "#333" }}>
                <strong>Waktu keberangkatan:</strong> {new Date(latestExtraction.plannedTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB
              </p>
            )}
            {latestExtraction.contextNotes && (
              <p style={{ margin: "2px 0", fontSize: "1.05rem", color: "#333" }}>
                <strong>Catatan kebutuhan:</strong> {latestExtraction.contextNotes}
              </p>
            )}
          </div>

          <div className="row" style={{ marginTop: "8px", gap: "10px" }}>
            <Btn
              label={isConfirming ? "Menyiapkan Rute Aktif…" : "Konfirmasi & Buka Rute Aktif"}
              action="confirm-route"
              kind="primary"
              icon="route"
              disabled={isConfirming}
              onClick={() => void handleConfirmRoute()}
              style={{
                flex: 1,
                minHeight: "56px",
                fontSize: "1.15rem",
                fontWeight: "bold",
                backgroundColor: "#ffd540",
                color: "#11132d",
              }}
            />
          </div>
        </section>
      )}

      {/* Primary Elderly Voice Input Button */}
      <section
        className="card stack voice-action-section"
        style={{
          textAlign: "center",
          padding: "20px",
          backgroundColor: isListening ? "#fff5dc" : "#ffffff",
          borderColor: isListening ? "#ffc410" : "#e2e8f0",
          transition: "background-color 0.2s ease",
        }}
        aria-label="Input suara"
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <button
            type="button"
            className={`btn-voice-large ${isListening ? "listening" : ""}`}
            onClick={toggleVoiceInput}
            aria-pressed={isListening}
            aria-label={isListening ? "Hentikan mendengarkan suara" : "Mulai bicara dengan mikrofon"}
            style={{
              width: "76px",
              height: "76px",
              borderRadius: "50%",
              backgroundColor: isListening ? "#b42335" : "#ffd540",
              color: isListening ? "#ffffff" : "#11132d",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: isListening
                ? "0 0 0 10px rgba(180, 35, 53, 0.2)"
                : "0 4px 12px rgba(255, 196, 16, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            <Icon name={isListening ? "mic-off" : "mic"} />
          </button>
          <div>
            <strong style={{ fontSize: "1.2rem", display: "block" }}>
              {isListening ? "Sedang Mendengarkan…" : "Tekan untuk Bicara"}
            </strong>
            <span style={{ fontSize: "0.95rem", color: "#666" }}>
              {isListening
                ? "Sebutkan nama tempat (contoh: 'Saya mau ke Gedung PAU')"
                : "Gunakan suara Anda tanpa perlu mengetik"}
            </span>
          </div>
          {isListening && (
            <Btn
              label="Batal Mendengarkan"
              kind="repeat-action"
              onClick={toggleVoiceInput}
              style={{ fontSize: "0.9rem", padding: "6px 14px" }}
            />
          )}
        </div>
      </section>

      {/* Text Input Fallback Bar */}
      <section className="card stack" aria-label="Input ketik teks">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage(inputText, "text");
          }}
          className="row"
          style={{ gap: "8px", alignItems: "center" }}
        >
          <input
            type="text"
            className="input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Atau ketik nama tujuan di sini…"
            disabled={isSending}
            aria-label="Ketik tujuan perjalanan"
            style={{
              flex: 1,
              minHeight: "52px",
              fontSize: "1.1rem",
              padding: "0 16px",
              borderRadius: "10px",
              border: "1px solid #ced4da",
            }}
          />
          <Btn
            type="submit"
            label="Kirim"
            kind="primary"
            icon="send"
            disabled={!inputText.trim() || isSending}
            style={{
              minHeight: "52px",
              padding: "0 20px",
              fontSize: "1.05rem",
              fontWeight: 600,
            }}
          />
        </form>
      </section>

      {errorStatus && (
        <p role="alert" style={{ color: "#b42335", fontWeight: 600, textAlign: "center" }}>
          {errorStatus}
        </p>
      )}
    </div>
  );
}

// Re-export with alternate casing for convenience
export const AiPlannerScreen = AIPlannerScreen;
