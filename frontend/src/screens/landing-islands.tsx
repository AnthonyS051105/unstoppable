"use client";

import { useEffect, useRef, useState } from "react";
import { Brand, Icon, LinkBtn } from "@/components/ui";
import type { LocationSharingMode } from "@/types/api";

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (open) {
      navRef.current?.querySelector<HTMLElement>("a")?.focus();
    } else {
      toggleRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "Tab" && navRef.current) {
        const items = [
          toggleRef.current,
          ...navRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
        ].filter((el): el is HTMLElement => !!el && el.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.(".landing-nav")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClickOutside);
    };
  }, [open]);

  return (
    <header className={`landing-nav ${open ? "menu-open" : ""}`}>
      <Brand />
      <button
        ref={toggleRef}
        type="button"
        className="btn btn-round ghost mobile-menu landing-menu-toggle"
        aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
        aria-expanded={open}
        aria-controls="landing-nav-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? "x" : "menu"} />
      </button>
      <nav
        id="landing-nav-menu"
        ref={navRef}
        aria-label="Navigasi landing"
        className={open ? "open" : undefined}
        onClick={(e) => {
          if ((e.target as Element).closest?.("a")) setOpen(false);
        }}
      >
        <a href="#tentang" data-scroll="tentang">
          Tentang
        </a>
        <a href="#cara-kerja" data-scroll="cara-kerja">
          Cara kerja
        </a>
        <a href="#fitur" data-scroll="fitur">
          Fitur
        </a>
        <div className="landing-mobile-actions">
          <LinkBtn label="Masuk" route="login" kind="ghost" />
          <LinkBtn label="Daftar" route="register" kind="primary" />
        </div>
      </nav>
      <div className="row landing-desktop-actions">
        <LinkBtn label="Masuk" route="login" kind="ghost" />
        <LinkBtn label="Daftar" route="register" kind="primary" />
      </div>
    </header>
  );
}

export function ScrollLinks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.<HTMLElement>("[data-scroll]");
      if (!a) return;
      e.preventDefault();
      document
        .getElementById(a.dataset.scroll!)
        ?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

export function StickyStories() {
  useEffect(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".lp-story")];
    const fit = () => {
      const base = matchMedia("(max-width:960px)").matches ? 16 : 28;
      for (const c of cards) c.style.setProperty("--lp-stick", Math.min(base, innerHeight - c.offsetHeight - 12) + "px");
    };
    const ro = new ResizeObserver(fit);
    cards.forEach((c) => ro.observe(c));
    addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      removeEventListener("resize", fit);
    };
  }, []);
  return null;
}

export function RouteStory() {
  const [cond, setCond] = useState<"wheelchair" | "low_vision" | null>(null);
  const wheel = cond !== "low_vision";
  return (
    <section className="lp-story lp-route-story" aria-labelledby="lp-route-title">
      <div className="lp-story-copy">
        <span className="lp-eyebrow">01. RENCANAKAN</span>
        <h2 id="lp-route-title">
          Tujuan sama.
          <br />
          Jalan yang berbeda.
        </h2>
        <p>Pilih kondisi untuk melihat bagaimana rute dapat berubah.</p>
        <div className="lp-segments" role="group" aria-label="Contoh kondisi perjalanan">
          <button type="button" data-lp-condition="wheelchair" aria-pressed={wheel} onClick={() => setCond("wheelchair")}>
            <Icon name="accessibility" />
            Kursi roda
          </button>
          <button type="button" data-lp-condition="low_vision" aria-pressed={!wheel} onClick={() => setCond("low_vision")}>
            <Icon name="eye" />
            Penglihatan menurun
          </button>
        </div>
        <div id="lp-route-explanation" aria-live="polite">
          <p>
            {wheel
              ? "Memutar melalui ramp agar tidak melewati tangga. Jalur lebih panjang, tetapi sesuai untuk kursi roda."
              : "Mengikuti ubin pemandu dan penyeberangan yang jelas. Tangga tetap dapat dilalui sesuai kemampuan yang dipilih."}
          </p>
          <dl className="lp-metrics">
            <div>
              <dt>Jarak</dt>
              <dd>{`${wheel ? "412" : "260"} m`}</dd>
            </div>
            <div>
              <dt>Waktu</dt>
              <dd>{`${wheel ? "9" : "5"} menit`}</dd>
            </div>
            <div>
              <dt>Anak tangga</dt>
              <dd>{wheel ? "0" : "4"}</dd>
            </div>
          </dl>
        </div>
        <LinkBtn label="Bandingkan empat kondisi" route="compare" kind="lp-story-action" icon="git-compare-arrows" />
      </div>
      <div className="lp-route-visual">
        <div className="lp-map-title">Rumah ke Puskesmas Mergangsan</div>
        <svg viewBox="0 0 520 350" role="img" aria-label="Dua contoh jalur: garis utuh melalui ramp, garis putus-putus dengan ubin pemandu">
          <rect width="520" height="350" rx="18" fill="#e1e8dc" />
          <g fill="#c9d7c1">
            <rect x="28" y="34" width="85" height="70" rx="10" />
            <rect x="150" y="20" width="110" height="90" rx="10" />
            <rect x="300" y="25" width="185" height="80" rx="10" />
            <rect x="40" y="155" width="125" height="150" rx="10" />
            <rect x="220" y="170" width="110" height="135" rx="10" />
            <rect x="380" y="168" width="100" height="140" rx="10" />
          </g>
          <path d="M0 130H520M190 0V350M350 0V350" stroke="#fdfcf6" strokeWidth="30" />
          <path
            className="lp-demo-route lp-wheel-route"
            d="M65 130H190V325H350V130H450"
            fill="none"
            stroke="#11132d"
            strokeWidth="7"
            strokeLinejoin="round"
            style={cond ? { opacity: wheel ? "1" : ".25" } : undefined}
          />
          <path
            className="lp-demo-route lp-vision-route"
            d="M65 130H450"
            fill="none"
            stroke="#355640"
            strokeWidth="7"
            strokeDasharray="12 9"
            opacity=".35"
            style={cond ? { opacity: wheel ? ".25" : "1" } : undefined}
          />
          <circle cx="65" cy="130" r="12" fill="#fff" stroke="#11132d" strokeWidth="5" />
          <circle cx="450" cy="130" r="12" fill="#ffc629" stroke="#11132d" strokeWidth="5" />
          <rect x="333" y="292" width="35" height="28" rx="6" fill="#fff" />
          <path d="M340 312L361 298" stroke="#11132d" strokeWidth="3" />
        </svg>
        <div className="lp-map-legend">
          <span>
            <i className="lp-line"></i>Kursi roda: melalui ramp
          </span>
          <span>
            <i className="lp-line dashed"></i>Penglihatan menurun: ubin pemandu
          </span>
        </div>
      </div>
    </section>
  );
}

export function FamilyDemo() {
  const [mode, setMode] = useState<LocationSharingMode>("during_trip");
  const opts = [
    ["during_trip", "Selama perjalanan"],
    ["sos_only", "Saat darurat"],
    ["off", "Tidak berbagi"],
  ] as const;
  return (
    <div className="lp-family-demo">
      <div className="lp-segments" role="group" aria-label="Contoh mode berbagi lokasi">
        {opts.map(([v, t]) => (
          <button key={v} type="button" data-lp-sharing={v} aria-pressed={mode === v} onClick={() => setMode(v)}>
            {t}
          </button>
        ))}
      </div>
      <div id="lp-sharing-explanation" aria-live="polite">
        {mode === "during_trip" ? (
          <>
            <h3>
              <Icon name="users" />
              Keluarga melihat perjalanan Anda
            </h3>
            <p>Lokasi dibagikan sejak berangkat hingga perjalanan selesai.</p>
            <ol className="lp-timeline">
              <li>
                <Icon name="navigation" />
                <span>
                  <strong>Berangkat</strong>
                  <small>Dari rumah menuju puskesmas</small>
                </span>
              </li>
              <li>
                <Icon name="route" />
                <span>
                  <strong>Dalam perjalanan</strong>
                  <small>Lokasi diperbarui selama perjalanan</small>
                </span>
              </li>
              <li>
                <Icon name="check" />
                <span>
                  <strong>Sampai</strong>
                  <small>Berbagi lokasi perjalanan berakhir</small>
                </span>
              </li>
            </ol>
          </>
        ) : mode === "sos_only" ? (
          <>
            <h3>
              <Icon name="shield-check" />
              Lokasi hanya saat darurat
            </h3>
            <p>Keluarga tidak melihat posisi saat perjalanan biasa. Lokasi baru tersedia ketika SOS aktif.</p>
            <div className="lp-timeline">
              <strong>Perjalanan biasa: lokasi tidak dibagikan.</strong>
              <strong>SOS aktif: keluarga dapat melihat lokasi.</strong>
            </div>
          </>
        ) : (
          <>
            <h3>
              <Icon name="eye-off" />
              Lokasi tidak dibagikan
            </h3>
            <p>Keluarga tidak melihat lokasi dan tidak menerima kabar perjalanan dari akun Anda.</p>
            <div className="lp-timeline">
              <strong>Anda tetap dapat mencari dan mengikuti rute.</strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
