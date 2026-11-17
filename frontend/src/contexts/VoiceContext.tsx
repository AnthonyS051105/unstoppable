"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { currentRoute, useApp } from "@/hooks/useApp";
import { isSeniorRole } from "@/lib/access";
import { searchControl, sheetControl } from "@/lib/controls";
import { DESTINATIONS, PROFILE_SHORT, type ProfileId } from "@/lib/data";
import { placeByName } from "@/lib/places";
import { setSpeechHooks, speak as speakRaw } from "@/lib/speech";
import {
  gateWakeCommand,
  isSensitiveVoiceCommand,
  MAX_EMPTY_VOICE_ENDS,
  normalizeVoiceCommand,
  shouldRetryRecognition,
  VOICE_WAKE_WINDOW_MS,
  WAKE_PHRASE,
} from "@/lib/voice-command";

type VoiceMode = "control" | "search" | "wake";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => SpeechRecognitionLike;

type Ctx = {
  wanted: boolean;
  listening: boolean;
  mode: VoiceMode;
  request: (mode: VoiceMode) => void;
  stop: (msg?: string) => void;
  help: () => void;
};
const VoiceContext = createContext<Ctx | null>(null);

const ERRORS: Record<string, string> = {
  "not-allowed": "Izin mikrofon ditolak. Periksa izin situs di browser, atau gunakan teks.",
  "service-not-allowed": "Layanan suara tidak tersedia di browser ini.",
  "audio-capture": "Mikrofon tidak ditemukan. Gunakan pencarian teks.",
  network: "Layanan pengenalan suara tidak tersambung. Periksa internet atau gunakan teks.",
  "language-not-supported": "Bahasa Indonesia belum tersedia pada layanan suara ini.",
};

const getRecognition = () =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const appRef = useRef(app);
  useLayoutEffect(() => {
    appRef.current = app;
  });

  const session = useRef({
    recognizer: null as SpeechRecognitionLike | null,
    wanted: false,
    listening: false,
    mode: "control" as VoiceMode,
    restart: undefined as ReturnType<typeof setTimeout> | undefined,
    wakeUntil: 0,
    wakeTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    emptyEnds: 0,
    lastText: "",
    lastAt: 0,
    speaking: false,
  });
  const [ui, setUi] = useState({
    shown: false,
    wanted: false,
    listening: false,
    mode: "control" as VoiceMode,
    status: "Mikrofon tidak aktif",
  });

  const voiceUI = useCallback((message?: string) => {
    const s = session.current;
    setUi((u) => ({
      shown: true,
      wanted: s.wanted,
      listening: s.listening,
      mode: s.mode,
      status: message || u.status,
    }));
  }, []);

  const stop = useCallback(
    (message = "Mikrofon berhenti.") => {
      const s = session.current;
      s.wanted = false;
      s.listening = false;
      clearTimeout(s.restart);
      clearTimeout(s.wakeTimer);
      s.wakeUntil = 0;
      try {
        s.recognizer?.abort();
      } catch {}
      s.recognizer = null;
      voiceUI(message);
      appRef.current.announce(message);
    },
    [voiceUI],
  );

  const listenRef = useRef<() => void>(() => {});
  const schedule = useCallback(() => {
    const s = session.current;
    clearTimeout(s.restart);
    if (
      shouldRetryRecognition({
        wanted: s.wanted,
        speaking: s.speaking,
        hidden: document.hidden,
        emptyEnds: s.emptyEnds,
        maxEmptyEnds: s.mode === "wake" ? Number.POSITIVE_INFINITY : MAX_EMPTY_VOICE_ENDS,
      })
    ) {
      s.restart = setTimeout(() => listenRef.current(), 400);
    }
  }, []);

  useEffect(() => {
    const s = session.current;
    setSpeechHooks({
      before: () => {
        s.speaking = true;
        s.listening = false;
        s.wakeUntil = 0;
        clearTimeout(s.wakeTimer);
        clearTimeout(s.restart);
        const recognition = s.recognizer;
        s.recognizer = null;
        try { recognition?.abort(); } catch {}
        if (s.wanted) voiceUI("mikrofon dijeda selama suara dibacakan.");
      },
      after: () => {
        s.speaking = false;
        if (s.wanted) schedule();
      },
    });
    return () => {
      s.wanted = false;
      clearTimeout(s.restart);
      clearTimeout(s.wakeTimer);
      const recognition = s.recognizer;
      s.recognizer = null;
      try { recognition?.abort(); } catch {}
      setSpeechHooks({ before: () => {}, after: () => {} });
    };
  }, [schedule, voiceUI]);

  const feedback = useCallback(
    (message: string) => {
      voiceUI(message);
      appRef.current.toast(message);
    },
    [voiceUI],
  );

  const help = useCallback(() => {
    appRef.current.modal({
      title: "Panduan kendali suara",
      confirmLabel: "Tutup",
      body: (
        <>
          <p>Tekan mikrofon, setujui izin, lalu ucapkan salah satu perintah. Mikrofon tidak otomatis menyala saat aplikasi dibuka.</p>
          <ul className="voice-help-list">
            <li>Cari Puskesmas Mergangsan</li>
            <li>Buka beranda / pengaturan / keluarga / bantuan</li>
            <li>Mulai perjalanan / Ulangi petunjuk / Langkah berikutnya</li>
            <li>Jeda perjalanan / Lanjutkan perjalanan</li>
            <li>Buka panel / Tutup panel / Gulir ke bawah</li>
            <li>Pilih kondisi kursi roda / penglihatan menurun</li>
            <li>Teks lebih besar / Teks standar</li>
            <li>Baca halaman</li>
            <li>Berhenti mendengarkan</li>
            <li>Mode opsional: Halo Unstoppable, buka beranda. Ucapkan frasa lagi untuk setiap perintah; setelah frasa saja, lanjutkan dalam 8 detik.</li>
          </ul>
          <p>
            Perintah berlaku pada halaman yang sesuai. Aksi yang membutuhkan konfirmasi tetap menggunakan dialog dan tombol. SOS tetap perlu
            ditahan 1,5 detik.
          </p>
        </>
      ),
    });
  }, []);

  const run = useCallback(
    (raw: string): boolean => {
      const { go, openPlace, update, stateRef } = appRef.current;
      const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
      const text = normalizeVoiceCommand(String(raw));
      if (!text) return false;
      if (/^(berhenti mendengarkan|matikan mikrofon|hentikan suara|stop)$/.test(text)) {
        stop();
        return true;
      }
      if ($("dialog[open]")) {
        feedback("Ada konfirmasi terbuka. Gunakan tombol pada dialog untuk melanjutkan.");
        return false;
      }
      if (isSensitiveVoiceCommand(text)) {
        feedback("Periksa isian lalu gunakan tombol untuk menyetujui atau mengirim. Suara tidak mengirim formulir.");
        return false;
      }
      const senior = isSeniorRole(stateRef.current);
      const routes: Record<string, string> = {
        beranda: "home",
        pengaturan: "settings",
        keluarga: senior ? "caregiver-link" : "caregiver",
        tempat: "home",
        "peta sekitar": "home",
        bantuan: "help",
        "panduan suara": "voice-settings",
        "bahasa dan suara": "voice-settings",
        "ai planner": "ai-planner",
        "perencana perjalanan": "ai-planner",
        "perencana ai": "ai-planner",
        pendamping: "assistance",
        "minta pendamping": "assistance",
        "laporkan hambatan": "report",
        "lapor hambatan": "report",
        "rute tersimpan": "saved",
        "riwayat perjalanan": "history",
        notifikasi: "notifications",
        "cari rute": "search",
        pencarian: "search",
        komunitas: "communities",
        "pilih kondisi": "profile",
        "kondisi anda": "profile",
      };
      const page = text.replace(/^(buka|ke|pergi ke|tampilkan) /, "");
      if (routes[page]) {
        go(routes[page]);
        feedback("Membuka " + page + ".");
        return true;
      }
      if (/^(buka )?(sos|darurat|tolong)$/.test(text)) {
        go("sos");
        feedback("Layar SOS dibuka. Tahan tombol SOS selama 1,5 detik untuk mengaktifkan simulasi.");
        return true;
      }
      if (/^(cari|tujuan|pergi ke) /.test(text)) {
        const query = text.replace(/^(cari|tujuan|pergi ke) /, "").trim();
        let matches = DESTINATIONS.filter((d) => d.toLowerCase().includes(query));
        if (!matches.length) {
          const tokens = query.split(" ").filter((t) => t.length > 2);
          matches = DESTINATIONS.filter((d) => tokens.length && tokens.every((t) => d.toLowerCase().includes(t)));
        }
        if (matches.length === 1) {
          openPlace(matches[0]);
          const p = placeByName(matches[0]);
          feedback("Membuka detail " + matches[0]);
          if (stateRef.current.voice)
            speakRaw(
              `${matches[0]}. ${p?.surveyedAt ? "Kondisi jalur disurvei " + p.surveyedAt : "Kondisi jalur belum disurvei"}. Tekan Cari rute ke sini untuk melanjutkan.`,
              stateRef.current.voiceRate,
            );
          return true;
        }
        go("search");
        const open = (tries = 0) => {
          if (searchControl.current) searchControl.current.openWith(query);
          else if (tries < 40) setTimeout(() => open(tries + 1), 30);
        };
        setTimeout(open, 30);
        feedback(
          matches.length
            ? "Ada beberapa tujuan. Ucapkan nama yang lebih lengkap."
            : "Tujuan belum ditemukan. Periksa nama atau gunakan daftar pencarian.",
        );
        return true;
      }
      const actionMap: Record<string, string> = {
        "mulai perjalanan": "start-trip",
        "ulangi petunjuk": "repeat",
        ulangi: "repeat",
        "langkah berikutnya": "next-step",
        "petunjuk berikutnya": "next-step",
        "baca rute": "listen-route",
        "perbesar peta": "zoom-in",
        "perkecil peta": "zoom-out",
        "simpan rute": "save-route",
        "akhiri perjalanan": "end-trip",
      };
      if (actionMap[text]) {
        const button = $(`[data-action="${actionMap[text]}"]`) as HTMLButtonElement | null;
        if (!button || button.disabled) {
          feedback("Perintah ini belum tersedia pada halaman sekarang.");
          return false;
        }
        button.click();
        feedback("Perintah diterapkan: " + text + ".");
        return true;
      }
      if (text === "jeda perjalanan" || text === "lanjutkan perjalanan") {
        if (currentRoute() !== "trip") {
          feedback("Buka perjalanan aktif terlebih dahulu.");
          return false;
        }
        const pause = text === "jeda perjalanan";
        if (stateRef.current.paused !== pause) $('[data-action="pause"]')?.click();
        feedback(pause ? "Perjalanan dijeda." : "Perjalanan dilanjutkan.");
        return true;
      }
      if (["teks lebih besar", "teks lebih kecil", "teks standar"].includes(text)) {
        const large = text === "teks lebih besar";
        update({ large });
        feedback(large ? "Teks lebih besar aktif." : "Ukuran teks awal aktif.");
        return true;
      }
      if (text === "baca halaman") {
        const region = $(".mf-sheet") || $("main");
        if (region) speakRaw(region.innerText.slice(0, 1800), stateRef.current.voiceRate);
        return !!region;
      }
      if (text === "buka panel" || text === "tutup panel") {
        if (!sheetControl.current) {
          feedback("Halaman ini tidak memiliki panel peta.");
          return false;
        }
        sheetControl.current.set(text === "buka panel" ? "full" : "peek");
        return true;
      }
      if (text === "gulir ke bawah" || text === "gulir ke atas") {
        const region = sheetControl.current?.scroller() || $("main");
        const delta = (text === "gulir ke bawah" ? 1 : -1) * innerHeight * 0.55;
        if (region && region.scrollHeight > region.clientHeight) region.scrollBy({ top: delta, behavior: "auto" });
        else window.scrollBy({ top: delta, behavior: "auto" });
        return true;
      }
      const condition = text.match(/^(?:pilih|ubah) kondisi (.+)$/);
      if (condition) {
        const id = (
          {
            "kursi roda": "wheelchair",
            "penglihatan menurun": "low_vision",
            "penglihatan berat terganggu": "blind",
            walker: "crutches",
            tongkat: "crutches",
            "walker atau tongkat": "crutches",
          } as Record<string, ProfileId>
        )[condition[1]];
        if (id && senior) {
          update({ profiles: [id] });
          feedback("Kondisi dipilih: " + PROFILE_SHORT[id]);
          return true;
        }
      }
      const field = text.match(/^isi (nama|telepon|nomor telepon|titik temu|catatan|deskripsi) (.+)$/);
      if (field) {
        const name = (
          {
            nama: "name",
            telepon: "phone",
            "nomor telepon": "phone",
            "titik temu": "meeting",
            catatan: "notes",
            deskripsi: "description",
          } as Record<string, string>
        )[field[1]];
        const input = $(`[name="${name}"]`) as HTMLInputElement | null;
        if (input && !input.disabled && !input.readOnly) {
          const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, raw.slice(raw.toLowerCase().indexOf(field[2])));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
          feedback("Kolom " + field[1] + " diisi.");
          return true;
        }
      }
      if (text === "langkah sebelumnya") {
        const b = $('[data-action="onboard-back"]');
        if (b) {
          b.click();
          return true;
        }
      }
      const otp = text.match(/^isi kode (.+)$/);
      if (otp && currentRoute() === "otp") {
        const words: Record<string, string> = {
          nol: "0",
          satu: "1",
          dua: "2",
          tiga: "3",
          empat: "4",
          lima: "5",
          enam: "6",
          tujuh: "7",
          delapan: "8",
          sembilan: "9",
        };
        const code = otp[1]
          .split(" ")
          .map((x) => words[x] || x)
          .join("")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (code.length === 6) {
          document.querySelectorAll<HTMLInputElement>(".otp-inputs input").forEach((e, i) => (e.value = code[i]));
          feedback("Enam digit kode diisi. Periksa lalu kirim formulir.");
          return true;
        }
      }
      const role = text.match(/^pilih peran (lansia|keluarga|relawan)$/);
      if (role) {
        const id = ({ lansia: "blind_user", keluarga: "caregiver", relawan: "volunteer" } as Record<string, string>)[role[1]];
        const button = $(`.role-fieldset [data-role="${id}"]`);
        if (button) {
          button.click();
          feedback("Peran dipilih: " + role[1]);
          return true;
        }
      }
      feedback("Perintah belum dikenali. Ucapkan Buka beranda, Cari puskesmas, atau buka Panduan suara.");
      return false;
    },
    [feedback, stop],
  );

  const listen = useCallback(() => {
    const s = session.current;
    if (!s.wanted || s.speaking || document.hidden) return;
    const Recognition = getRecognition();
    if (!Recognition) {
      stop();
      appRef.current.toast("Browser ini belum mendukung pengenalan suara. Gunakan pencarian teks atau keyboard.");
      return;
    }
    const recognition = new Recognition();
    s.recognizer = recognition;
    recognition.lang = "id-ID";
    recognition.continuous = s.mode !== "search";
    let receivedResult = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (recognition !== s.recognizer || !s.wanted) return;
      s.listening = true;
      const wakeArmed = s.mode === "wake" && s.wakeUntil > Date.now();
      voiceUI(
        s.mode === "search"
          ? "Ucapkan nama tujuan."
          : s.mode === "wake"
            ? wakeArmed
              ? "Ya, ucapkan satu perintah dalam 8 detik."
              : `Menunggu ${WAKE_PHRASE}. Hanya saat tab aktif.`
            : "Ucapkan perintah, misalnya Buka beranda.",
      );
    };
    recognition.onresult = (e) => {
      if (recognition !== s.recognizer || document.hidden) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result.isFinal || !s.wanted || s.speaking) continue;
        const t = result[0].transcript.trim(),
          now = Date.now();
        if (t === s.lastText && now - s.lastAt < 1200) continue;
        receivedResult = true;
        s.emptyEnds = 0;
        s.lastText = t;
        s.lastAt = now;
        if (s.mode === "search") {
          stop("Pencarian suara selesai.");
          run(/^cari\b/i.test(t) ? t : "cari " + t);
        } else if (s.mode === "wake") {
          const gated = gateWakeCommand(t, s.wakeUntil, now);
          s.wakeUntil = gated.armedUntil;
          clearTimeout(s.wakeTimer);
          if (gated.command) {
            run(gated.command);
            if (s.wanted) voiceUI(`Menunggu ${WAKE_PHRASE} untuk perintah berikutnya.`);
          } else if (s.wakeUntil) {
            feedback("Ya, silakan ucapkan satu perintah dalam 8 detik.");
            s.wakeTimer = setTimeout(() => {
              s.wakeUntil = 0;
              if (s.wanted) voiceUI(`Waktu perintah habis. Ucapkan ${WAKE_PHRASE} lagi.`);
            }, VOICE_WAKE_WINDOW_MS);
          }
        } else run(t);
      }
    };
    recognition.onerror = (e) => {
      if (recognition !== s.recognizer) return;
      if (ERRORS[e.error]) {
        stop(ERRORS[e.error]);
        appRef.current.toast(ERRORS[e.error]);
      } else if (e.error === "no-speech") voiceUI("Belum terdengar ucapan. Silakan coba lagi.");
      else if (e.error !== "aborted") stop("Pengenalan suara berhenti. Tekan mikrofon untuk mencoba lagi.");
    };
    recognition.onend = () => {
      if (recognition !== s.recognizer) return;
      s.listening = false;
      s.recognizer = null;
      if (document.hidden) {
        stop("Mikrofon berhenti karena tab tidak aktif.");
        return;
      }
      if (!receivedResult && s.mode !== "wake" && ++s.emptyEnds >= MAX_EMPTY_VOICE_ENDS) {
        stop("Mikrofon berhenti setelah beberapa sesi tanpa ucapan. Tekan tombol untuk mulai lagi.");
        return;
      }
      voiceUI();
      schedule();
    };
    try {
      recognition.start();
    } catch {
      stop();
      appRef.current.toast("Mikrofon belum dapat dimulai. Coba kembali melalui tombol suara.");
    }
  }, [feedback, run, schedule, stop, voiceUI]);
  useLayoutEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const request = useCallback(
    (mode: VoiceMode) => {
      const { modal } = appRef.current;
      if (session.current.wanted) {
        if (session.current.mode === mode) {
          stop();
          return;
        }
        stop("Mengganti mode suara.");
      }
      if (!getRecognition()) {
        modal({
          title: "Pengenalan suara belum tersedia",
          confirmLabel: "Lihat panduan",
          body: (
            <>
              <p>Browser ini belum menyediakan pengenalan ucapan. Pencarian teks dan semua tombol tetap dapat digunakan.</p>
              <p>Coba browser yang mendukung Web Speech melalui HTTPS atau localhost. Buka panduan untuk melihat perintah yang tersedia.</p>
            </>
          ),
          onConfirm: () => {
            setTimeout(help, 0);
          },
        });
        return;
      }
      modal({
        title: mode === "search" ? "Cari tujuan dengan suara" : mode === "wake" ? `Aktifkan ${WAKE_PHRASE}` : "Aktifkan kendali suara",
        confirmLabel: "Izinkan & mulai",
        body: (
          <>
            <p>
              {mode === "search"
                ? "Ucapkan satu tujuan. Mikrofon berhenti setelah hasil diterima."
                : mode === "wake"
                  ? `Setelah Anda mulai, ucapkan ${WAKE_PHRASE} diikuti perintah. Frasa saja membuka waktu 8 detik untuk satu perintah. Mikrofon berhenti jika tab disembunyikan, aplikasi berpindah ke latar belakang, atau layar terkunci.`
                  : "Mikrofon mendengarkan perintah selama tab ini aktif, sampai Anda memilih Berhenti."}
            </p>
            <p>
              Browser akan meminta izin mikrofon. Audio dapat dikirim ke layanan pengenalan suara milik penyedia browser dan mungkin
              membutuhkan internet. Aplikasi tidak menyimpan audio atau transkrip.
            </p>
            <p>Perintah SOS hanya membuka layar SOS. Pengiriman SOS, pemesanan pendamping, dan pengiriman formulir tetap memerlukan tombol konfirmasi.</p>
          </>
        ),
        onConfirm: () => {
          const s = session.current;
          s.mode = mode;
          s.wanted = true;
          s.speaking = false;
          s.lastText = "";
          s.emptyEnds = 0;
          s.wakeUntil = 0;
          listen();
          setUi((u) => ({ ...u, wanted: true, mode }));
        },
      });
    },
    [help, listen, stop],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && session.current.wanted) stop("Mikrofon berhenti karena tab tidak aktif.");
    };
    const onHide = () => stop();
    document.addEventListener("visibilitychange", onVis);
    addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pagehide", onHide);
    };
  }, [stop]);

  const value = useMemo(
    () => ({ wanted: ui.wanted, listening: ui.listening, mode: ui.mode, request, stop, help }),
    [ui.wanted, ui.listening, ui.mode, request, stop, help],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {ui.shown &&
        createPortal(
          <details id="voice-session" className="voice-session" aria-label="Status mikrofon" hidden={!ui.wanted && !ui.listening}>
            <summary>
              <span className="voice-dot" aria-hidden="true"></span>
              <span>
                {ui.listening
                  ? ui.mode === "wake"
                    ? `Mode ${WAKE_PHRASE}`
                    : "Mendengarkan"
                  : ui.wanted
                    ? "Mikrofon dijeda"
                    : "Mikrofon berhenti"}
              </span>
            </summary>
            <p id="voice-status" role="status" aria-live="polite">
              {ui.status}
            </p>
            <div className="row">
              <button type="button" className="btn" data-voice="help" onClick={help}>
                Panduan
              </button>
              <button type="button" className="btn" data-voice="stop" onClick={() => stop()}>
                <Icon name="mic-off" />
                Berhenti
              </button>
            </div>
          </details>,
          document.body,
        )}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside VoiceProvider");
  return ctx;
}

export function VoiceButton({
  mode,
  className,
  children,
  label,
}: {
  mode: VoiceMode | "help";
  className?: string;
  children: React.ReactNode;
  label?: string;
}) {
  const v = useVoice();
  const isToggle = mode === "control" || mode === "wake";
  const isTopbar = className?.includes("voice-control");
  const isActive = v.wanted && v.mode === mode;
  return (
    <button
      type="button"
      className={className}
      data-voice={mode}
      aria-label={isTopbar ? (v.wanted ? "Hentikan kendali suara" : "Aktifkan kendali suara") : label}
      aria-pressed={isToggle ? isActive : undefined}
      onClick={() => (mode === "help" ? v.help() : v.request(mode))}
    >
      {children}
    </button>
  );
}
