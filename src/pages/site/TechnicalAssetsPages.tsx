import { Fragment, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { CalendarClock, Cog, FileText, History, Plus, Wrench } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { LinkedDocuments, useLinkedDownload } from "../../components/LinkedDocuments";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { TECH_CATEGORIES, dueWarning, dueWarningTone, inspectionResult, maintenanceRunStatus, periodUnit, requestStatus, techCategory, techStatus, techStatusTone, timelineKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Üretilmiş tipler — teknik varlık, yasal muayene, periyodik bakım (HIZ-06/07, K28). */
type Asset = Schemas["TechnicalAssetOut"];
type AssetDetail = Schemas["TechnicalAssetDetailOut"];
type Schedule = Schemas["InspectionScheduleOut"];
type InspTemplate = Schemas["InspectionTemplateOut"];
type CalendarRow = Schemas["InspectionCalendarRowOut"];
type Plan = Schemas["MaintenancePlanOut"];
type Run = Schemas["MaintenanceRunOut"];
type Timeline = Schemas["AssetTimelineOut"];
type Contract = Schemas["ContractOut"];

const STATUSES = ["working", "faulty", "out_of_service", "nonconforming"];
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="row" role="tablist" aria-label={label} style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className={`btn btn--sm${v === k ? " btn--primary" : ""}`} onClick={() => set(k)}>{l}</button>)}</div>
);
function DueBadge({ s }: { s: Schedule }) {
  if (!s.is_active) return <Badge>Kapalı</Badge>;
  if (!s.warning) return <Badge tone="ok">{formatDate(s.next_due_on)}</Badge>;
  return <Badge tone={dueWarningTone(s.warning)}>{s.warning === "overdue" ? `${-s.days_left} gün geçti` : `${s.days_left} gün kaldı`}</Badge>;
}

// ===================================================================== Liste
/** Teknik varlıklar (HIZ-07, K28): mali demirbaştan ayrı liste; yasal muayene takvimi ve periyodik bakım. */
export function TechnicalAssetsPage() {
  useDocumentTitle("Teknik varlıklar");
  const [s, set] = useUrlState({ sekme: "varlik" });
  return (
    <div className="stack">
      <PageHead title="Teknik varlıklar" subtitle="Asansör, jeneratör, hidrofor, yangın sistemi… Yasal muayene takvimi (60/30/7 gün uyarısı) ve periyodik bakım iş emirleri. Mali demirbaşlar Demirbaş ve Stok ekranında." />
      {tabs([["varlik", "Varlıklar"], ["takvim", "Muayene takvimi"], ["bakim", "Periyodik bakım"]], s.sekme, (k) => set({ sekme: k }), "Teknik varlık")}
      {s.sekme === "takvim" ? <InspectionCalendar /> : s.sekme === "bakim" ? <Maintenance /> : <AssetList />}
    </div>
  );
}

function AssetList() {
  const { can, site } = useSite();
  const [f, setF] = useUrlState({ kategori: "", durum: "" });
  const q = useSiteGet<Asset[]>("/technical-assets", { category: f.kategori || undefined, status: f.durum || undefined });
  const [adding, setAdding] = useState(false);
  const rows = q.data ?? [];
  const due = rows.filter((a) => a.next_inspection?.warning).length;
  return (
    <>
      <div className="grid grid--kpi"><Kpi label="Varlık" value={rows.length} /><Kpi label="Muayenesi yaklaşan / geçen" value={due} tone={due ? "warn" : undefined} /><Kpi label="Arızalı / uygunsuz" value={rows.filter((a) => a.status === "faulty" || a.status === "nonconforming").length} /></div>
      <div className="filters">
        <div className="field"><label className="field__label" htmlFor="ta-k">Kategori</label><select id="ta-k" className="field__input" value={f.kategori} onChange={(e) => setF({ kategori: e.target.value })}><option value="">Tümü</option>{TECH_CATEGORIES.map((c) => <option key={c} value={c}>{techCategory(c)}</option>)}</select></div>
        <div className="field"><label className="field__label" htmlFor="ta-d">Durum</label><select id="ta-d" className="field__input" value={f.durum} onChange={(e) => setF({ durum: e.target.value })}><option value="">Tümü</option>{STATUSES.map((c) => <option key={c} value={c}>{techStatus(c)}</option>)}</select></div>
        {can(P.inventoryManage) && <div className="field" style={{ justifyContent: "flex-end" }}><button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Varlık ekle</button></div>}
      </div>
      {adding && <AssetForm onDone={() => setAdding(false)} />}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : rows.length === 0 ? <Empty title="Teknik varlık yok" icon={<Cog aria-hidden="true" />}>Asansör, jeneratör gibi varlıkları ekleyin; yasal muayene tarihleri takip edilir.</Empty> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Teknik varlıklar</caption>
            <thead><tr><th scope="col">Varlık</th><th scope="col">Konum</th><th scope="col">Durum</th><th scope="col">Sıradaki muayene</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}>
                <td><Link className="cell-main" to={`/s/${site.slug}/teknik-varliklar/${a.id}`}>{a.name}</Link><div className="cell-sub"><span className="mono">{a.code}</span> · {techCategory(a.category)}{a.brand && ` · ${a.brand}`}{a.model && ` ${a.model}`}{a.under_warranty && " · garantide"}</div></td>
                <td className="small">{a.location ?? "—"}{a.service_company && <div className="cell-sub">{a.service_company}</div>}</td>
                <td><Badge tone={techStatusTone(a.status)}>{techStatus(a.status)}</Badge></td>
                <td className="small">{a.next_inspection ? <>{a.next_inspection.name}<div><DueBadge s={a.next_inspection} /> <span className="cell-sub">{formatDate(a.next_inspection.next_due_on)}</span></div></> : <span className="muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

interface SuggestState { on: boolean; last: string; period: string }
function AssetForm({ onDone }: { onDone: () => void }) {
  const tq = useSiteGet<InspTemplate[]>("/asset-inspection-templates");
  const cq = useSiteGet<Contract[]>("/contracts");
  const [f, setF] = useState({ category: "elevator", name: "", location: "", brand: "", model: "", serial_no: "", installed_on: "", warranty_until: "", contract_id: "", service_company: "", note: "" });
  const [sug, setSug] = useState<Record<string, SuggestState>>({});
  const m = useSiteMutation<Record<string, unknown>, Asset>("POST", "/technical-assets", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const suggested = (tq.data ?? []).filter((t) => t.categories.includes(f.category as InspTemplate["categories"][number]));
  const st = (t: InspTemplate): SuggestState => sug[t.key] ?? { on: true, last: "", period: String(t.period_months) };
  function submit(e: FormEvent) {
    e.preventDefault();
    const inspections = suggested.filter((t) => st(t).on).map((t) => ({ template_key: t.key, period_months: Number(st(t).period) || t.period_months, last_inspected_on: st(t).last || null, next_due_on: st(t).last ? null : todayIso() }));
    const blank = (v: string) => v.trim() || null;
    m.mutate({ category: f.category, name: f.name, location: blank(f.location), brand: blank(f.brand), model: blank(f.model), serial_no: blank(f.serial_no), installed_on: f.installed_on || null, warranty_until: f.warranty_until || null, contract_id: f.contract_id || null, service_company: blank(f.service_company), note: blank(f.note), status: "working", inspections });
  }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__head"><span className="card__title">Yeni teknik varlık</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Kategori" required error={fieldError(m.error, "category")}>{(p) => <select {...p} className="field__input" value={f.category} onChange={up("category")}>{TECH_CATEGORIES.map((c) => <option key={c} value={c}>{techCategory(c)}</option>)}</select>}</Field>
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={120} placeholder="ör. A Blok asansörü" value={f.name} onChange={up("name")} />}</Field>
          <Field label="Konum">{(p) => <input {...p} className="field__input" maxLength={120} value={f.location} onChange={up("location")} />}</Field>
          <Field label="Marka">{(p) => <input {...p} className="field__input" maxLength={80} value={f.brand} onChange={up("brand")} />}</Field>
          <Field label="Model">{(p) => <input {...p} className="field__input" maxLength={80} value={f.model} onChange={up("model")} />}</Field>
          <Field label="Seri no">{(p) => <input {...p} className="field__input mono" maxLength={80} value={f.serial_no} onChange={up("serial_no")} />}</Field>
          <Field label="Kurulum">{(p) => <input {...p} className="field__input" type="date" value={f.installed_on} onChange={up("installed_on")} />}</Field>
          <Field label="Garanti bitişi" error={fieldError(m.error, "warranty_until")}>{(p) => <input {...p} className="field__input" type="date" value={f.warranty_until} onChange={up("warranty_until")} />}</Field>
          <Field label="Sorumlu firma">{(p) => <input {...p} className="field__input" maxLength={120} value={f.service_company} onChange={up("service_company")} />}</Field>
          <Field label="Bakım sözleşmesi" error={fieldError(m.error, "contract_id")}>{(p) => <select {...p} className="field__input" value={f.contract_id} onChange={up("contract_id")}><option value="">—</option>{(cq.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.vendor} — {c.subject}</option>)}</select>}</Field>
        </div>
        {suggested.length > 0 && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: "var(--s-2)" }}>
            <legend className="field__label">Önerilen yasal muayeneler</legend>
            {suggested.map((t, i) => (
              <div key={t.key} className="stack" style={{ gap: "var(--s-1)" }}>
                <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="check" style={{ minHeight: 44, flex: "1 1 14rem" }}><input type="checkbox" checked={st(t).on} onChange={(e) => setSug((x) => ({ ...x, [t.key]: { ...st(t), on: e.target.checked } }))} /><span>{t.name}</span></label>
                  {st(t).on && <>
                    <div className="field" style={{ flex: "0 1 7rem" }}><label className="field__label" htmlFor={`sp-${t.key}`}>Periyot (ay)</label><input id={`sp-${t.key}`} className="field__input" inputMode="numeric" value={st(t).period} onChange={(e) => setSug((x) => ({ ...x, [t.key]: { ...st(t), period: e.target.value.replace(/\D/g, "") } }))} /></div>
                    <div className="field" style={{ flex: "0 1 11rem" }}><label className="field__label" htmlFor={`sl-${t.key}`}>Son muayene</label><input id={`sl-${t.key}`} className="field__input" type="date" max={todayIso()} value={st(t).last} onChange={(e) => setSug((x) => ({ ...x, [t.key]: { ...st(t), last: e.target.value } }))} /></div>
                  </>}
                </div>
                {st(t).on && ["name", "period_months", "last_inspected_on", "template_key"].map((k) => fieldError(m.error, `inspections.${suggested.filter((x) => st(x).on).indexOf(t)}.${k}`)).filter(Boolean).map((v) => <span key={v} className="field__error" role="alert">{v}</span>)}
                {i === suggested.length - 1 && <span className="xs muted">Son muayene boşsa sıradaki muayene bugün sayılır; periyot mevzuata ve ekipmana göre düzenlenebilir.</span>}
              </div>
            ))}
          </fieldset>
        )}
        <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={500} value={f.note} onChange={up("note")} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Ekle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function InspectionCalendar() {
  const { site } = useSite();
  const q = useSiteGet<CalendarRow[]>("/asset-inspections/calendar");
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><CalendarClock aria-hidden="true" /></span><span className="card__title">Yasal muayene takvimi</span><span className="card__meta ml-auto">60, 30 ve 7 gün kala yöneticilere bildirim gider</span></div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Takvimde muayene yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Muayene takvimi</caption>
            <thead><tr><th scope="col">Tarih</th><th scope="col">Muayene</th><th scope="col">Varlık</th><th scope="col">Durum</th></tr></thead>
            <tbody>{q.data.map((r) => (
              <tr key={r.schedule.id}>
                <td className="nowrap">{formatDate(r.schedule.next_due_on)}<div className="cell-sub">her {r.schedule.period_months} ayda</div></td>
                <td className="small">{r.schedule.name}{r.schedule.last_inspected_on && <div className="cell-sub">son: {formatDate(r.schedule.last_inspected_on)}</div>}</td>
                <td><Link className="cell-main" to={`/s/${site.slug}/teknik-varliklar/${r.asset_id}`}>{r.asset_name}</Link><div className="cell-sub"><span className="mono">{r.asset_code}</span> · {techCategory(r.asset_category)}{r.location && ` · ${r.location}`}{r.service_company && ` · ${r.service_company}`}</div></td>
                <td>{r.schedule.warning ? <Badge tone={dueWarningTone(r.schedule.warning)}>{dueWarning(r.schedule.warning)}</Badge> : <Badge tone="ok">Zamanı var</Badge>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function Maintenance() {
  const { can, site } = useSite();
  const canManage = can(P.inventoryManage);
  const pq = useSiteGet<Plan[]>("/maintenance-plans");
  const rq = useSiteGet<Run[]>("/maintenance-runs", { status: "open" });
  const [adding, setAdding] = useState(false);
  return (
    <>
      {canManage && <div className="row"><button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Bakım planı ekle</button></div>}
      {adding && <PlanForm onDone={() => setAdding(false)} />}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><Wrench aria-hidden="true" /></span><span className="card__title">Açık bakım iş emirleri</span></div>
        <div className="card__body card__body--flush">
          {rq.isPending ? <Loading /> : rq.isError ? <div className="card__body"><ErrorState error={rq.error} /></div> : rq.data.length === 0 ? <Empty title="Açık bakım iş emri yok">Planlanan tarih gelince gece işi iş emri (talep) açar.</Empty> : <RunTable runs={rq.data} canManage={canManage} />}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Bakım planları</span></div>
        <div className="card__body card__body--flush">
          {pq.isPending ? <Loading /> : pq.isError ? <div className="card__body"><ErrorState error={pq.error} /></div> : pq.data.length === 0 ? <Empty title="Bakım planı yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Bakım planları</caption>
              <thead><tr><th scope="col">Bakım</th><th scope="col">Varlık</th><th scope="col">Periyot</th><th scope="col">Sıradaki</th>{canManage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
              <tbody>{pq.data.map((p) => (
                <tr key={p.id}>
                  <td className="cell-main">{p.title}{!p.is_active && <> <Badge>Kapalı</Badge></>}{p.responsible && <div className="cell-sub">{p.responsible}</div>}</td>
                  <td className="small"><Link to={`/s/${site.slug}/teknik-varliklar/${p.asset_id}`}>{p.asset_name}</Link><div className="cell-sub mono">{p.asset_code}</div></td>
                  <td className="small">her {p.period_count} {periodUnit(p.period_unit)}</td>
                  <td className="small nowrap">{formatDate(p.next_due_on)}{p.open_run_id ? <div><Badge tone="info">İş emri açık</Badge></div> : p.days_left < 0 && p.is_active ? <div><Badge tone="warn">Gecikti</Badge></div> : null}</td>
                  {canManage && <td className="right nowrap"><PlanActions p={p} /></td>}
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </>
  );
}

function PlanActions({ p }: { p: Plan }) {
  const open = useSiteMutation<Record<string, never>, Run>("POST", `/maintenance-plans/${p.id}/runs`);
  const toggle = useSiteMutation<{ is_active: boolean }, Plan>("PATCH", `/maintenance-plans/${p.id}`);
  return <>{p.is_active && !p.open_run_id && <ConfirmButton className="btn btn--sm" title="Bakım iş emri aç" confirmLabel="İş emri aç" body={`${formatDate(p.next_due_on)} tarihli bakım için iş emri (talep) şimdi açılır.`} onConfirm={() => open.mutateAsync({})}>Şimdi iş emri aç</ConfirmButton>}{" "}<button className="btn btn--ghost btn--sm" type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ is_active: !p.is_active })}>{p.is_active ? "Kapat" : "Aç"}</button></>;
}

function RunTable({ runs, canManage }: { runs: Run[]; canManage: boolean }) {
  const { site } = useSite();
  return (
    <div className="table-wrap"><table className="data"><caption className="visually-hidden">Bakım iş emirleri</caption>
      <thead><tr><th scope="col">Bakım</th><th scope="col">Tarih</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
      <tbody>{runs.map((r) => (
        <tr key={r.id}>
          <td><div className="cell-main">{r.plan_title}</div><div className="cell-sub"><Link to={`/s/${site.slug}/teknik-varliklar/${r.asset_id}`}>{r.asset_name}</Link>{r.request_id && <> · <Link to={`/s/${site.slug}/talepler/${r.request_id}`}>talep #{r.request_number}</Link></>}</div></td>
          <td className="small nowrap">{formatDate(r.due_on)}{r.done_on && <div className="cell-sub">yapıldı {formatDate(r.done_on)}</div>}</td>
          <td><Badge tone={r.status === "done" ? "ok" : r.status === "skipped" ? "muted" : "info"}>{maintenanceRunStatus(r.status)}</Badge>{r.cost && <div className="cell-sub"><Money value={r.cost} /></div>}{r.note && <div className="cell-sub">{r.note}</div>}</td>
          <td className="right nowrap">{canManage && r.status === "open" && <RunComplete r={r} />}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function RunComplete({ r }: { r: Run }) {
  const [f, setF] = useState({ status: "done", done_on: todayIso(), cost: "", note: "", issue_found: false, issue_description: "" });
  const m = useSiteMutation<Record<string, unknown>, Run>("POST", `/maintenance-runs/${r.id}/complete`);
  return (
    <ConfirmButton className="btn btn--sm btn--primary" title={`${r.plan_title} — bakımı kapat`} confirmLabel="Kaydet"
      body={<div className="stack" style={{ gap: "var(--s-3)" }}>
        <div className="field"><label className="field__label" htmlFor={`rs-${r.id}`}>Sonuç</label><select id={`rs-${r.id}`} className="field__input" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}><option value="done">Yapıldı</option><option value="skipped">Yapılmadı</option></select></div>
        <div className="field"><label className="field__label" htmlFor={`rd-${r.id}`}>Tarih</label><input id={`rd-${r.id}`} className="field__input" type="date" max={todayIso()} value={f.done_on} onChange={(e) => setF((x) => ({ ...x, done_on: e.target.value }))} /></div>
        {f.status === "done" && <div className="field"><label className="field__label" htmlFor={`rc-${r.id}`}>Bedel (₺)</label><input id={`rc-${r.id}`} className="field__input" inputMode="decimal" value={f.cost} onChange={(e) => setF((x) => ({ ...x, cost: e.target.value }))} /></div>}
        <div className="field"><label className="field__label" htmlFor={`rn-${r.id}`}>{f.status === "skipped" ? "Neden yapılmadı *" : "Not"}</label><input id={`rn-${r.id}`} className="field__input" maxLength={300} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} /></div>
        {f.status === "done" && <label className="check"><input type="checkbox" checked={f.issue_found} onChange={(e) => setF((x) => ({ ...x, issue_found: e.target.checked }))} /><span>Sorun bulundu — arıza iş emri aç</span></label>}
        {f.status === "done" && f.issue_found && <div className="field"><label className="field__label" htmlFor={`ri-${r.id}`}>Bulunan sorun *</label><input id={`ri-${r.id}`} className="field__input" maxLength={300} value={f.issue_description} onChange={(e) => setF((x) => ({ ...x, issue_description: e.target.value }))} /></div>}
      </div>}
      onConfirm={() => m.mutateAsync({ status: f.status, done_on: f.done_on || null, cost: f.status === "done" ? parseMoneyInput(f.cost) ?? null : null, note: f.note || null, issue_found: f.status === "done" && f.issue_found, issue_description: f.issue_description || null })}>Kapat</ConfirmButton>
  );
}

function PlanForm({ onDone, assetId }: { onDone: () => void; assetId?: string }) {
  const aq = useSiteGet<Asset[]>("/technical-assets", undefined, { enabled: !assetId });
  const [f, setF] = useState({ asset_id: assetId ?? "", title: "", description: "", period_unit: "month", period_count: "1", next_due_on: todayIso(), responsible: "" });
  const m = useSiteMutation<Record<string, unknown>, Plan>("POST", "/maintenance-plans", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, asset_id: f.asset_id || null, period_count: Number(f.period_count) || null, description: f.description || null, responsible: f.responsible || null, next_due_on: f.next_due_on || null }); }}>
      <div className="card__head"><span className="card__title">Yeni bakım planı</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          {!assetId && <Field label="Varlık" required error={fieldError(m.error, "asset_id")}>{(p) => <select {...p} className="field__input" value={f.asset_id} onChange={up("asset_id")}><option value="">Seçin</option>{(aq.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>}</Field>}
          <Field label="Bakım işi" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={120} placeholder="ör. Aylık asansör bakımı" value={f.title} onChange={up("title")} />}</Field>
          <Field label="Her" error={fieldError(m.error, "period_count")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.period_count} onChange={(e) => setF((x) => ({ ...x, period_count: e.target.value.replace(/\D/g, "") }))} />}</Field>
          <Field label="Birim" error={fieldError(m.error, "period_unit")}>{(p) => <select {...p} className="field__input" value={f.period_unit} onChange={up("period_unit")}><option value="week">hafta</option><option value="month">ay</option></select>}</Field>
          <Field label="İlk bakım" required error={fieldError(m.error, "next_due_on")}>{(p) => <input {...p} className="field__input" type="date" value={f.next_due_on} onChange={up("next_due_on")} />}</Field>
          <Field label="Sorumlu (ekip / firma)">{(p) => <input {...p} className="field__input" maxLength={120} value={f.responsible} onChange={up("responsible")} />}</Field>
        </div>
        <Field label="Açıklama / kontrol maddeleri">{(p) => <input {...p} className="field__input" maxLength={500} value={f.description} onChange={up("description")} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

// ===================================================================== Detay
/** Varlık kartı (HIZ-07): bilgiler, yasal muayene takvimi ve sonuçları, bakım planları, belgeler, zaman çizelgesi. */
export function TechnicalAssetDetailPage() {
  const { assetId = "" } = useParams();
  const { can, site } = useSite();
  const canManage = can(P.inventoryManage);
  const q = useSiteGet<AssetDetail>(`/technical-assets/${assetId}`);
  const [s, set] = useUrlState({ sekme: "kart" });
  useDocumentTitle(q.data ? `${q.data.asset.code} ${q.data.asset.name}` : "Teknik varlık");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const { asset } = q.data;
  return (
    <div className="stack">
      <div className="small"><Link to={`/s/${site.slug}/teknik-varliklar`}>← Teknik varlıklar</Link></div>
      <PageHead title={`${asset.name}`} subtitle={<><span className="mono">{asset.code}</span> · {techCategory(asset.category)}{asset.location && ` · ${asset.location}`} · <Badge tone={techStatusTone(asset.status)}>{techStatus(asset.status)}</Badge></>} />
      {tabs([["kart", "Kart ve muayene"], ["bakim", "Bakım"], ["zaman", "Zaman çizelgesi"]], s.sekme, (k) => set({ sekme: k }), "Varlık")}
      {s.sekme === "zaman" ? <AssetTimeline id={asset.id} /> : s.sekme === "bakim" ? <AssetMaintenance d={q.data} canManage={canManage} /> : <AssetCard d={q.data} canManage={canManage} />}
    </div>
  );
}

function AssetCard({ d, canManage }: { d: AssetDetail; canManage: boolean }) {
  const { site } = useSite();
  const dl = useLinkedDownload();
  const { asset } = d;
  const [editing, setEditing] = useState(false);
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const names = new Map(d.inspections.map((x) => [x.id, x.name]));
  return (
    <>
      <div className="card">
        <div className="card__head"><span className="card__title">Varlık kartı</span>{canManage && <button className="btn btn--ghost btn--sm ml-auto" type="button" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>Düzenle</button>}</div>
        <div className="card__body">
          {editing ? <AssetEdit a={asset} onDone={() => setEditing(false)} /> : (
            <dl className="mb-0">
              {([["Marka / model", [asset.brand, asset.model].filter(Boolean).join(" ") || "—"], ["Seri no", asset.serial_no ?? "—"], ["Kurulum", formatDate(asset.installed_on)], ["Garanti bitişi", asset.warranty_until ? `${formatDate(asset.warranty_until)}${asset.under_warranty ? " (garantide)" : ""}` : "—"], ["Sorumlu firma", asset.service_company ?? "—"], ["Bakım sözleşmesi", asset.contract_name ?? "—"], ["Not", asset.note ?? "—"]] as [string, string][]).map(([k, v]) => <div key={k} className="kv"><dt className="kv__k">{k}</dt><dd className="kv__v">{v}</dd></div>)}
            </dl>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><CalendarClock aria-hidden="true" /></span><span className="card__title">Yasal muayene takvimi</span>{canManage && <button className="btn btn--ghost btn--sm ml-auto" type="button" aria-expanded={addingSchedule} onClick={() => setAddingSchedule((v) => !v)}><Plus aria-hidden="true" /> Muayene ekle</button>}</div>
        <div className="card__body card__body--flush">
          {addingSchedule && <div className="card__body"><ScheduleForm assetId={asset.id} category={asset.category} onDone={() => setAddingSchedule(false)} /></div>}
          {d.inspections.length === 0 ? <Empty title="Muayene tanımlı değil" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Muayene takvimi</caption>
              <thead><tr><th scope="col">Muayene</th><th scope="col">Son</th><th scope="col">Sıradaki</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
              <tbody>{d.inspections.map((x) => (
                <Fragment key={x.id}>
                  <tr>
                    <td className="cell-main">{x.name}<div className="cell-sub">her {x.period_months} ayda</div></td>
                    <td className="small">{formatDate(x.last_inspected_on)}</td>
                    <td className="small nowrap">{formatDate(x.next_due_on)} <DueBadge s={x} /></td>
                    <td className="right nowrap">{canManage && <>{x.is_active && <button className="btn btn--sm btn--primary" type="button" aria-expanded={recording === x.id} onClick={() => setRecording((v) => (v === x.id ? null : x.id))}>Sonuç kaydet</button>} <ToggleSchedule s={x} /></>}</td>
                  </tr>
                  {recording === x.id && <tr><td colSpan={4}><RecordForm s={x} onDone={() => setRecording(null)} /></td></tr>}
                </Fragment>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__icon"><History aria-hidden="true" /></span><span className="card__title">Muayene geçmişi</span></div>
        <div className="card__body card__body--flush">
          {d.records.length === 0 ? <Empty title="Muayene kaydı yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Muayene geçmişi</caption>
              <thead><tr><th scope="col">Tarih</th><th scope="col">Muayene</th><th scope="col">Sonuç</th><th scope="col" className="right">Bedel</th><th scope="col">Rapor</th></tr></thead>
              <tbody>{d.records.map((r) => (
                <tr key={r.id}>
                  <td className="small nowrap">{formatDate(r.inspected_on)}<div className="cell-sub">{r.by}</div></td>
                  <td className="small">{names.get(r.schedule_id) ?? "—"}{r.inspector && <div className="cell-sub">{r.inspector}</div>}{r.note && <div className="cell-sub">{r.note}</div>}</td>
                  <td><Badge tone={r.result === "pass" ? "ok" : "danger"}>{inspectionResult(r.result)}</Badge>{r.request_id && <div className="cell-sub"><Link to={`/s/${site.slug}/talepler/${r.request_id}`}>düzeltme iş emri</Link></div>}</td>
                  <td className="right">{r.cost ? <Money value={r.cost} /> : "—"}</td>
                  <td><button className="btn btn--ghost btn--sm" type="button" onClick={() => dl(r.report_document_id, `muayene-raporu-${r.inspected_on}`)}><FileText aria-hidden="true" /> Rapor</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Belgeler</span></div>
        <div className="card__body"><LinkedDocuments subjectType="technical_assets" subjectId={asset.id} docs={d.documents} canManage={canManage} /></div>
      </div>
    </>
  );
}

function AssetEdit({ a, onDone }: { a: Asset; onDone: () => void }) {
  const cq = useSiteGet<Contract[]>("/contracts");
  const [f, setF] = useState({ name: a.name, location: a.location ?? "", brand: a.brand ?? "", model: a.model ?? "", serial_no: a.serial_no ?? "", installed_on: a.installed_on ?? "", warranty_until: a.warranty_until ?? "", contract_id: a.contract_id ?? "", service_company: a.service_company ?? "", status: a.status as string, note: a.note ?? "" });
  const m = useSiteMutation<Record<string, unknown>, Asset>("PATCH", `/technical-assets/${a.id}`, { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const blank = (v: string) => v.trim() || null;
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ name: f.name, location: blank(f.location), brand: blank(f.brand), model: blank(f.model), serial_no: blank(f.serial_no), installed_on: f.installed_on || null, warranty_until: f.warranty_until || null, contract_id: f.contract_id || null, service_company: blank(f.service_company), status: f.status, note: blank(f.note) }); }}>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.name} onChange={up("name")} />}</Field>
        <Field label="Durum" error={fieldError(m.error, "status")}>{(p) => <select {...p} className="field__input" value={f.status} onChange={up("status")}>{STATUSES.map((x) => <option key={x} value={x}>{techStatus(x)}</option>)}</select>}</Field>
        <Field label="Konum">{(p) => <input {...p} className="field__input" maxLength={120} value={f.location} onChange={up("location")} />}</Field>
        <Field label="Marka">{(p) => <input {...p} className="field__input" maxLength={80} value={f.brand} onChange={up("brand")} />}</Field>
        <Field label="Model">{(p) => <input {...p} className="field__input" maxLength={80} value={f.model} onChange={up("model")} />}</Field>
        <Field label="Seri no">{(p) => <input {...p} className="field__input mono" maxLength={80} value={f.serial_no} onChange={up("serial_no")} />}</Field>
        <Field label="Kurulum">{(p) => <input {...p} className="field__input" type="date" value={f.installed_on} onChange={up("installed_on")} />}</Field>
        <Field label="Garanti bitişi" error={fieldError(m.error, "warranty_until")}>{(p) => <input {...p} className="field__input" type="date" value={f.warranty_until} onChange={up("warranty_until")} />}</Field>
        <Field label="Sorumlu firma">{(p) => <input {...p} className="field__input" maxLength={120} value={f.service_company} onChange={up("service_company")} />}</Field>
        <Field label="Bakım sözleşmesi" error={fieldError(m.error, "contract_id")}>{(p) => <select {...p} className="field__input" value={f.contract_id} onChange={up("contract_id")}><option value="">—</option>{(cq.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.vendor} — {c.subject}</option>)}</select>}</Field>
      </div>
      <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={500} value={f.note} onChange={up("note")} />}</Field>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ScheduleForm({ assetId, category, onDone }: { assetId: string; category: string; onDone: () => void }) {
  const tq = useSiteGet<InspTemplate[]>("/asset-inspection-templates");
  const [f, setF] = useState({ template_key: "", name: "", period_months: "12", last_inspected_on: "", next_due_on: "" });
  const m = useSiteMutation<Record<string, unknown>, Schedule>("POST", `/technical-assets/${assetId}/inspection-schedules`, { onSuccess: onDone });
  const templates = tq.data ?? [];
  const fitting = [...templates.filter((t) => t.categories.includes(category as InspTemplate["categories"][number])), ...templates.filter((t) => !t.categories.includes(category as InspTemplate["categories"][number]))];
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ template_key: f.template_key || null, name: f.name || null, period_months: Number(f.period_months) || null, last_inspected_on: f.last_inspected_on || null, next_due_on: f.next_due_on || null }); }}>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Şablon" error={fieldError(m.error, "template_key")}>{(p) => <select {...p} className="field__input" value={f.template_key} onChange={(e) => { const t = templates.find((x) => x.key === e.target.value); setF((x) => ({ ...x, template_key: e.target.value, period_months: t ? String(t.period_months) : x.period_months })); }}><option value="">— serbest —</option>{fitting.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select>}</Field>
        <Field label="Ad" hint="Şablonda boş bırakılabilir" error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.name} onChange={up("name")} />}</Field>
        <Field label="Periyot (ay)" error={fieldError(m.error, "period_months")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.period_months} onChange={(e) => setF((x) => ({ ...x, period_months: e.target.value.replace(/\D/g, "") }))} />}</Field>
        <Field label="Son muayene" error={fieldError(m.error, "last_inspected_on")}>{(p) => <input {...p} className="field__input" type="date" max={todayIso()} value={f.last_inspected_on} onChange={up("last_inspected_on")} />}</Field>
        {!f.last_inspected_on && <Field label="Sıradaki muayene" hint="Son muayene bilinmiyorsa">{(p) => <input {...p} className="field__input" type="date" value={f.next_due_on} onChange={up("next_due_on")} />}</Field>}
      </div>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Takvime ekle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ToggleSchedule({ s }: { s: Schedule }) {
  const m = useSiteMutation<{ is_active: boolean }, Schedule>("PATCH", `/asset-inspection-schedules/${s.id}`);
  return <button className="btn btn--ghost btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ is_active: !s.is_active })}>{s.is_active ? "Takibi kapat" : "Takibi aç"}</button>;
}

function RecordForm({ s, onDone }: { s: Schedule; onDone: () => void }) {
  const [f, setF] = useState({ inspected_on: todayIso(), result: "pass", inspector: "", note: "", cost: "" });
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const m = useSiteMutation<FormData, Schemas["InspectionRecordOut"]>("POST", `/asset-inspection-schedules/${s.id}/records`, { form: true, onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function pick(fl: File | undefined) {
    setFileErr(null); setFile(null);
    if (!fl) return;
    if (fl.size > 10 * 1024 * 1024) { setFileErr("Dosya en fazla 10 MB."); return; }
    setFile(fl);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) { setFileErr("Muayene raporunu yükleyin (zorunlu)."); return; }
    const fd = new FormData();
    fd.set("inspected_on", f.inspected_on); fd.set("result", f.result);
    if (f.inspector.trim()) fd.set("inspector", f.inspector.trim());
    if (f.note.trim()) fd.set("note", f.note.trim());
    const cost = parseMoneyInput(f.cost); if (cost) fd.set("cost", cost);
    fd.set("report", file, file.name);
    m.mutate(fd);
  }
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Muayene tarihi" required error={fieldError(m.error, "inspected_on")}>{(p) => <input {...p} className="field__input" type="date" max={todayIso()} value={f.inspected_on} onChange={up("inspected_on")} />}</Field>
        <Field label="Sonuç" required error={fieldError(m.error, "result")}>{(p) => <select {...p} className="field__input" value={f.result} onChange={up("result")}><option value="pass">Olumlu</option><option value="fail">Olumsuz</option></select>}</Field>
        <Field label="Muayene kuruluşu">{(p) => <input {...p} className="field__input" maxLength={120} value={f.inspector} onChange={up("inspector")} />}</Field>
        <Field label="Bedel (₺)" error={fieldError(m.error, "cost")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.cost} onChange={up("cost")} />}</Field>
      </div>
      <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={500} value={f.note} onChange={up("note")} />}</Field>
      <div className="field">
        <label className="field__label" htmlFor={`rr-${s.id}`}>Muayene raporu (PDF, PNG, JPEG, WebP · ≤ 10 MB) *</label>
        <input id={`rr-${s.id}`} className="field__input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
        {(fileErr || fieldError(m.error, "report")) && <span className="field__error" role="alert">{fileErr ?? fieldError(m.error, "report")}</span>}
      </div>
      {f.result === "fail" && <p className="small muted mb-0">Olumsuz sonuçta varlık "uygunsuz" işaretlenir ve düzeltme iş emri (talep) açılır.</p>}
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function AssetMaintenance({ d, canManage }: { d: AssetDetail; canManage: boolean }) {
  const rq = useSiteGet<Run[]>("/maintenance-runs", { asset_id: d.asset.id });
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="card">
        <div className="card__head"><span className="card__title">Bakım planları</span>{canManage && <button className="btn btn--ghost btn--sm ml-auto" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Plan ekle</button>}</div>
        <div className="card__body card__body--flush">
          {adding && <div className="card__body"><PlanForm assetId={d.asset.id} onDone={() => setAdding(false)} /></div>}
          {d.plans.length === 0 ? <Empty title="Bakım planı yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Bakım planları</caption>
              <thead><tr><th scope="col">Bakım</th><th scope="col">Periyot</th><th scope="col">Sıradaki</th>{canManage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
              <tbody>{d.plans.map((p) => <tr key={p.id}><td className="cell-main">{p.title}{!p.is_active && <> <Badge>Kapalı</Badge></>}{p.responsible && <div className="cell-sub">{p.responsible}</div>}</td><td className="small">her {p.period_count} {periodUnit(p.period_unit)}</td><td className="small nowrap">{formatDate(p.next_due_on)}{p.open_run_id && <div><Badge tone="info">İş emri açık</Badge></div>}</td>{canManage && <td className="right nowrap"><PlanActions p={p} /></td>}</tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Bakım iş emirleri</span></div>
        <div className="card__body card__body--flush">
          {rq.isPending ? <Loading /> : rq.isError ? <div className="card__body"><ErrorState error={rq.error} /></div> : rq.data.length === 0 ? <Empty title="İş emri yok" /> : <RunTable runs={rq.data} canManage={canManage} />}
        </div>
      </div>
    </>
  );
}

function AssetTimeline({ id }: { id: string }) {
  const { site } = useSite();
  const dl = useLinkedDownload();
  const q = useSiteGet<Timeline>(`/technical-assets/${id}/timeline`);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <>
      <div className="card">
        <div className="card__head"><span className="card__title">Yıllık maliyet</span><span className="card__meta ml-auto">muayene + bakım bedeli</span></div>
        <div className="card__body card__body--flush">
          {q.data.annual_costs.length === 0 ? <Empty title="Maliyet kaydı yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Yıllık maliyet</caption>
              <thead><tr><th scope="col">Yıl</th><th scope="col" className="right">Toplam</th></tr></thead>
              <tbody>{q.data.annual_costs.map((c) => <tr key={c.year}><td>{c.year}</td><td className="right"><Money value={c.total} /></td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__icon"><History aria-hidden="true" /></span><span className="card__title">Zaman çizelgesi</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
          {q.data.events.length === 0 ? <Empty title="Kayıt yok" /> : q.data.events.map((e, i) => (
            <div key={i} className="row small" style={{ gap: "var(--s-3)", alignItems: "baseline", borderBottom: "1px solid var(--line)", paddingBottom: "var(--s-2)", flexWrap: "wrap" }}>
              <span className="nowrap mono" style={{ minWidth: "6.5rem" }}>{formatDate(e.date)}</span>
              <Badge tone={e.kind === "inspection_fail" ? "danger" : e.kind === "inspection_pass" || e.kind === "maintenance_done" ? "ok" : e.kind === "maintenance_open" ? "info" : "muted"}>{timelineKind(e.kind)}</Badge>
              <span style={{ flex: "1 1 14rem" }}>{e.title}{e.detail && <span className="muted"> · {e.detail}</span>}{e.at && <span className="xs muted"> · {formatDateTime(e.at)}</span>}</span>
              {e.cost && <Money value={e.cost} />}
              {e.request_id && <Link to={`/s/${site.slug}/talepler/${e.request_id}`}>talep #{e.request_number}{e.request_status && ` · ${requestStatus(e.request_status)}`}</Link>}
              {e.document_id && <button className="btn btn--ghost btn--sm" type="button" onClick={() => dl(e.document_id!, e.title)}><FileText aria-hidden="true" /> Belge</button>}
            </div>
          ))}
        </div>
      </div>
      <p className="small muted">Malzeme (stok) maliyeti iş emri–stok bağı gelince çizelgeye eklenecek.</p>
    </>
  );
}
