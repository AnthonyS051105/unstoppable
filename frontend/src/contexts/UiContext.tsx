"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cancelActiveHold } from "@/lib/sos-hold";

export type ModalOptions = {
  title: React.ReactNode;
  body: React.ReactNode;
  confirmLabel?: string;

  onConfirm?: ((dialog: HTMLDialogElement) => boolean | void) | null;
  danger?: boolean;

  hideCancel?: boolean;
};

type SkipTargets = { sheetId?: string; sheetLabel?: string; map: boolean } | null;

type Ctx = {
  announce: (text: string) => void;
  toast: (text: string) => void;
  modal: (opts: ModalOptions) => void;
  confirmModal: (title: string, text: string, onConfirm: () => void, danger?: boolean) => void;
  closeModal: () => void;
  setSkipTargets: (t: SkipTargets) => void;
};

const UiContext = createContext<Ctx | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState("");
  const [toastText, setToastText] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [dialog, setDialog] = useState<ModalOptions | null>(null);
  const [skip, setSkipTargets] = useState<SkipTargets>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);

  const announce = useCallback((t: string) => {
    setLive("");
    setTimeout(() => setLive(t), 20);
  }, []);

  const toast = useCallback(
    (t: string) => {
      setToastText(t);
      setToastVisible(true);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastVisible(false), 3500);
      announce(t);
    },
    [announce],
  );

  const modal = useCallback((opts: ModalOptions) => {
    cancelActiveHold();
    returnFocus.current = document.activeElement;
    setDialog(opts);
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!dialog || !d) return;
    if (!d.open) d.showModal();
    const t = setTimeout(() => d.querySelector<HTMLElement>("input,textarea,button")?.focus(), 10);
    return () => clearTimeout(t);
  }, [dialog]);

  const closeModal = useCallback(() => {
    const d = dialogRef.current;
    if (d?.open) d.close();
    setDialog(null);
    const r = returnFocus.current as HTMLElement | null;
    if (r?.isConnected) r.focus();
  }, []);

  const confirmModal = useCallback(
    (title: string, text: string, onConfirm: () => void, danger = true) =>
      modal({ title, body: <p>{text}</p>, confirmLabel: "Konfirmasi", onConfirm, danger }),
    [modal],
  );

  const onConfirm = () => {
    const cb = dialog?.onConfirm;
    if (!cb || cb(dialogRef.current!) !== false) closeModal();
  };

  const value = useMemo(
    () => ({ announce, toast, modal, confirmModal, closeModal, setSkipTargets }),
    [announce, toast, modal, confirmModal, closeModal],
  );

  const skipTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const t = document.getElementById(id);
    if (t) {
      if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
      t.focus();
    }
  };

  return (
    <UiContext.Provider value={value}>
      <a className="skip-link" href="#main" data-skip="main" onClick={(e) => skipTo(e, "main")}>
        Lewati ke konten utama
      </a>
      <a
        className="skip-link"
        id="skip-sheet"
        href="#main"
        data-skip={skip?.sheetId || ""}
        hidden={!skip?.sheetId}
        onClick={(e) => skip?.sheetId && skipTo(e, skip.sheetId)}
      >
        {skip?.sheetLabel || "Lewati ke rincian rute"}
      </a>
      <a
        className="skip-link"
        id="skip-map"
        href="#main"
        data-skip="map-region"
        hidden={!skip?.map}
        onClick={(e) => skipTo(e, "map-region")}
      >
        Lewati peta
      </a>
      {children}
      <div id="live" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </div>
      <div id="toast" role="status" className={toastVisible ? "visible" : undefined}>
        {toastText}
      </div>
      <dialog
        id="dialog"
        aria-labelledby="dialog-title"
        ref={dialogRef}
        onCancel={() => {
          cancelActiveHold();
          setDialog(null);
        }}
      >
        {dialog && (
          <>
            <h2 id="dialog-title">{dialog.title}</h2>
            <div>{dialog.body}</div>
            <div className="row" style={{ marginTop: 20 }}>
              {dialog.hideCancel ? null : (
                <button type="button" className="btn " data-action="dialog-cancel" onClick={closeModal}>
                  Batal
                </button>
              )}
              <button
                type="button"
                className={`btn ${dialog.danger ? "danger" : "primary"}`}
                data-action="dialog-confirm"
                onClick={onConfirm}
              >
                {dialog.confirmLabel || "Konfirmasi"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside UiProvider");
  return ctx;
}
