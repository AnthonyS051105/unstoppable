"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, jsonBody, NETWORK_MESSAGE, publicApi, refreshTokens, setSessionExpiredHandler, startSession, tokens } from "@/lib/api-client";
import type { AuthResult, Me } from "@/types/api";

// Who is signed in (frontend/docs/SDD.md §2.1). Server data only: display
// preferences stay in DemoStateContext/localStorage.

/** "signed-out": the user pressed Keluar in this tab (go to the landing page, not /login). */
export type AuthStatus = "loading" | "authenticated" | "anonymous" | "signed-out";

type Ctx = {
  user: Me | null;
  status: AuthStatus;
  /** Set when restoring the session failed for a reason other than "not signed in" (e.g. offline). */
  error: ApiError | null;
  /** Called with the result of verify-otp / login; loads the full profile. */
  signIn: (result: AuthResult) => Promise<Me>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<Me | null>;
  restore: () => Promise<void>;
  setUser: (user: Me) => void;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<ApiError | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<Me>("/users/me");
      setUser(me);
      setStatus("authenticated");
      setError(null);
      return me;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        tokens.clear();
        setUser(null);
        setStatus("anonymous");
        return null;
      }
      setError(e instanceof ApiError ? e : new ApiError("NETWORK", NETWORK_MESSAGE, 0));
      throw e;
    }
  }, []);

  /** Restores the session from the stored refresh token (page load, or "Coba lagi" after a network error). */
  const restore = useCallback(async () => {
    setError(null);
    if (!tokens.hasRefresh()) {
      setStatus("anonymous");
      return;
    }
    if (!(await refreshTokens())) {
      // Rejected refresh token → refreshTokens cleared it. Network failure → keep it and report.
      if (tokens.hasRefresh()) setError(new ApiError("NETWORK", NETWORK_MESSAGE, 0));
      else setStatus("anonymous");
      return;
    }
    await refreshUser().catch(() => {});
  }, [refreshUser]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus("anonymous");
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
    return () => setSessionExpiredHandler(null);
  }, [restore]);

  const signIn = useCallback(
    async (result: AuthResult) => {
      startSession(result);
      const me = await refreshUser();
      if (!me) throw new ApiError("UNAUTHENTICATED", "Sesi tidak valid. Silakan masuk lagi.", 401);
      return me;
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh();
    tokens.clear();
    setUser(null);
    setStatus("signed-out");
    // Best effort: the local session is already gone even if the server is unreachable.
    if (refreshToken) await publicApi<void>("/auth/logout", jsonBody({ refreshToken })).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ user, status, error, signIn, logout, refreshUser, restore, setUser }),
    [user, status, error, signIn, logout, refreshUser, restore],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
