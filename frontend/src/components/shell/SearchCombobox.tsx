"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Circle, Icon } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { searchControl } from "@/lib/controls";
import { DESTINATIONS, NEARBY, destNote } from "@/lib/data";
import type { DemoState } from "@/lib/demo-state";
import { searchLocations, type LocationValue } from "@/lib/geocode";

type Item = { k: "dest" | "svc" | "ext"; v: string; sub: string; ico: string; loc?: LocationValue };

function sections(state: DemoState, query: string, ext: LocationValue[] = []) {
  const q = query.trim().toLowerCase();
  const hit = (t: string) => !q || t.toLowerCase().includes(q);
  const out: { t: string; items: Item[] }[] = [];
  if (!q) {
    if (state.recent.length)
      out.push({ t: "Terakhir dicari", items: state.recent.map((d) => ({ k: "dest", v: d, sub: destNote(d), ico: "history" })) });
    const more = DESTINATIONS.filter((d) => !state.recent.includes(d));
    if (more.length)
      out.push({ t: "Rekomendasi tujuan", items: more.slice(0, 4).map((d) => ({ k: "dest", v: d, sub: destNote(d), ico: "map-pin" })) });
  } else {
    const d = DESTINATIONS.filter(hit);
    if (d.length) out.push({ t: "Tujuan", items: d.map((x) => ({ k: "dest", v: x, sub: destNote(x), ico: "map-pin" })) });
  }
  const sv = NEARBY.filter(([t]) => hit(t));
  if (sv.length) out.push({ t: "Layanan di sekitar", items: sv.map(([t, m, i]) => ({ k: "svc", v: t, sub: m, ico: i })) });

  const shown = new Set(out.flatMap((s) => s.items.map((i) => i.v.toLowerCase())));
  const more = q ? ext.filter((l) => !shown.has(l.name.toLowerCase())) : [];
  if (more.length)
    out.push({ t: "Lokasi lainnya", items: more.map((l) => ({ k: "ext", v: l.name, sub: l.address, ico: "map-pin", loc: l })) });
  return out;
}

export function SearchCombobox({ cls }: { cls: string }) {
  const { state, update, announce, openPlace, openLocation } = useApp();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [ext, setExt] = useState<{ q: string; items: LocationValue[]; state: "idle" | "loading" | "error" }>({
    q: "",
    items: [],
    state: "idle",
  });
  const q3 = query.trim().length >= 3;
  const extItems = q3 && ext.q === query.trim() ? ext.items : [];
  const secs = open ? sections(state, query, extItems) : [];
  const flat = secs.flatMap((s) => s.items);

  const setOpenState = (on: boolean) => {
    setOpen(on);
    if (!on) setActive(-1);
  };

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setExt((e) => ({ ...e, state: "loading" }));
      try {
        const items = await searchLocations(q, ctrl.signal);
        setExt({ q, items, state: "idle" });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setExt({ q, items: [], state: "error" });
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  useLayoutEffect(() => {
    document.body.classList.toggle("search-open", open);
    return () => document.body.classList.remove("search-open");
  }, [open]);

  useEffect(() => {
    searchControl.current = {
      openWith: (q) => {
        setQuery(q);
        setActive(-1);
        setOpen(true);
        inputRef.current?.focus();
      },
    };
    return () => {
      searchControl.current = null;
    };
  }, []);

  useEffect(() => {
    if (active >= 0) listRef.current?.querySelector(`#so-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    const outside = (e: Event) => {
      if (!(e.target as Element).closest?.('[data-form="global-search"]')) setOpenState(false);
    };
    document.addEventListener("click", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("focusin", outside);
    };
  }, []);

  const pick = (it: Item) => {
    if (it.k === "ext" && it.loc) {
      setQuery("");
      setOpenState(false);
      openLocation(it.loc);
      return;
    }
    setQuery("");
    setOpenState(false);
    openPlace(it.v);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = open ? flat : sections(state, query).flatMap((s) => s.items);
      if (!open) setOpen(true);
      if (!items.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a < 0 ? (d > 0 ? 0 : items.length - 1) : (a + d + items.length) % items.length));
      return;
    }
    if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      pick(flat[active]);
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpenState(false);
      } else if (query) {
        e.stopPropagation();
        setQuery("");
      }
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase(),
      m = q ? DESTINATIONS.filter((d) => d.toLowerCase().includes(q)) : [];
    if (m.length) {
      setQuery("");
      setOpenState(false);
      openPlace(m[0]);
    } else {
      setOpen(true);
      if (q) announce("Tujuan belum ditemukan");
    }
  };

  let n = 0;
  return (
    <form className={`search ${cls}`} data-form="global-search" role="search" autoComplete="off" onSubmit={onSubmit}>
      <Icon name="search" />
      <input
        ref={inputRef}
        name="query"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="search-list"
        aria-autocomplete="list"
        aria-label="Cari tujuan"
        aria-activedescendant={open && active >= 0 ? `so-${active}` : undefined}
        placeholder="Cari gedung, ruang, atau layanan"
        autoComplete="off"
        value={query}
        onClick={() => !open && setOpen(true)}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setActive(-1);
          if (!open) setOpen(true);
          else if (v.trim()) {
            const count = sections(state, v).flatMap((s) => s.items).length;
            announce(count ? count + " hasil" : "Tujuan belum ditemukan");
          }
        }}
        onKeyDown={onKeyDown}
      />
      <button className="btn ghost btn-round" type="submit" aria-label="Cari">
        <Icon name="search" />
      </button>
      <div className="search-pop" id="search-pop" hidden={!open}>
        <div className="pop-bar">
          <strong>Cari tujuan</strong>
          <button
            type="button"
            className="btn btn-round ghost"
            data-action="search-close"
            aria-label="Tutup pencarian"
            onClick={() => {
              setOpenState(false);
              inputRef.current?.focus();
            }}
          >
            <Icon name="x" />
          </button>
        </div>
        <div role="listbox" id="search-list" aria-label="Saran tujuan" ref={listRef}>
          {open && !secs.length && !(q3 && ext.state === "loading") ? (
            <p className="pop-empty">Tujuan belum ditemukan. Coba nama gedung lain.</p>
          ) : null}
          {secs.map((c, si) => (
            <div key={c.t} role="group" aria-labelledby={`pop-h${si}`}>
              <div className="pop-title" id={`pop-h${si}`} role="presentation">
                {c.t}
              </div>
              {c.items.map((it) => {
                const idx = n++;
                return (
                  <div
                    key={it.k + it.v}
                    role="option"
                    id={`so-${idx}`}
                    className="pop-opt"
                    aria-selected={idx === active}
                    data-kind={it.k}
                    data-value={it.v}
                    onClick={() => pick(it)}
                  >
                    <Circle icon={it.ico} />
                    <span>
                      <strong>{it.v}</strong>
                      <small>{it.sub}</small>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {open && q3 && ext.state === "loading" ? <p className="pop-empty">Mencari lokasi lainnya…</p> : null}
        {open && q3 && ext.state === "error" ? (
          <p className="pop-empty">Pencarian lokasi lain sedang tidak tersedia. Tujuan di atas tetap dapat dipilih.</p>
        ) : null}
        <div className="pop-foot" hidden={!!query.trim() || !state.recent.length}>
          <button
            type="button"
            className="link"
            data-action="clear-recent"
            onClick={() => {
              update({ recent: [] });
              announce("Riwayat pencarian dihapus.");
            }}
          >
            Hapus riwayat pencarian
          </button>
        </div>
      </div>
    </form>
  );
}
