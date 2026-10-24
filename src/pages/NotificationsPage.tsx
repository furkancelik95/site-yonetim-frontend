import { Link } from "react-router";
import { BellOff, CheckCheck } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../api/hooks";
import type { Schemas } from "../api/types";
import { Badge, Empty, ErrorState, Loading, PageHead, Pager, useDocumentTitle } from "../components/ui";
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
      />
      <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end" }}>
        <div className="row" role="tablist" aria-label="Bildirim durumu" style={{ gap: "var(--s-2)" }}>
          {[["", "Tümü"], ["okunmamis", `Okunmamış${unread ? ` (${unread})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={s.durum === k} className={`btn btn--sm${s.durum === k ? " btn--primary" : ""}`} onClick={() => set({ durum: k!, page: "1" })}>{l}</button>
          ))}
        </div>
        <div className="field" style={{ minWidth: "11rem", marginLeft: "auto" }}>
          <label className="field__label" htmlFor="n-cat">Kategori</label>
          <select id="n-cat" className="field__input" value={s.kategori} onChange={(e) => set({ kategori: e.target.value, page: "1" })}>
            <option value="">Tümü</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{notificationCategory(c)}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
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
