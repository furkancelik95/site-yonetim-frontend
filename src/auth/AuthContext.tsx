import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, get, refreshSession, setAccessToken, setSessionLostHandler } from "../api/client";
import type { Me, TokenResponse } from "../api/types";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthValue {
  status: Status;
  me: Me | null;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<Me | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);

  const reset = useCallback(() => {
    setAccessToken(null);
    setMe(null);
    setStatus("anonymous");
    queryClient.clear();
  }, [queryClient]);

  const reloadMe = useCallback(async () => {
    try {
      const data = await get<Me>("/me");
      setMe(data);
      setStatus("authenticated");
      return data;
    } catch {
      reset();
      return null;
    }
  }, [reset]);

  // Sayfa yenilenince bellek boşalır; çerezdeki yenileme jetonuyla oturum geri gelir.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await refreshSession();
      if (cancelled) return;
      if (ok) await reloadMe();
      else setStatus("anonymous");
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadMe]);

  useEffect(() => {
    setSessionLostHandler(reset);
    return () => setSessionLostHandler(null);
  }, [reset]);

  const login = useCallback(
    async (email: string, password: string) => {
      const token = await api<TokenResponse>("POST", "/auth/login", { body: { email, password } });
      setAccessToken(token.access_token);
      queryClient.clear();
      const data = await get<Me>("/me");
      setMe(data);
      setStatus("authenticated");
      return data;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api("POST", "/auth/logout");
    } catch {
      // oturum zaten düşmüş olabilir; yerel durum yine temizlenir
    }
    reset();
  }, [reset]);

  const value = useMemo(() => ({ status, me, login, logout, reloadMe }), [status, me, login, logout, reloadMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return ctx;
}

/** Oturum açmış kullanıcı (korunan sayfalarda null olmaz). */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("Oturum yok");
  return me;
}

/** Birden çok siteye erişen yönetim şirketi kullanıcısı kökte portföyü görür. */
export function showsPortfolio(me: Me): boolean {
  return me.kind !== "resident" && !me.is_platform_admin && me.can_see_portfolio && me.sites.length > 1;
}

/** Girişten sonra açılış ekranı (frontend docs/01 §1). */
export function homePath(me: Me): string {
  if (me.must_change_password) return "/parola-degistir";
  if (me.is_platform_admin) return "/yonetim";
  if (me.kind === "resident") {
    const s = me.sites[0];
    return s ? `/sakin/${s.slug}` : "/yetkisiz";
  }
  if (me.sites.length === 0) return "/yetkisiz";
  if (showsPortfolio(me)) return "/";
  return `/s/${me.sites[0]!.slug}`;
}
