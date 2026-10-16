"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRoute } from "@/components/shared";
import { Avatar, Badge, Brand, Btn, EmptyState, Icon, LinkBtn } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { VoiceButton } from "@/contexts/VoiceContext";
import { useApp } from "@/hooks/useApp";
import { activeNav, denial, href, isSeniorRole, navItems, roleHome, type Denial } from "@/lib/access";
import { filterControl, sheetControl } from "@/lib/controls";
import { ROLE_LABEL } from "@/lib/data";
import { cancelActiveHold } from "@/lib/sos-hold";
import { ConnectionNotice } from "./ConnectionNotice";
import { SearchCombobox } from "./SearchCombobox";
import { SosFab } from "./SosHoldButton";

const BOTTOM_LABEL: Record<string, string> = { Dashboard: "Beranda", Permintaan: "Tugas", Wilayah: "Area", Verifikasi: "Tinjau" };

function Forbidden({ d }: { d: Denial }) {
  const { state } = useApp();
  const msg =
    d.why === "role"
      ? `Halaman ini disediakan untuk ${d.roles.map((x) => ROLE_LABEL[x]).join(" / ")}. Anda masuk sebagai ${ROLE_LABEL[state.role]}.`
      : d.cap === "verified"
        ? "Akun relawan Anda belum terverifikasi. Fitur ini aktif setelah verifikator menyetujui pendaftaran Anda."
        : d.cap === "companion"
          ? "Izin pendampingan belum diaktifkan oleh verifikator untuk akun Anda."
          : "Izin pemetaan belum diaktifkan oleh verifikator untuk akun Anda.";
  const vol = state.role === "volunteer" && d.why === "cap";
  return (
    <section className="card">
      <EmptyState
        title="Halaman ini tidak tersedia untuk akun Anda"
        text={msg}
        label={vol ? "Lihat status verifikasi" : "Ke halaman utama"}
        route={vol ? "volunteer-pending" : roleHome(state)}
      />
    </section>
  );
}

/** Shown instead of the app while the session is being restored or could not be restored. */
function SessionGate() {
  const { status, error, restore } = useAuth();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 400);
    return () => clearTimeout(t);
  }, []);
  if (!error && (!slow || status !== "loading")) return null;
  return (
    <div className="auth-bg">
      <main id="main" className="auth-card" aria-busy={!error}>
        <Brand />
        {error ? (
          <>
            <h1>Akun belum dapat dimuat</h1>
            <p role="alert">{error.message}</p>
            <Btn label="Coba lagi" action="session-retry" kind="primary full" onClick={() => void restore()} />
          </>
        ) : (
          <p role="status">Memuat akun Anda…</p>
        )}
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const { state, update, modal, hydrated } = app;
  const auth = useAuth();
  const route = useRoute();
  const router = useRouter();
  const senior = isSeniorRole(state);
  // Server fields in DemoState are mirrored by AuthSync; render only once they belong to the signed-in user.
  const ready = hydrated && auth.status === "authenticated" && state.syncedUserId === auth.user?.id;
  const redirectHome = ready && route === "home" && !senior;

  useEffect(() => {
    if (redirectHome) router.replace(href(roleHome(state)));
  }, [redirectHome, router, state]);

  useEffect(() => {
    if (auth.status === "anonymous") router.replace("/login");
    else if (auth.status === "signed-out") router.replace("/");
  }, [auth.status, router]);

  const menuMounted = useRef(false);
  useEffect(() => {
    if (!menuMounted.current) {
      menuMounted.current = true;
      return;
    }
    document.querySelector<HTMLElement>(state.menu ? ".sidebar-close" : ".mobile-menu")?.focus();
  }, [state.menu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.menu && e.key === "Tab") {
        const items = [
          ...document.querySelectorAll<HTMLElement>(
            ".sidebar a[href],.sidebar button:not([disabled]),.sidebar input,.sidebar select,.sidebar textarea",
          ),
        ].filter((x) => x.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        return;
      }
      if (e.key === "Escape") {
        cancelActiveHold();
        if (state.menu) update({ menu: false });
        else if (filterControl.current?.isOpen()) filterControl.current.close();
        else sheetControl.current?.escape(e);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.menu, update]);

  if (!ready) return <SessionGate />;
  if (redirectHome) return null;

  const nav = navItems(state);
  const active = activeNav(nav, route);
  const bottom = senior ? [nav[0], nav[1], nav[2], nav.find((it) => it[0] === "caregiver-link")!, nav.at(-1)!] : nav;
  const showSearch = senior && !["search", "trip", "sos", "sos-active", "sos-empty"].includes(route);
  const d = denial(state, route);
  const content = d ? <Forbidden d={d} /> : children;
  const toggleMenu = () => update({ menu: !state.menu });

  const hasDrawer = state.role === "caregiver";
  const bottomActive = bottom.some((b) => b[0] === active) ? active : ["communities", "community"].includes(route) ? "settings" : active;

  const openAccessibility = () =>
    modal({
      title: "Aksesibilitas",
      confirmLabel: "Terapkan",
      body: (
        <>
          <p>Gunakan pengaturan teks dan kontras sesuai kebutuhan.</p>
          <label className="check">
            <input type="checkbox" id="modal-large" defaultChecked={state.large} />
            Teks lebih besar
          </label>
          <label className="check" style={{ marginTop: 15 }}>
            <input type="checkbox" id="modal-contrast" defaultChecked={state.contrast} />
            Kontras tinggi
          </label>
        </>
      ),
      onConfirm: (dlg) =>
        update({
          large: dlg.querySelector<HTMLInputElement>("#modal-large")!.checked,
          contrast: dlg.querySelector<HTMLInputElement>("#modal-contrast")!.checked,
        }),
    });

  return (
    <>
      <div className="shell">
        <aside
          id="main-sidebar"
          className={`sidebar ${state.menu ? "open" : ""}`}
          aria-label="Navigasi utama"
          role={state.menu ? "dialog" : undefined}
          aria-modal={state.menu ? "true" : undefined}
        >
          <Btn label="Tutup menu" action="toggle-menu" kind="sidebar-close ghost" icon="x" onClick={toggleMenu} />
          <Brand />
          <nav aria-label="Navigasi utama">
            {nav.map((it) => (
              <Link
                key={it[0]}
                href={href(it[0])}
                className={`nav-item ${active === it[0] ? "active" : ""}`}
                aria-current={active === it[0] ? "page" : undefined}
              >
                <Icon name={it[3]} />
                {it[1]}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="role-card">
              <small>Masuk sebagai</small>
              <strong>{ROLE_LABEL[state.role]}</strong>
              {state.role === "volunteer" ? (
                <Badge label={state.verified ? "Terverifikasi" : "Menunggu verifikasi"} kind={state.verified ? "green" : "yellow"} />
              ) : null}
            </div>
          </div>
        </aside>
        <div className="main-wrap" inert={state.menu}>
          <header className="topbar">
            {hasDrawer ? (
              <Btn
                action="toggle-menu"
                kind="mobile-menu ghost btn-round"
                icon="menu"
                aria-label="Buka menu navigasi"
                aria-expanded={state.menu}
                aria-controls="main-sidebar"
                onClick={toggleMenu}
              />
            ) : null}
            <div className="mobile-brand">
              <Brand />
            </div>
            {showSearch ? <SearchCombobox cls="global-destination-search" /> : null}
            <div className="top-actions">
              <VoiceButton mode="control" className="btn ghost btn-round voice-control">
                <Icon name="mic" />
              </VoiceButton>
              <LinkBtn route="notifications" kind="btn-round ghost notification" icon="bell" />
              <Link href="/settings" className="account">
                <Avatar name={state.name} />
                <span className="name">
                  {state.name}
                  <small>{ROLE_LABEL[state.role]}</small>
                </span>
                <Icon name="chevron-down" />
              </Link>
              <Btn
                action="accessibility"
                kind="btn-round primary"
                icon="person-standing"
                aria-label="Pengaturan aksesibilitas"
                onClick={openAccessibility}
              />
            </div>
          </header>
          <main id="main">
            <ConnectionNotice className="mb-[16px]" />
            {content}
          </main>
        </div>
      </div>
      {state.menu ? (
        <button
          type="button"
          className="menu-backdrop"
          tabIndex={-1}
          data-action="toggle-menu"
          aria-label="Tutup menu navigasi"
          onClick={toggleMenu}
        ></button>
      ) : null}
      {senior ? <SosFab /> : null}
      <nav className="bottom-nav" aria-label="Navigasi mobile" inert={state.menu}>
        {bottom.map((it) => (
          <Link
            key={it[0]}
            href={href(it[0])}
            className={bottomActive === it[0] ? "active" : ""}
            aria-current={bottomActive === it[0] ? "page" : undefined}
          >
            <Icon name={it[3]} />
            {BOTTOM_LABEL[it[2]] || it[2]}
          </Link>
        ))}
      </nav>
    </>
  );
}
