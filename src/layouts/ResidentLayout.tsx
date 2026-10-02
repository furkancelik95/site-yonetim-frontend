import { useEffect, useMemo } from "react";
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router";
import { ArrowLeft, Home, Inbox, Megaphone, Wallet, Wrench } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ErrorState, Loading } from "../components/ui";
import { makeSiteCtx, SiteContext } from "../site/SiteContext";
import { useSiteQuery } from "./guards";

/** Sakin ekranı: telefon öncelikli, alt sekme çubuğu (en fazla 5 sekme). */
export function ResidentLayout() {
  const { slug = "" } = useParams();
  const { me, logout } = useAuth();
  const q = useSiteQuery(slug);
  const ctx = useMemo(() => (q.data ? makeSiteCtx(q.data) : null), [q.data]);
  const location = useLocation();
  const isStaff = me?.kind !== "resident";

  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (q.isPending) return <Loading />;
  if (!ctx) return <main id="main" className="page"><ErrorState error={q.error} onRetry={() => q.refetch()} /></main>;

  const base = `/sakin/${slug}`;
  return (
    <SiteContext.Provider value={ctx}>
      <a className="skip-link" href="#main">İçeriğe geç</a>
      <div className="resident">
        <header className="r-header">
          <div className="row row--between" style={{ flexWrap: "nowrap", gap: "var(--s-2)" }}>
            <div style={{ minWidth: 0 }}>
              <div className="r-header__site">{ctx.site.name}</div>
              <div className="r-header__unit">{me?.full_name}</div>
            </div>
            <div className="row" style={{ flexWrap: "nowrap", gap: "var(--s-1)" }}>
              {isStaff && <Link className="btn btn--sm" to={`/s/${slug}`}><ArrowLeft aria-hidden="true" /> Panel</Link>}
              <button className="btn btn--ghost btn--sm" type="button" onClick={logout}>Çıkış</button>
            </div>
          </div>
        </header>
        <main id="main" className="r-body" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <nav className="tabbar" aria-label="Alt menü">
        <NavLink className="tabbar__item" to={base} end><Home aria-hidden="true" /> <span>Ana Sayfa</span></NavLink>
        <NavLink className="tabbar__item" to={`${base}/borcum`}><Wallet aria-hidden="true" /> <span>Borcum</span></NavLink>
        <NavLink className="tabbar__item" to={`${base}/duyurular`}><Megaphone aria-hidden="true" /> <span>Duyurular</span></NavLink>
        <NavLink className="tabbar__item" to={`${base}/taleplerim`}><Wrench aria-hidden="true" /> <span>Taleplerim</span></NavLink>
        <NavLink className="tabbar__item" to={`${base}/giderler`}><Inbox aria-hidden="true" /> <span>Giderler</span></NavLink>
      </nav>
    </SiteContext.Provider>
  );
}
