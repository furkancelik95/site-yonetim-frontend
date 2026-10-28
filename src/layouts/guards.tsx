import { useMemo, type ReactNode } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import { homePath, showsPortfolio, useAuth } from "../auth/AuthContext";
import { ErrorState, Loading } from "../components/ui";
import { MfaGraceBanner } from "../pages/auth/AccountPages";
import { makeSiteCtx, SiteContext, type SiteDetail } from "../site/SiteContext";
import { AppShell } from "./AppShell";

/** Oturum yoksa girişe gönderir; parola değişikliği ya da 2FA kurulumu zorunluysa önce oraya; güncel
 * aydınlatma metni onaylanmadıysa (PM kararı P6) onay ekranına. */
export function RequireAuth() {
  const { status, me } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Loading label="Oturum kontrol ediliyor…" />;
  if (status === "mfa") return <Navigate to="/giris" replace />; // giriş ekranı kod adımını gösterir
  if (status === "anonymous" || !me) {
    const from = location.pathname + location.search;
    return <Navigate to={`/giris${from !== "/" ? `?donus=${encodeURIComponent(from)}` : ""}`} replace />;
  }
  if (me.must_change_password && location.pathname !== "/parola-degistir") {
    return <Navigate to="/parola-degistir" replace />;
  }
  // Yönetici rolünde 2FA geçiş süresi doldu: yalnız kurulum ekranı (backend 403 mfa_setup_required)
  if (!me.must_change_password && me.mfa_setup_required && location.pathname !== "/iki-adimli-dogrulama") {
    return <Navigate to="/iki-adimli-dogrulama" replace />;
  }
  if (!me.must_change_password && me.consent_required && location.pathname !== CONSENT_PATH) {
    const from = location.pathname + location.search;
    return <Navigate to={`${CONSENT_PATH}${from !== "/" ? `?donus=${encodeURIComponent(from)}` : ""}`} replace />;
  }
  return (
    <>
      <MfaGraceBanner />
      <Outlet />
    </>
  );
}

export const CONSENT_PATH = "/aydinlatma-onayi";

export const siteKey = (slug: string) => ["site", slug] as const;

export function useSiteQuery(slug: string) {
  return useQuery({ queryKey: siteKey(slug), queryFn: () => get<SiteDetail>(`/sites/${slug}`) });
}

/** /s/:slug — site bilgisini (izinler, açık modüller) bir kez alır, bütün alt sayfalara verir. */
export function SiteLayout() {
  const { slug = "" } = useParams();
  const q = useSiteQuery(slug);
  const ctx = useMemo(() => (q.data ? makeSiteCtx(q.data) : null), [q.data]);

  if (q.isPending) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  if (!ctx) {
    return (
      <AppShell>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </AppShell>
    );
  }
  return (
    <SiteContext.Provider value={ctx}>
      <AppShell siteCtx={ctx}>
        <Outlet />
      </AppShell>
    </SiteContext.Provider>
  );
}

export function PlatformLayout() {
  const { me } = useAuth();
  // Platform paneli yalnız platform yöneticisine açık; diğerleri için yok gibi davranılır.
  if (!me?.is_platform_admin) return <Navigate to="/bulunamadi" replace />;
  return (
    <AppShell platform>
      <Outlet />
    </AppShell>
  );
}

/** Kök adres: portföy kullanıcısına portföy, diğerlerine kendi açılış ekranı. */
export function RootIndex({ portfolio }: { portfolio: ReactNode }) {
  const { me } = useAuth();
  if (!me) return <Navigate to="/giris" replace />;
  if (!showsPortfolio(me)) return <Navigate to={homePath(me)} replace />;
  return <AppShell title="Portföy">{portfolio}</AppShell>;
}
