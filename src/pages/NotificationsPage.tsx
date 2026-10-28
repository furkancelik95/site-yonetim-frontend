import { Link } from "react-router";
import { Bell, BellDot, BellOff, CheckCheck, ShieldAlert, Siren } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../api/hooks";
import type { Schemas } from "../api/types";
import { Badge, Empty, ErrorState, Kpi, Loading, PageHead, Pager, useDocumentTitle } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { useUrlState } from "../lib/hooks";
import { notificationCategory } from "../lib/labels";
import { useSite } from "../site/SiteContext";

type NotificationPage = Schemas["NotificationPage"];
type Notification = Schemas["NotificationOut"];

const CATEGORIES = ["urgent", "financial", "security", "operations", "governance", "announcement"];

/** Bildirimin bağlandığı kayda giden adres; bilinmeyen tür ya da sakin ekranı için yok. */
function linkOf(n: Notification, slug: string, staff: boolean): string | null {
  if (!staff || !n.link_entity) return null;
  if (n.link_entity === "approval_requests" && n.link_id) return `/s/${slug}/onaylar/${n.link_id}`;
  if (n.link_entity === "approval_delegations") return `/s/${slug}/onaylar?sekme=devir`;
  return null;
}

/** Bant altı göstergeler (personel ekranı): toplam, okunmamış, acil ve güvenlik bildirimleri. Kaynak /notifications toplamları. */
function NotificationKpis() {
  const all = useSiteGet<NotificationPage>("/notifications", { page: 1, page_size: 1 });
  const urgent = useSiteGet<NotificationPage>("/notifications", { category: "urgent", page: 1, page_size: 1 });
  const security = useSiteGet<NotificationPage>("/notifications", { category: "security", page: 1, page_size: 1 });
  if (all.isError || urgent.isError || security.isError) return null;
  if (!all.data || !urgent.data || !security.data) {
    return <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>;
  }
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Okunmamış" tone={all.data.unread_count > 0 ? "accent" : undefined} icon={<BellDot aria-hidden="true" />} value={all.data.unread_count} note={all.data.unread_count > 0 ? "sizi bekliyor" : "hepsi okundu"} />
      <Kpi label="Toplam bildirim" icon={<Bell aria-hidden="true" />} value={all.data.total} note="bu sitede size gelen" />
      <Kpi label="Acil" tone={urgent.data.total > 0 ? "danger" : undefined} icon={<Siren aria-hidden="true" />} value={urgent.data.total} note="acil kategorisinde" />
      <Kpi label="Güvenlik" tone={security.data.total > 0 ? "warn" : undefined} icon={<ShieldAlert aria-hidden="true" />} value={security.data.total} note="güvenlik kategorisinde" />
    </div>
  );
}

/**
 * Uygulama içi bildirimler (PLT-05). Personel ve sakin aynı ekranı kullanır. SMS, e-posta ve
 * mobil bildirim gönderimi açık karar K5'e kadar yok; bildirimler yalnız burada görünür.
 */
export function NotificationsPage({ staff }: { staff: boolean }) {
  useDocumentTitle("Bildirimler");
  const { site } = useSite();
  const [s, set] = useUrlState({ durum: "", kategori: "", page: "1" });
  const q = useSiteGet<NotificationPage>("/notifications", { unread: s.durum === "okunmamis" ? true : undefined, category: s.kategori || undefined, page: s.page, page_size: 30 });
  const read = useSiteMutation<{ ids: string[] | null }, Schemas["NotificationReadOut"]>("POST", "/notifications/read");
  const unread = q.data?.unread_count ?? 0;

  return (
    <div className="stack">
      <PageHead
        title="Bildirimler"
        subtitle="Sizi ilgilendiren olaylar. SMS ve e-posta gönderimi henüz yok; bildirimler yalnız burada görünür."
        actions={unread > 0 && (
          <button className="btn" type="button" disabled={read.isPending} onClick={() => read.mutate({ ids: null })}>
            <CheckCheck aria-hidden="true" /> Tümünü okundu say
          </button>
        )}
      >
        <div className="tabs" role="tablist" aria-label="Bildirim durumu">
          {[["", "Tümü"], ["okunmamis", "Okunmamış"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={s.durum === k} className="tabs__tab" onClick={() => set({ durum: k!, page: "1" })}>{l}{k === "okunmamis" && unread > 0 && <span className="tabs__count" aria-label={`${unread} okunmamış`}>{unread}</span>}</button>
          ))}
        </div>
      </PageHead>
      {staff && <NotificationKpis />}

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><Bell aria-hidden="true" /></span>
          <div>
            <div className="card__title">Bildirim listesi</div>
            {q.data && <div className="card__meta">{q.data.total} bildirim</div>}
          </div>
          <div className="card__tools">
            <div className="field">
              <label className="field__label" htmlFor="n-cat">Kategori</label>
              <select id="n-cat" className="field__input" value={s.kategori} onChange={(e) => set({ kategori: e.target.value, page: "1" })}>
                <option value="">Tümü</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{notificationCategory(c)}</option>)}
              </select>
            </div>
          </div>
        </div>
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : q.data.items.length === 0 ? (
          <div className="card__body"><Empty title={s.durum ? "Okunmamış bildirim yok" : "Bildirim yok"} icon={<BellOff aria-hidden="true" />} /></div>
        ) : (
          <ul className="notif-list">
            {q.data.items.map((n) => {
              const to = linkOf(n, site.slug, staff);
              const markRead = () => { if (!n.read_at) read.mutate({ ids: [n.id] }); };
              return (
                <li key={n.id} className={`notif${n.read_at ? "" : " notif--unread"}`}>
                  <div className="notif__main">
                    <div className="row" style={{ gap: "var(--s-2)" }}>
                      {!n.read_at && <span className="visually-hidden">Okunmamış:</span>}
                      <Badge tone={n.category === "urgent" ? "danger" : n.category === "security" ? "warn" : "info"}>{notificationCategory(n.category)}</Badge>
                      {to ? <Link className="strong" to={to} onClick={markRead}>{n.title}</Link> : <span className="strong">{n.title}</span>}
                    </div>
                    {n.body && <p className="small mb-0">{n.body}</p>}
                    <span className="small muted">{formatDateTime(n.created_at)}</span>
                  </div>
                  {!n.read_at && (
                    <button className="btn btn--ghost btn--sm" type="button" disabled={read.isPending} onClick={markRead} aria-label={`${n.title}: okundu say`}>Okundu</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
    </div>
  );
}
