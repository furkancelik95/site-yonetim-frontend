import { Fragment, useState } from "react";
import { Activity, CalendarDays, History, Trash2 } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Avatar, Badge, Empty, ErrorState, Kpi, Loading, PageHead, Pager } from "../../components/ui";
import { formatDate, formatDateTime, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { actorType, auditAction } from "../../lib/labels";

type Audit = Schemas["AuditOut"];

const ACTIONS = ["create", "update", "delete", "import", "download", "export", "contact_view"];
const ACTORS = ["user", "system", "delegate"];

/** Süzgeçten bağımsız sayılar: toplam, son 7 gün, bugün, silme (yalnız `total` okunur, page_size 1). */
function AuditKpis() {
  const today = todayIso();
  const d = new Date(); d.setDate(d.getDate() - 6);
  const weekAgo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const all = useSiteGet<Page<Audit>>("/audit", { page_size: 1 });
  const week = useSiteGet<Page<Audit>>("/audit", { from: weekAgo, page_size: 1 });
  const day = useSiteGet<Page<Audit>>("/audit", { from: today, page_size: 1 });
  const del = useSiteGet<Page<Audit>>("/audit", { action: "delete", page_size: 1 });
  if (all.isError) return null;
  if (!all.data) return <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>;
  const n = (q: { data?: Page<Audit> }) => q.data?.total ?? "…";
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Toplam kayıt" icon={<History aria-hidden="true" />} value={all.data.total.toLocaleString("tr-TR")} note="değiştirilemez iz" />
      <Kpi label="Son 7 gün" tone="accent" icon={<CalendarDays aria-hidden="true" />} value={n(week)} note={`${formatDate(weekAgo)} sonrası`} />
      <Kpi label="Bugün" icon={<Activity aria-hidden="true" />} value={n(day)} note={formatDate(today)} />
      <Kpi label="Silme işlemi" tone={typeof del.data?.total === "number" && del.data.total > 0 ? "warn" : undefined} icon={<Trash2 aria-hidden="true" />} value={n(del)} note="tüm zamanlar" />
    </div>
  );
}

/** Denetim kaydı: değiştirilemez, silinemez (backend docs/09 §6). */
export function AuditPage() {
  const [s, set] = useUrlState({ action: "", actor: "", entity: "", from: "", to: "", page: "1" });
  const r = useSiteGet<Page<Audit>>("/audit", { action: s.action, actor_type: s.actor || undefined, entity: s.entity, from: s.from, to: s.to, page: s.page, page_size: 50 });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="stack">
      <PageHead title="Denetim kaydı" subtitle="Kim, ne zaman, neyi değiştirdi. Kayıtlar değiştirilemez ve silinemez." />
      <AuditKpis />

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><History aria-hidden="true" /></span>
          <div><div className="card__title">Kayıtlar</div>{r.data && <div className="card__meta">{r.data.total} kayıt</div>}</div>
          <div className="card__tools">
            <div className="field">
              <label className="field__label" htmlFor="a-act">İşlem</label>
              <select id="a-act" className="field__input" value={s.action} onChange={(e) => set({ action: e.target.value })}>
                <option value="">Tümü</option>
                {ACTIONS.map((a) => <option key={a} value={a}>{auditAction(a)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="a-actor">Yapan</label>
              <select id="a-actor" className="field__input" value={s.actor} onChange={(e) => set({ actor: e.target.value, page: "1" })}>
                <option value="">Tümü</option>
                {ACTORS.map((a) => <option key={a} value={a}>{actorType(a)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="a-ent">Kayıt türü</label>
              <input id="a-ent" className="field__input" value={s.entity} onChange={(e) => set({ entity: e.target.value })} placeholder="ör. payment" />
            </div>
            <div className="field"><label className="field__label" htmlFor="a-from">Başlangıç</label><input id="a-from" className="field__input" type="date" value={s.from} onChange={(e) => set({ from: e.target.value })} /></div>
            <div className="field"><label className="field__label" htmlFor="a-to">Bitiş</label><input id="a-to" className="field__input" type="date" value={s.to} onChange={(e) => set({ to: e.target.value })} /></div>
          </div>
        </div>
        <div className="card__body card__body--flush">
          {r.isPending ? <Loading /> : r.isError ? <div className="card__body"><ErrorState error={r.error} onRetry={() => r.refetch()} /></div> : r.data.items.length === 0 ? (
            <Empty title="Kayıt yok" icon={<History aria-hidden="true" />} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Denetim kayıtları</caption>
                <thead><tr><th scope="col">Zaman</th><th scope="col">Kişi</th><th scope="col">İşlem</th><th scope="col">Kayıt</th><th scope="col"><span className="visually-hidden">Ayrıntı</span></th></tr></thead>
                <tbody>
                  {r.data.items.map((a) => (
                    <Fragment key={a.id}>
                      <tr>
                        <td className="small nowrap">{formatDateTime(a.at)}</td>
                        <td className="small">
                          <div className="cell-person">
                            <Avatar name={a.actor_name ?? "Sistem"} size="sm" soft />
                            <div>{a.actor_name ?? "Sistem"}{a.actor_type !== "user" && <> <Badge tone={a.actor_type === "delegate" ? "warn" : "muted"}>{actorType(a.actor_type)}</Badge></>}{a.ip && <div className="cell-sub mono">{a.ip}</div>}</div>
                          </div>
                        </td>
                        <td><Badge tone={a.action === "delete" ? "danger" : a.action === "create" ? "ok" : "muted"}>{auditAction(a.action)}</Badge></td>
                        <td className="small"><span className="mono">{a.entity}</span>{a.entity_id && <div className="cell-sub mono">{a.entity_id.slice(0, 8)}…</div>}</td>
                        <td className="right">
                          {(a.before || a.after || a.reason || a.request_id) && (
                            <button className="btn btn--ghost btn--sm" type="button" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>Ayrıntı</button>
                          )}
                        </td>
                      </tr>
                      {open === a.id && (
                        <tr>
                          <td colSpan={5} style={{ background: "var(--bg-inset)" }}>
                            {(a.reason || a.request_id || a.user_agent) && (
                              <div className="small" style={{ marginBottom: "var(--s-2)" }}>
                                {a.reason && <div><span className="strong">Gerekçe:</span> {a.reason}</div>}
                                {a.request_id && <div className="muted">İstek kimliği: <span className="mono">{a.request_id}</span></div>}
                                {a.user_agent && <div className="muted">Tarayıcı: {a.user_agent}</div>}
                              </div>
                            )}
                            <div className="grid grid--2">
                              <div><div className="section-title">Önce</div><pre className="mono xs" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{a.before ? JSON.stringify(a.before, null, 2) : "—"}</pre></div>
                              <div><div className="section-title">Sonra</div><pre className="mono xs" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{a.after ? JSON.stringify(a.after, null, 2) : "—"}</pre></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {r.data && <div className="card__foot"><Pager page={r.data.page} pageSize={r.data.page_size} total={r.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
    </div>
  );
}
