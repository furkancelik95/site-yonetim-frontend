import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CalendarRange,
  Car,
  ClipboardCheck,
  Contact,
  ClipboardList,
  FileOutput,
  FileSignature,
  FileSpreadsheet,
  History,
  IdCard,
  Inbox,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  Lock,
  Megaphone,
  Menu,
  Receipt,
  ReceiptText,
  Rocket,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  TextCursorInput,
  UserPlus,
  Users,
  Vote,
  Wallet,
  Wrench,
} from "lucide-react";
import { useAuth, useMe } from "../auth/AuthContext";
import { NotificationBell } from "../components/NotificationBell";
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
    shows(M.visitors, P.securityIncidents) ||
    shows(M.requests, P.requestsRead) ||
    shows(M.announcements, P.announcementsRead) ||
    can(P.modulesManage) ||
    can(P.membersManage) ||
    can(P.peopleManage) ||
    can(P.auditRead);
  // Toplantı, anket ve personel ayrı modüller (general-assembly, surveys, staff); kapalıysa menüde yok
  const meetings = shows(M.generalAssembly, P.meetingsRead);
  const surveys = shows(M.surveys, P.announcementsRead);
  const staff = shows(M.staff, P.peopleRead);
  return (
    <>
      <Group label={site.name}>
        {can(P.financeRead) && <Item to={base} end icon={<LayoutDashboard aria-hidden="true" />} label="Bugün" />}
        {can(P.unitsRead) && <Item to={`${base}/daireler`} icon={<Building2 aria-hidden="true" />} label="Daireler" />}
        {can(P.unitsManage) && <Item to={`${base}/yapi`} icon={<Layers aria-hidden="true" />} label="Yapı" />}
        {can(P.peopleRead) && <Item to={`${base}/kisiler`} icon={<Contact aria-hidden="true" />} label="Kişiler" />}
        {can(P.unitsRead) && <Item to={`${base}/araclar`} icon={<Car aria-hidden="true" />} label="Araçlar" />}
        {can(P.financeRead) && <Item to={`${base}/borclular`} icon={<AlertTriangle aria-hidden="true" />} label="Borçlular" />}
        {can(P.paymentRecord) && <Item to={`${base}/tahsilat`} icon={<Wallet aria-hidden="true" />} label="Tahsilat" />}
        {can(P.paymentRecord) && can(P.cashManage) && <Item to={`${base}/banka-aktarim`} icon={<ArrowDownToLine aria-hidden="true" />} label="Banka Aktarımı" />}
        {can(P.financeRead) && <Item to={`${base}/tahakkuk`} icon={<ClipboardList aria-hidden="true" />} label="Tahakkuk" />}
        {can(P.financeRead) && <Item to={`${base}/isletme-projesi`} icon={<Receipt aria-hidden="true" />} label="İşletme Projesi" />}
        {can(P.expensesRead) && <Item to={`${base}/giderler`} icon={<Inbox aria-hidden="true" />} label="Giderler" />}
        {can(P.cashRead) && <Item to={`${base}/kasa`} icon={<Landmark aria-hidden="true" />} label="Kasa ve Banka" />}
        {can(P.reportsRead) && <Item to={`${base}/raporlar`} icon={<BarChart3 aria-hidden="true" />} label="Raporlar" />}
        {can(P.unitsManage) && <Item to={`${base}/iceri-aktar`} icon={<FileSpreadsheet aria-hidden="true" />} label="İçeri Aktar" />}
      </Group>
      {can(P.financeRead) && (
        <Group label="Finans yönetimi">
          <Item to={`${base}/odeme-planlari`} icon={<CalendarRange aria-hidden="true" />} label="Ödeme Planları" />
          <Item to={`${base}/ek-ucretler`} icon={<ReceiptText aria-hidden="true" />} label="Dönem Dışı Ücretler" />
          <Item to={`${base}/donem-kapanisi`} icon={<Lock aria-hidden="true" />} label="Dönem Kapanışı" />
          <Item to={`${base}/muhasebe-aktarimi`} icon={<FileOutput aria-hidden="true" />} label="Muhasebe Aktarımı" />
          {can(P.chargePost) && <Item to={`${base}/ayarlar/finans`} icon={<Settings2 aria-hidden="true" />} label="Finans Ayarları" />}
        </Group>
      )}
      {ops && (
        <Group label="Operasyon">
          {(shows(M.packages, P.packages) || shows(M.visitors, P.visitors) || shows(M.visitors, P.securityIncidents)) && (
            <Item to={`${base}/guvenlik`} icon={<ShieldCheck aria-hidden="true" />} label="Güvenlik" />
          )}
          {shows(M.requests, P.requestsRead) && <Item to={`${base}/talepler`} icon={<Wrench aria-hidden="true" />} label="Talepler" />}
          {shows(M.announcements, P.announcementsRead) && (
            <Item to={`${base}/duyurular`} icon={<Megaphone aria-hidden="true" />} label="Duyurular" />
          )}
          {can(P.peopleManage) && <Item to={`${base}/kayit-basvurulari`} icon={<UserPlus aria-hidden="true" />} label="Sakin Kaydı" />}
          {can(P.membersManage) && <Item to={`${base}/kullanicilar`} icon={<Users aria-hidden="true" />} label="Kullanıcılar" />}
          {can(P.modulesManage) && <Item to={`${base}/moduller`} icon={<SlidersHorizontal aria-hidden="true" />} label="Modüller" />}
          {can(P.auditRead) && <Item to={`${base}/denetim`} icon={<History aria-hidden="true" />} label="Denetim Kaydı" />}
        </Group>
      )}
      {/* Onaylar her personele açık (onaycı olmak rol atamasından gelir); bu grup hep görünür */}
      <Group label="Yönetim">
          <Item to={`${base}/onaylar`} icon={<ClipboardCheck aria-hidden="true" />} label="Onaylar" />
          {can(P.approvalRulesRead) && <Item to={`${base}/onay-kurallari`} icon={<ListChecks aria-hidden="true" />} label="Onay Kuralları" />}
          {meetings && <Item to={`${base}/toplantilar`} icon={<CalendarDays aria-hidden="true" />} label="Toplantılar" />}
          {surveys && <Item to={`${base}/anketler`} icon={<Vote aria-hidden="true" />} label="Anketler" />}
          {can(P.expensesRead) && <Item to={`${base}/sozlesmeler`} icon={<FileSignature aria-hidden="true" />} label="Sözleşmeler" />}
          {can(P.inventoryRead) && <Item to={`${base}/demirbas`} icon={<Boxes aria-hidden="true" />} label="Demirbaş ve Stok" />}
          {staff && <Item to={`${base}/personel`} icon={<IdCard aria-hidden="true" />} label="Personel" />}
          {can(P.modulesManage) && <Item to={`${base}/ayarlar/ozel-alanlar`} icon={<TextCursorInput aria-hidden="true" />} label="Özel Alanlar" />}
          {can(P.modulesManage) && <Item to={`${base}/kurulum`} icon={<Rocket aria-hidden="true" />} label="Kurulum" />}
      </Group>
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
            {/* Ad alanı profile gider (oturumlar, güvenlik olayları, bildirim tercihleri) */}
            <Link to="/profil" className="userbox__link" title={`${me.full_name} — profil`}>
              <span className="userbox__name">{me.full_name}</span>
              <span className="userbox__role">{platform ? "Platform yöneticisi" : (siteRole ?? "—")}</span>
              <span className="visually-hidden">Profil</span>
            </Link>
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
            {siteCtx && <NotificationBell to={`/s/${siteCtx.site.slug}/bildirimler`} />}
          </header>
          <main id="main" className="page" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
