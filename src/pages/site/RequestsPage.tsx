import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Columns3, Plus, Wrench } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Badge, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { CATEGORIES, PRIORITIES, priorityTone, requestCategory, requestPriority, requestStatus, requestStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Req = Schemas["RequestOut"];

const STATUSES = ["open", "in_progress", "waiting", "resolved", "closed", "cancelled"];

export function RequestsPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ status: "", category: "", priority: "", page: "1" });
  const r = useSiteGet<Page<Req>>("/requests", { status: s.status, category: s.category, priority: s.priority, page: s.page, page_size: 50 });
  const [adding, setAdding] = useState(false);

  return (
    <div className="stack">
      <PageHead
        title="Talepler"
        subtitle={r.data ? `${r.data.total} talep` : undefined}
        actions={<><Link className="btn" to="pano"><Columns3 aria-hidden="true" /> Pano görünümü</Link>{can(P.requestsCreate) && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Yeni talep</button>}</>}
      />
      {adding && <NewRequestForm onDone={() => setAdding(false)} />}

      <div className="filters">
        <div className="field">
          <label className="field__label" htmlFor="r-status">Durum</label>
          <select id="r-status" className="field__input" value={s.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Tümü</option>
            {STATUSES.map((x) => <option key={x} value={x}>{requestStatus(x)}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="r-cat">Kategori</label>
          <select id="r-cat" className="field__input" value={s.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Tümü</option>
            {CATEGORIES.map((x) => <option key={x} value={x}>{requestCategory(x)}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="r-pri">Öncelik</label>
          <select id="r-pri" className="field__input" value={s.priority} onChange={(e) => set({ priority: e.target.value })}>
            <option value="">Tümü</option>
            {PRIORITIES.map((x) => <option key={x} value={x}>{requestPriority(x)}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card__body card__body--flush">
          {r.isPending ? (
            <Loading />
          ) : r.isError ? (
            <div className="card__body"><ErrorState error={r.error} onRetry={() => r.refetch()} /></div>
          ) : r.data.items.length === 0 ? (
            <Empty title="Bu filtreye uyan talep yok" icon={<Wrench aria-hidden="true" />} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Talepler</caption>
                <thead>
                  <tr><th scope="col">Talep</th><th scope="col">Kategori</th><th scope="col">Durum</th><th scope="col">Atanan</th><th scope="col">Açılış</th></tr>
                </thead>
                <tbody>
                  {r.data.items.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link to={q.id} className="cell-main">#{q.number} {q.title}</Link>
                        <div className="cell-sub">{q.unit_name ?? q.location ?? "Ortak alan"}{q.reporter_name ? ` · ${q.reporter_name}` : ""}</div>
                      </td>
                      <td className="small">{requestCategory(q.category)}</td>
                      <td>
                        <Badge tone={requestStatusTone(q.status)}>{q.status_label || requestStatus(q.status)}</Badge>
                        {(q.priority === "high" || q.priority === "urgent") && <div style={{ marginTop: 4 }}><Badge tone={priorityTone(q.priority)}>{requestPriority(q.priority)}</Badge></div>}
                      </td>
                      <td className="small">{q.assigned_to ?? <span className="subtle">—</span>}</td>
                      <td className="small nowrap">{formatDateTime(q.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {r.data && (
          <div className="card__foot">
            <Pager page={r.data.page} pageSize={r.data.page_size} total={r.data.total} onPage={(p) => set({ page: String(p) })} />
          </div>
        )}
      </div>
    </div>
  );
}

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ title: "", description: "", category: "other", priority: "normal", location: "" });
  const m = useSiteMutation<Record<string, unknown>, Schemas["RequestDetail"]>("POST", "/requests", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      title: f.title.trim(),
      description: f.description.trim() || null,
      category: f.category,
      priority: f.priority,
      unit_id: unit?.id ?? null,
      location: unit ? null : f.location.trim() || null,
    });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Yeni talep</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Başlık" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" value={f.title} onChange={up("title")} placeholder="ör. B blok asansörü çalışmıyor" />}</Field>
        <div className="grid grid--kpi">
          <Field label="Kategori">{(p) => <select {...p} className="field__input" value={f.category} onChange={up("category")}>{CATEGORIES.map((x) => <option key={x} value={x}>{requestCategory(x)}</option>)}</select>}</Field>
          <Field label="Öncelik">{(p) => <select {...p} className="field__input" value={f.priority} onChange={up("priority")}>{PRIORITIES.map((x) => <option key={x} value={x}>{requestPriority(x)}</option>)}</select>}</Field>
          {!unit && <Field label="Yer (ortak alan)">{(p) => <input {...p} className="field__input" value={f.location} onChange={up("location")} placeholder="ör. Otopark girişi" />}</Field>}
        </div>
        <UnitPicker label="Bölüm" value={unit} onChange={setUnit} allowEmptyLabel="ortak alan talebi" />
        <Field label="Açıklama">{(p) => <textarea {...p} className="field__input" rows={3} value={f.description} onChange={up("description")} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.title.trim()}>Talebi aç</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
