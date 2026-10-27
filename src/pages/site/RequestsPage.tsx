import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AlertTriangle, BarChart3, Columns3, Hourglass, Inbox, PieChart, Plus, Wrench } from "lucide-react";
import { BarChart, Donut } from "../../components/charts";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Avatar, Badge, Empty, ErrorState, Field, FormError, IconChip, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { categoryIcon } from "../../lib/icons";
import { CATEGORIES, PRIORITIES, priorityTone, requestCategory, requestPriority, requestStatus, requestStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { DepartmentFilter, DepartmentManager } from "./Departments";
import { SlaBadge, type Sla } from "./RequestExtras";

type Req = Schemas["RequestOut"];

const STATUSES = ["open", "in_progress", "waiting", "resolved", "closed", "cancelled"];

/** Kategori hücresi: daire içinde ikon + kategori adı (ikon dekoratif, ad metin olarak yazılı). */
export function CategoryCell({ category }: { category: string }) {
  const Icon = categoryIcon(category);
  return (
    <span className="req-cat">
      <IconChip><Icon /></IconChip>
      <span className="req-cat__name">{requestCategory(category)}</span>
    </span>
  );
}

export function RequestsPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ status: "", category: "", priority: "", departman: "", page: "1" });
  const sla = useSiteGet<Record<string, Sla>>("/requests/sla");
  const r = useSiteGet<Page<Req>>("/requests", { status: s.status, category: s.category, priority: s.priority, department_id: s.departman, page: s.page, page_size: 50 });
  // Üstteki sayılar süzgeçten bağımsız: durum başına toplam (yalnız sayı istenir, page_size 1)
  const open = useSiteGet<Page<Req>>("/requests", { status: "open", page_size: 1 });
  const prog = useSiteGet<Page<Req>>("/requests", { status: "in_progress", page_size: 1 });
  const wait = useSiteGet<Page<Req>>("/requests", { status: "waiting", page_size: 1 });
  const urgent = useSiteGet<Page<Req>>("/requests", { status: "open", priority: "urgent", page_size: 1 });
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const n = (q: { data?: Page<Req> }) => q.data?.total ?? "…";

  return (
    <div className="stack">
      <PageHead
        band
        title="Talepler"
        eyebrow="Operasyon"
        subtitle={r.data ? `${r.data.total} talep` : undefined}
        actions={<>{can(P.requestsAssign) && <button className="btn" type="button" aria-expanded={managing} onClick={() => setManaging((v) => !v)}>Departmanlar</button>}<Link className="btn" to="pano"><Columns3 aria-hidden="true" /> Pano görünümü</Link><Link className="btn" to="ana-olaylar">Ana olaylar</Link>{can(P.requestsAssign) && <Link className="btn" to="ayarlar">SLA ve şablonlar</Link>}{can(P.requestsCreate) && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Yeni talep</button>}</>}
      />
      <div className="grid grid--kpi rise">
        <Kpi label="Açık" icon={<Inbox aria-hidden="true" />} value={n(open)} note="yeni gelen talepler" />
        <Kpi label="İşlemde" tone="accent" icon={<Wrench aria-hidden="true" />} value={n(prog)} note="ekip üzerinde çalışıyor" />
        <Kpi label="Beklemede" tone="warn" icon={<Hourglass aria-hidden="true" />} value={n(wait)} note="parça, firma ya da sakin bekleniyor" />
        <Kpi label="Acil" tone={typeof urgent.data?.total === "number" && urgent.data.total > 0 ? "danger" : undefined} icon={<AlertTriangle aria-hidden="true" />} value={n(urgent)} note="açık ve acil öncelikli" />
      </div>
      {managing && <DepartmentManager onClose={() => setManaging(false)} />}
      {adding && <NewRequestForm onDone={() => setAdding(false)} />}

      <RequestCharts />

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--warn"><Wrench aria-hidden="true" /></span>
          <div>
            <div className="card__title">Talep listesi</div>
            {r.data && <div className="card__meta">{r.data.total} kayıt</div>}
          </div>
          <div className="card__tools">
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
            <DepartmentFilter id="r-dep" value={s.departman} onChange={(v) => set({ departman: v })} />
          </div>
        </div>
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
                  <tr><th scope="col">Talep</th><th scope="col">Kategori</th><th scope="col">Durum ve öncelik</th><th scope="col">SLA</th><th scope="col" className="hide-sm">Departman / atanan</th><th scope="col" className="hide-sm">Açılış</th></tr>
                </thead>
                <tbody>
                  {r.data.items.map((q) => (
                    <tr key={q.id}>
                      <td className="req-title">
                        <Link to={q.id} className="cell-main">#{q.number} {q.title}</Link>
                        <div className="cell-sub">{q.unit_name ?? q.location ?? "Ortak alan"}{q.reporter_name ? ` · ${q.reporter_name}` : ""}</div>
                      </td>
                      <td><CategoryCell category={q.category} /></td>
                      <td>
                        <div className="req-badges">
                          <Badge tone={requestStatusTone(q.status)}>{q.status_label || requestStatus(q.status)}</Badge>
                          {(q.priority === "high" || q.priority === "urgent") && <Badge tone={priorityTone(q.priority)}>{requestPriority(q.priority)}</Badge>}
                        </div>
                      </td>
                      <td><SlaBadge s={sla.data?.[q.id]} /></td>
                      <td className="hide-sm">
                        {q.assigned_to ? (
                          <div className="cell-person">
                            <Avatar name={q.assigned_to} size="sm" soft />
                            <div>
                              <div className="cell-main">{q.assigned_to}</div>
                              {q.department_name && <div className="cell-sub">{q.department_name}</div>}
                            </div>
                          </div>
                        ) : q.department_name ? (
                          <Badge tone="info">{q.department_name}</Badge>
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td className="small nowrap muted hide-sm">{formatDateTime(q.created_at)}</td>
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

/**
 * Kategori dağılımı (halka) ve son 6 ayda açılan talep sayısı (çubuk). Süzgeçten bağımsız:
 * en yeni 200 talep okunur; daha fazlası varsa kart başlığı bunu söyler (sayı uydurulmaz).
 */
function RequestCharts() {
  const all = useSiteGet<Page<Req>>("/requests", { page_size: 200 });
  if (all.isError) return null;
  if (!all.data) {
    return <div className="ops-charts">{[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 260, borderRadius: "var(--r-xl)" }} />)}</div>;
  }
  const items = all.data.items;
  if (items.length === 0) return null;
  const partial = all.data.total > items.length;

  const byCat = new Map<string, number>();
  for (const q of items) byCat.set(q.category, (byCat.get(q.category) ?? 0) + 1);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  // 5'ten fazla dilim okunmaz: ilk 4 + "Diğer"
  const top = cats.slice(0, 4).map(([k, v]) => ({ label: requestCategory(k), value: v }));
  const rest = cats.slice(4).reduce((a, [, v]) => a + v, 0);
  const segments = rest > 0 ? [...top, { label: "Diğer", value: rest }] : top;

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const bars = months.map((m) => ({
    label: m.toLocaleDateString("tr-TR", { month: "short" }),
    value: items.filter((q) => { const d = new Date(q.created_at); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); }).length,
  }));
  const meta = partial ? `son ${items.length} talep` : `${items.length} talep`;

  return (
    <div className="ops-charts">
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><PieChart aria-hidden="true" /></span>
          <span className="card__title">Kategoriye göre</span>
          <span className="card__meta ml-auto">{meta}</span>
        </div>
        <div className="card__body ops-pie">
          <Donut label="Talep kategorileri" segments={segments} centerSub="talep" />
        </div>
      </div>
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span>
          <span className="card__title">Aylık açılan talep</span>
          <span className="card__meta ml-auto">son 6 ay</span>
        </div>
        <div className="card__body ops-chart">
          <BarChart label="Aylık açılan talep" data={bars} highlight={5} />
        </div>
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
      <div className="card__head"><span className="card__icon card__icon--accent"><Plus aria-hidden="true" /></span><span className="card__title">Yeni talep</span></div>
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
