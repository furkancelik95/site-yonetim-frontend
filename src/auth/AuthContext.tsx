import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  api,
  get,
  refreshSession,
  setAccessToken,
  setConsentRequiredHandler,
  setMfaRequiredHandler,
  setSessionLostHandler,
} from "../api/client";
import type { Me, TokenResponse } from "../api/types";

/**
 * Oturum durumu. `mfa`: parola ya da SMS kodu doğru, iki adımlı kod bekleniyor (backend her uca
 * 401 `mfa_required` döner — Yazılım Dokümanı PLT-01 S2).
 */
type Status = "loading" | "anonymous" | "mfa" | "authenticated";

interface AuthValue {
  status: Status;
  me: Me | null;
  login: (email: string, password: string) => Promise<Me | null>;
  /** Telefon + SMS kodu (sakin, saha). */
  loginWithCode: (phone: string, code: string) => Promise<Me | null>;
  /** Davet bağlantısıyla parola belirleyip girer. */
  acceptInvitation: (token: string, password: string) => Promise<Me | null>;
  /** Girişin ikinci adımı: doğrulayıcı kodu ya da yedek kod. */
  completeMfa: (code: string) => Promise<Me>;
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
    } catch (e) {
      if (e instanceof ApiError && e.code === "mfa_required") {
        setMe(null);
        setStatus("mfa");
        return null;
      }
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
    setMfaRequiredHandler(() => setStatus("mfa"));
    return () => {
      setSessionLostHandler(null);
      setMfaRequiredHandler(null);
    };
  }, [reset]);

  // Yeni aydınlatma metni sürümü (P6): /me tazelenir, RequireAuth onay ekranına yönlendirir.
  useEffect(() => {
    setConsentRequiredHandler(() => void reloadMe());
    return () => setConsentRequiredHandler(null);
  }, [reloadMe]);

  /** Jetonu alır; 2FA bekleniyorsa `null` (kod ekranı), değilse `/me`. */
  const afterToken = useCallback(
    async (token: TokenResponse) => {
      setAccessToken(token.access_token);
      queryClient.clear();
      if (token.mfa_required) {
        setMe(null);
        setStatus("mfa");
        return null;
      }
      const data = await get<Me>("/me");
      setMe(data);
      setStatus("authenticated");
      return data;
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) =>
      afterToken(await api<TokenResponse>("POST", "/auth/login", { body: { email, password } })),
    [afterToken],
  );

  const loginWithCode = useCallback(
    async (phone: string, code: string) =>
      afterToken(await api<TokenResponse>("POST", "/auth/otp/verify", { body: { phone, code } })),
    [afterToken],
  );

  const acceptInvitation = useCallback(
    async (token: string, password: string) =>
      afterToken(await api<TokenResponse>("POST", `/auth/invitations/${encodeURIComponent(token)}/accept`, { body: { password } })),
    [afterToken],
  );

  const completeMfa = useCallback(
    async (code: string) => {
      const token = await api<TokenResponse>("POST", "/auth/mfa/verify", { body: { code } });
      setAccessToken(token.access_token);
      const data = await get<Me>("/me");
      setMe(data);
      setStatus("authenticated");
      return data;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api("POST", "/auth/logout");
    } catch {
      // oturum zaten düşmüş olabilir; yerel durum yine temizlenir
    }
    reset();
  }, [reset]);

  const value = useMemo(
    () => ({ status, me, login, loginWithCode, acceptInvitation, completeMfa, logout, reloadMe }),
    [status, me, login, loginWithCode, acceptInvitation, completeMfa, logout, reloadMe],
  );
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
  if (me.mfa_setup_required) return "/iki-adimli-dogrulama";
  if (me.consent_required) return "/aydinlatma-onayi";
  if (me.is_platform_admin) return "/yonetim";
  if (me.kind === "resident") {
    const s = me.sites[0];
    return s ? `/sakin/${s.slug}` : "/yetkisiz";
  }
  if (me.sites.length === 0) return "/yetkisiz";
  if (showsPortfolio(me)) return "/";
  return `/s/${me.sites[0]!.slug}`;
}
