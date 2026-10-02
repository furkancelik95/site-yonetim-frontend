import { Fragment, useState } from "react";
import { History } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Badge, Empty, ErrorState, Loading, PageHead, Pager } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { auditAction } from "../../lib/labels";

type Audit = Schemas["AuditOut"];

const ACTIONS = ["create", "update", "delete", "import", "download"];

/** Denetim kaydı: değiştirilemez, silinemez (backend docs/09 §6). */
export function AuditPage() {
  const [s, set] = useUrlState({ action: "", entity: "", from: "", to: "", page: "1" });
  const r = useSiteGet<Page<Audit>>("/audit", { action: s.action, entity: s.entity, from: s.from, to: s.to, page: s.page, page_size: 50 });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="stack">
      <PageHead title="Denetim kaydı" subtitle="Kim, ne zaman, neyi değiştirdi. Kayıtlar değiştirilemez ve silinemez." />
      <div className="filters">
        <div className="field">
          <label className="field__label" htmlFor="a-act">İşlem</label>
          <select id="a-act" className="field__input" value={s.action} onChange={(e) => set({ action: e.target.value })}>
            <option value="">Tümü</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{auditAction(a)}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="a-ent">Kayıt türü</label>
          <input id="a-ent" className="field__input" value={s.entity} onChange={(e) => set({ entity: e.target.value })} placeholder="ör. payment" />
        </div>
        <div className="field"><label className="field__label" htmlFor="a-from">Başlangıç</label><input id="a-from" className="field__input" type="date" value={s.from} onChange={(e) => set({ from: e.target.value })} /></div>
        <div className="field"><label className="field__label" htmlFor="a-to">Bitiş</label><input id="a-to" className="field__input" type="date" value={s.to} onChange={(e) => set({ to: e.target.value })} /></div>
      </div>

      <div className="card">
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
                        <td className="small">{a.actor_name ?? "Sistem"}{a.ip && <div className="cell-sub mono">{a.ip}</div>}</td>
                        <td><Badge tone={a.action === "delete" ? "danger" : a.action === "create" ? "ok" : "muted"}>{auditAction(a.action)}</Badge></td>
                        <td className="small"><span className="mono">{a.entity}</span>{a.entity_id && <div className="cell-sub mono">{a.entity_id.slice(0, 8)}…</div>}</td>
                        <td className="right">
                          {(a.before || a.after) && (
                            <button className="btn btn--ghost btn--sm" type="button" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>Ayrıntı</button>
                          )}
                        </td>
                      </tr>
                      {open === a.id && (
                        <tr>
                          <td colSpan={5} style={{ background: "var(--bg-inset)" }}>
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
