"use client";

import { useRef, useState } from "react";
import { Btn } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useApp } from "@/hooks/useApp";
import { routesApi } from "@/lib/api/routes";
import { errorMessage } from "@/lib/api-client";
import { canUseLocalRoutes } from "@/lib/stored-routes";
import type { SavedRoute, SaveRouteInput } from "@/types/api";

export function SaveRouteButton({ input }: { input: SaveRouteInput }) {
  const { user, status } = useAuth();
  return <SaveRouteControl key={`${user?.id ?? status}:${JSON.stringify(input)}`} input={input} />;
}

function SaveRouteControl({ input }: { input: SaveRouteInput }) {
  const { status, error: authError, restore } = useAuth();
  const { state, update, toast } = useApp();
  const authenticated = status === "authenticated";
  const query = useApiQuery(authenticated ? routesApi.saved : null, [authenticated]);
  const [changed, setChanged] = useState<SavedRoute | null>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const error = query.error ?? authError;
  const local = canUseLocalRoutes(authenticated, query.error);
  const cloud = changed !== undefined ? changed : query.data?.find((r) => r.name === input.name &&
    r.profileId === (input.profileId ?? null) &&
    r.origin.coordinates.join() === input.origin.coordinates.join() &&
    r.destination.coordinates.join() === input.destination.coordinates.join());
  const localSaved = state.offlineSavedRoutes.find((r) => r.name === input.name &&
    r.destination.coordinates.join() === input.destination.coordinates.join());
  const saved = local ? !!localSaved || state.saved.includes(input.name) : !!cloud;
  const toggle = async () => {
    if (pending.current) return;
    if (local) {
      update((s) => ({
        saved: s.saved.filter((name) => name !== input.name),
        offlineSavedRoutes: saved ? s.offlineSavedRoutes.filter((r) => r.id !== localSaved?.id) :
          [...s.offlineSavedRoutes, { ...input, id: `local:${crypto.randomUUID()}`, profileId: input.profileId ?? null, createdAt: new Date().toISOString() }],
      }));
      toast(saved ? "Rute lokal dihapus." : "Rute tersimpan di perangkat ini. Belum tersimpan di akun.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (cloud) {
        await routesApi.deleteSaved(cloud.id);
        setChanged(null);
        toast("Rute dihapus dari akun.");
      } else {
        setChanged(await routesApi.save(input));
        toast("Rute tersimpan di akun Anda.");
      }
    } catch (e) {
      // An ambiguous failed POST is never retried or reported as a cloud success.
      toast(errorMessage(e));
      query.reload();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return <div className="stack">
    {error && <p role="status">{error.message} {local ? "Rute dapat disimpan di perangkat ini." : "Coba muat ulang daftar rute."}</p>}
    <Btn label={busy ? (cloud ? "Menghapus…" : "Menyimpan…") : query.loading ? "Memuat rute tersimpan…" : saved ? "Hapus dari tersimpan" : "Simpan rute"}
      action="save-route" kind="sm" icon="bookmark" aria-pressed={saved}
      disabled={busy || (status === "loading" && !authError) || query.loading || (!!error && !local)} onClick={() => void toggle()} />
    {error && <Btn label="Coba lagi" kind="sm" disabled={busy} onClick={authenticated ? query.reload : () => void restore()} />}
  </div>;
}
