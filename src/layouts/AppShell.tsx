import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  History,
  Inbox,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Menu,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Wallet,
  Wrench,
} from "lucide-react";
import { useAuth, useMe } from "../auth/AuthContext";
import { initials } from "../lib/format";
import { M, P, type SiteCtx } from "../site/SiteContext";

function Item({ to, icon, label, end, external }: { to: string; icon: ReactNode; label: string; end?: boolean; external?: boolean }) {
  if (external) {
    return (
      <a className="navlink" href={to} target="_blank" rel="noopener">
        {icon} <span>{label}</span>
      </a>
    );
  }
  return (
    <NavLink className="navlink" to={to} end={end}>
      {icon} <span>{label}</span>
    </NavLink>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sidebar__group">
      <div className="sidebar__label">{label}</div>
      {children}
    </div>
  );
}

/** Müşteri paneli menüsü: izin + modül durumuna göre (referans _Layout.cshtml ile aynı). */
function SiteNav({ ctx }: { ctx: SiteCtx }) {
  const { site, can, shows } = ctx;
  const base = `/s/${site.slug}`;
  const ops =
    shows(M.packages, P.packages) ||
    shows(M.visitors, P.visitors) ||
    shows(M.requests, P.requestsRead) ||
    shows(M.announcements, P.announcementsRead) ||
    can(P.modulesManage) ||
    can(P.auditRead);
  return (
    <>
      <Group label={site.name}>
        {can(P.financeRead) && <Item to={base} end icon={<LayoutDashboard aria-hidden="true" />} label="Bugün" />}
        {can(P.unitsRead) && <Item to={`${base}/daireler`} icon={<Building2 aria-hidden="true" />} label="Daireler" />}
        {can(P.financeRead) && <Item to={`${base}/borclular`} icon={<AlertTriangle aria-hidden="true" />} label="Borçlular" />}
        {can(P.paymentRecord) && <Item to={`${base}/tahsilat`} icon={<Wallet aria-hidden="true" />} label="Tahsilat" />}
        {can(P.financeRead) && <Item to={`${base}/tahakkuk`} icon={<ClipboardList aria-hidden="true" />} label="Tahakkuk" />}
        {can(P.financeRead) && <Item to={`${base}/isletme-projesi`} icon={<Receipt aria-hidden="true" />} label="İşletme Projesi" />}
        {can(P.expensesRead) && <Item to={`${base}/giderler`} icon={<Inbox aria-hidden="true" />} label="Giderler" />}
        {can(P.cashRead) && <Item to={`${base}/kasa`} icon={<Landmark aria-hidden="true" />} label="Kasa ve Banka" />}
        {can(P.reportsRead) && <Item to={`${base}/raporlar`} icon={<BarChart3 aria-hidden="true" />} label="Raporlar" />}
        {can(P.unitsManage) && <Item to={`${base}/iceri-aktar`} icon={<FileSpreadsheet aria-hidden="true" />} label="İçeri Aktar" />}
      </Group>
      {ops && (
        <Group label="Operasyon">
          {(shows(M.packages, P.packages) || shows(M.visitors, P.visitors)) && (
            <Item to={`${base}/guvenlik`} icon={<ShieldCheck aria-hidden="true" />} label="Güvenlik" />
          )}
          {shows(M.requests, P.requestsRead) && <Item to={`${base}/talepler`} icon={<Wrench aria-hidden="true" />} label="Talepler" />}
          {shows(M.announcements, P.announcementsRead) && (
            <Item to={`${base}/duyurular`} icon={<Megaphone aria-hidden="true" />} label="Duyurular" />
          )}
          {can(P.modulesManage) && <Item to={`${base}/moduller`} icon={<SlidersHorizontal aria-hidden="true" />} label="Modüller" />}
          {can(P.auditRead) && <Item to={`${base}/denetim`} icon={<History aria-hidden="true" />} label="Denetim Kaydı" />}
        </Group>
      )}
    </>
  );
}

export function AppShell({ siteCtx, platform, title, children }: { siteCtx?: SiteCtx; platform?: boolean; title?: string; children: ReactNode }) {
  const me = useMe();
  const { logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);

  // Sayfa değişince dar ekran menüsü kapanır ve odak ana içeriğe gider (ekran okuyucu için).
  useEffect(() => {
    setNavOpen(false);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNavOpen(false);
        menuBtn.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  // Site dışında (portföy) yönetim şirketindeki rol gösterilir
  const siteRole = siteCtx?.site.role ?? me.sites.find((s) => s.organization_role)?.organization_role ?? undefined;
  return (
    <>
      <a className="skip-link" href="#main">
        İçeriğe geç
      </a>
      <div className="shell" data-nav-open={navOpen}>
        <aside className={`sidebar${platform ? " sidebar--platform" : ""}`} id="ana-menu">
          <Link className="sidebar__brand" to={platform ? "/yonetim" : "/"} style={{ textDecoration: "none", color: "inherit" }}>
            <span className={`sidebar__mark${platform ? " sidebar__mark--platform" : ""}`} aria-hidden="true">
              SY
            </span>
            <span>
              <span className="sidebar__name">SiteYönetimi</span>
              <br />
              <span className="sidebar__sub">{platform ? "Platform yönetimi" : "Site yönetimi"}</span>
            </span>
          </Link>

          <nav className="sidebar__nav" aria-label="Ana menü">
            {platform ? (
              <Group label="Platform">
                <Item to="/yonetim" end icon={<BarChart3 aria-hidden="true" />} label="Genel bakış" />
                <Item to="/yonetim/musteri-ekle" icon={<Building2 aria-hidden="true" />} label="Müşteri ekle" />
                <Item to="/yonetim/site-ac" icon={<Building2 aria-hidden="true" />} label="Site aç" />
              </Group>
            ) : (
              <>
                {me.can_see_portfolio && me.sites.length > 1 && (
                  <Group label="Genel">
                    <Item to="/" end icon={<BarChart3 aria-hidden="true" />} label="Portföy" />
                  </Group>
                )}
                {siteCtx && <SiteNav ctx={siteCtx} />}
                {siteCtx && (
                  <Group label="Önizleme">
                    <Item to={`/sakin/${siteCtx.site.slug}`} external icon={<Smartphone aria-hidden="true" />} label="Sakin ekranı" />
                  </Group>
                )}
                {me.sites.length > 1 && (
                  <Group label="Siteler">
                    {me.sites.map((s) => (
                      <NavLink
                        key={s.site_id}
                        className="navlink"
                        to={`/s/${s.slug}`}
                        aria-current={siteCtx?.site.id === s.site_id ? "page" : undefined}
                      >
                        <Building2 aria-hidden="true" /> <span>{s.name}</span>
                      </NavLink>
                    ))}
                  </Group>
                )}
              </>
            )}
          </nav>

          <div className="userbox">
            <span className="userbox__avatar" aria-hidden="true">
              {initials(me.full_name)}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="userbox__name" title={me.full_name}>
                {me.full_name}
              </span>
              <span className="userbox__role">{platform ? "Platform yöneticisi" : (siteRole ?? "—")}</span>
            </span>
            <button className="btn btn--ghost btn--sm" type="button" onClick={logout}>
              Çıkış
            </button>
          </div>
        </aside>

        {navOpen && <button className="nav-scrim" type="button" aria-label="Menüyü kapat" onClick={() => setNavOpen(false)} />}

        <div className="main">
          <header className="topbar">
            <button
              ref={menuBtn}
              className="btn btn--ghost btn--icon topbar__menu"
              type="button"
              aria-label="Menüyü aç"
              aria-controls="ana-menu"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <Menu aria-hidden="true" />
            </button>
            <span className="topbar__title">{title ?? siteCtx?.site.name ?? (platform ? "Platform" : "SiteYönetimi")}</span>
            <div className="topbar__spacer" />
            {platform && <span className="badge badge--info">Platform</span>}
          </header>
          <main id="main" className="page" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
