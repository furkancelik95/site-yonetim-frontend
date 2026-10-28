import { useState } from "react";
import { ClipboardCheck, Clock, Copy, Plus, Star, Trash2, Wallet } from "lucide-react";
import { Link, useParams } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { useMe } from "../../auth/AuthContext";
import { BarChart } from "../../components/charts";
import { Alert, Badge, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, Segmented, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { contractCategory, contractPeriod, escalationKind, kpiSource, requestCategory } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import type { VendorRow } from "./PurchasePages";

/** Servis isteği 68–70'teki şekiller. */
type Contract = Schemas["ContractOut"];
interface Kpi_ { id: string; name: string; source: string; target: number; weight: number; request_category: string | null }
interface Penalty { id: string; kpi_id: string; below_percent: number; cut_kind: string; cut_value: string }
interface Escalation { kind: string; fixed_rate: number | null; period: string; cap: number | null }
interface Preview { status: "none" | "not_due" | "missing_index" | "due" | "approved" | "rejected"; date?: string; days_left?: number; index_period?: string; rate?: number | null; capped_rate?: number | null; old_amount?: string; new_amount?: string | null; annual_effect?: string | null; record?: { decision: string; note: string | null; by: string; at: string } | null }
interface Perf { vendor_id: string | null; vendor: { id: string; name: string; rating_avg: string | null; rating_count: number } | null; kpis: Kpi_[]; penalties: Penalty[]; escalation: Escalation; escalations: { date: string; old_amount: string; new_amount: string; rate: number; decision: string; note: string | null; by: string }[]; monthly_amount: string | null; escalation_preview: Preview; last_scorecards: { period: string; total: number | null; status: string; penalty: string | null }[] }
interface Row { kpi_id: string; name: string; source: string; target: number; weight: number; actual: number | null; score: number | null; detail: string | null }
interface Card { period: string; rows: Row[]; total: number | null; comment: string | null; status: string; penalty: { amount: string; reasons: string[]; status: string; decided_by: string | null; note: string | null } | null; monthly_amount: string | null; expected_invoice: string | null; finalized_by: string | null; finalized_by_id: string | null; finalized_at: string | null }

const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <Segmented label={label} value={v} onChange={set} options={items.map(([k, l]) => ({ value: k, label: l }))} />
);
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const REQ_CATS = ["elevator", "cleaning", "security", "garden", "plumbing", "electrical", "heating", "common_area", "other"];

/** Sözleşme ayrıntısı ve performansı (SAT-06, 15.3): KPI ve ceza kuralları, aylık karne, endeksli artış, yenileme bilgisi. */
export function ContractDetailPage() {
  const { contractId = "" } = useParams();
  const { site, can } = useSite();
  const base = `/s/${site.slug}`;
  const list = useSiteGet<Contract[]>("/contracts");
  const arch = useSiteGet<Contract[]>("/contracts", { archived: "true" });
  const c = [...(list.data ?? []), ...(arch.data ?? [])].find((x) => x.id === contractId);
  const perf = useSiteGet<Perf>(`/contracts/${contractId}/performance`);
  const [s, set] = useUrlState({ sekme: "genel", donem: prevMonth() });
  useDocumentTitle(c ? `${c.vendor} · Sözleşme` : "Sözleşme");
  if (list.isPending || perf.isPending) return <Loading />;
  if (perf.isError) return <ErrorState error={perf.error} />;
  if (!c) return <Empty title="Sözleşme bulunamadı" />;
  const manage = can(P.contractsManage);
  return (
    <div className="stack">
      <PageHead title={`${c.vendor} · ${c.subject}`} subtitle={<><Link to={`${base}/sozlesmeler`}>Sözleşmeler</Link> · {contractCategory(c.category)} · {formatDate(c.start_date)} – {formatDate(c.end_date)}</>} />
      {tabs([["genel", "Genel"], ["kpi", "KPI ve ceza"], ["karne", "Aylık karne"], ["artis", "Fiyat artışı"]], s.sekme, (k) => set({ sekme: k }), "Sözleşme")}
      {s.sekme === "kpi" ? <PerfForm c={c} p={perf.data} manage={manage} /> : s.sekme === "karne" ? <ScoreCard c={c} period={s.donem} onPeriod={(v) => set({ donem: v })} manage={manage} /> : s.sekme === "artis" ? <EscalationTab c={c} p={perf.data} manage={manage} /> : <General c={c} p={perf.data} />}
    </div>
  );
}

function General({ c, p }: { c: Contract; p: Perf }) {
  const ep = p.escalation_preview;
  return (
    <div className="stack">
      <div className="grid grid--kpi rise">
        <Kpi label="Bedel" icon={<Wallet aria-hidden="true" />} value={c.amount ? <Money value={c.amount} /> : "—"} note={contractPeriod(c.period)} />
        <Kpi label="Bitişe" icon={<Clock aria-hidden="true" />} value={c.days_left >= 0 ? `${c.days_left} gün` : "Doldu"} tone={c.days_left <= 30 ? "danger" : c.days_left <= 60 ? "warn" : undefined} note={formatDate(c.end_date)} />
        <Kpi label="Tedarikçi puanı" icon={<Star aria-hidden="true" />} value={p.vendor?.rating_avg?.replace(".", ",") ?? "—"} note={p.vendor ? `${p.vendor.rating_count} değerlendirme` : "tedarikçi kartı bağlı değil"} />
        <Kpi label="Son karne" icon={<ClipboardCheck aria-hidden="true" />} value={p.last_scorecards[0]?.total ?? "—"} note={p.last_scorecards[0]?.period ?? "henüz karne yok"} />
      </div>
      {p.last_scorecards.filter((x) => x.total != null).length > 1 && (
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><ClipboardCheck aria-hidden="true" /></span><span className="card__title">Skor eğilimi</span><span className="card__meta ml-auto">toplam skor, 100 üzerinden</span></div>
          <div className="card__body">
            <BarChart label="Aylık karne skorları" format={(v) => String(v)} data={[...p.last_scorecards].reverse().map((x) => ({ label: x.period, value: x.total ?? 0, sub: x.status === "finalized" ? "kesin" : "taslak" }))} />
          </div>
        </div>
      )}
      {c.days_left <= 60 && c.days_left >= 0 && <Alert tone="warn" title="Yenileme kararı">Sözleşme {c.days_left} gün sonra bitiyor. Son 12 ayın karnesine bakarak yenileyin, yeniden teklif alın ya da sonlandırın.</Alert>}
      {ep.status === "due" && <Alert tone="info" title="Fiyat artışı onay bekliyor">{formatDate(ep.date)} tarihli artış: {formatMoney(ep.old_amount)} → {formatMoney(ep.new_amount)}. "Fiyat artışı" sekmesinden karar verin.</Alert>}
      {ep.status === "missing_index" && <Alert tone="warn" title="Endeks değeri eksik">{ep.index_period} dönemi endeksi girilmemiş; platform yöneticisine bildirildi.</Alert>}
      <div className="card"><div className="card__head"><span className="card__title">Son 12 ay karneleri</span></div><div className="card__body card__body--flush">
        {p.last_scorecards.length === 0 ? <Empty title="Karne yok">KPI tanımlayıp ay sonunda karneyi kesinleştirin.</Empty> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Karne geçmişi</caption>
            <thead><tr><th scope="col">Dönem</th><th scope="col" className="right">Toplam skor</th><th scope="col">Durum</th><th scope="col" className="right">Kesinti</th></tr></thead>
            <tbody>{p.last_scorecards.map((x) => <tr key={x.period}><td>{x.period}</td><td className="right num">{x.total ?? "—"}</td><td>{x.status === "finalized" ? <Badge tone="ok">Kesinleşti</Badge> : <Badge tone="muted">Taslak</Badge>}</td><td className="right">{x.penalty ? <Money value={x.penalty} /> : "—"}</td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
      <p className="small muted">Aylık sabit bedelli sözleşmelerde her ayın gider taslağı Tekrarlanan giderler'den üretilir; ceza kesintisi onaylanınca o ayın beklenen fatura tutarı düşer.</p>
    </div>
  );
}

function PerfForm({ c, p, manage }: { c: Contract; p: Perf; manage: boolean }) {
  const vendors = useSiteGet<Page<VendorRow>>("/vendors", { page_size: 200 });
  const [vendorId, setVendorId] = useState(p.vendor_id ?? "");
  const [kpis, setKpis] = useState(p.kpis.map((k) => ({ ...k, target: String(k.target), weight: String(k.weight), request_category: k.request_category ?? "" })));
  const [pens, setPens] = useState(p.penalties.map((x) => ({ ...x, below_percent: String(x.below_percent), cut_value: String(Number(x.cut_value)) })));
  const m = useSiteMutation<Record<string, unknown>, Perf>("PUT", `/contracts/${c.id}/performance`);
  const sumW = kpis.reduce((s, k) => s + Number(k.weight || 0), 0);
  const upK = (i: number, patch: Partial<(typeof kpis)[number]>) => setKpis((x) => x.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const upP = (i: number, patch: Partial<(typeof pens)[number]>) => setPens((x) => x.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  function save() {
    m.mutate({ vendor_id: vendorId || null, kpis: kpis.map((k) => ({ ...k, target: Number(k.target.replace(",", ".")), weight: Number(k.weight), request_category: k.request_category || null })), penalties: pens.map((x) => ({ ...x, below_percent: Number(x.below_percent.replace(",", ".")), cut_value: x.cut_value.replace(",", ".") })), escalation: p.escalation });
  }
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Tedarikçi kartı" hint="Puan ve sipariş geçmişi için" error={fieldError(m.error, "vendor_id")}>{(pp) => <select {...pp} className="field__input" disabled={!manage} value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">— bağlı değil —</option>{(vendors.data?.items ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>}</Field>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <legend className="field__label">KPI'lar (aylık)</legend>
          {kpis.length === 0 && <p className="small muted mb-0">Henüz KPI yok. Kaynak modül kapalıysa "Elle giriş" seçin.</p>}
          {kpis.map((k, i) => (
            <div key={k.id || i} className="grid grid--kpi" style={{ alignItems: "end", borderTop: i ? "1px solid var(--line)" : undefined, paddingTop: i ? "var(--s-2)" : undefined }}>
              <Field label={`${i + 1}. KPI`} error={fieldError(m.error, `kpis.${i}.name`)}>{(pp) => <input {...pp} className="field__input" maxLength={60} disabled={!manage} value={k.name} onChange={(e) => upK(i, { name: e.target.value })} />}</Field>
              <Field label="Kaynak">{(pp) => <select {...pp} className="field__input" disabled={!manage} value={k.source} onChange={(e) => upK(i, { source: e.target.value })}>{["inspection", "patrol", "tasks", "sla", "manual"].map((x) => <option key={x} value={x}>{kpiSource(x)}</option>)}</select>}</Field>
              {k.source === "sla" && <Field label="Talep kategorisi">{(pp) => <select {...pp} className="field__input" disabled={!manage} value={k.request_category} onChange={(e) => upK(i, { request_category: e.target.value })}><option value="">Tümü</option>{REQ_CATS.map((x) => <option key={x} value={x}>{requestCategory(x)}</option>)}</select>}</Field>}
              <Field label="Hedef (%)" error={fieldError(m.error, `kpis.${i}.target`)}>{(pp) => <input {...pp} className="field__input" inputMode="decimal" disabled={!manage} value={k.target} onChange={(e) => upK(i, { target: e.target.value })} />}</Field>
              <Field label="Ağırlık" error={fieldError(m.error, `kpis.${i}.weight`)}>{(pp) => <input {...pp} className="field__input" inputMode="numeric" disabled={!manage} value={k.weight} onChange={(e) => upK(i, { weight: e.target.value })} />}</Field>
              {manage && <div><button type="button" className="btn btn--ghost btn--sm" aria-label={`${i + 1}. KPI'yı kaldır`} onClick={() => { setKpis((x) => x.filter((_, j) => j !== i)); setPens((x) => x.filter((pp) => pp.kpi_id !== k.id)); }}><Trash2 aria-hidden="true" /></button></div>}
            </div>
          ))}
          {fieldError(m.error, "kpis") && <span className="field__error" role="alert">{fieldError(m.error, "kpis")}</span>}
          {manage && <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}><button type="button" className="btn btn--sm" onClick={() => setKpis((x) => [...x, { id: crypto.randomUUID(), name: "", source: "inspection", target: "85", weight: String(Math.max(0, 100 - sumW)), request_category: "" }])}><Plus aria-hidden="true" /> KPI</button><span className={`small ${sumW === 100 || kpis.length === 0 ? "muted" : ""}`}>Ağırlık toplamı: {sumW}/100</span></div>}
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <legend className="field__label">Ceza kesintisi kuralları</legend>
          {fieldError(m.error, "penalties") && <span className="field__error" role="alert">{fieldError(m.error, "penalties")}</span>}
          {pens.map((x, i) => (
            <div key={x.id || i} className="row" style={{ gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
              <select className="field__input" style={{ width: "auto" }} aria-label={`${i + 1}. kural KPI`} disabled={!manage} value={x.kpi_id} onChange={(e) => upP(i, { kpi_id: e.target.value })}>{kpis.map((k) => <option key={k.id} value={k.id}>{k.name || "(adsız KPI)"}</option>)}</select>
              <span className="small">hedefin %</span><input className="field__input" style={{ width: "4.5rem" }} inputMode="decimal" aria-label={`${i + 1}. kural eşik yüzdesi`} disabled={!manage} value={x.below_percent} onChange={(e) => upP(i, { below_percent: e.target.value })} /><span className="small">fazla altındaysa</span>
              <select className="field__input" style={{ width: "auto" }} aria-label={`${i + 1}. kural kesinti tipi`} disabled={!manage} value={x.cut_kind} onChange={(e) => upP(i, { cut_kind: e.target.value })}><option value="percent">bedelden %</option><option value="fixed">sabit ₺</option></select>
              <input className="field__input" style={{ width: "6rem" }} inputMode="decimal" aria-label={`${i + 1}. kural kesinti değeri`} disabled={!manage} value={x.cut_value} onChange={(e) => upP(i, { cut_value: e.target.value })} /><span className="small">kesinti</span>
              {manage && <button type="button" className="btn btn--ghost btn--sm" aria-label={`${i + 1}. kuralı kaldır`} onClick={() => setPens((y) => y.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>}
              {[`penalties.${i}.kpi_id`, `penalties.${i}.below_percent`, `penalties.${i}.cut_value`].map((k) => fieldError(m.error, k) && <span key={k} className="field__error" role="alert">{fieldError(m.error, k)}</span>)}
            </div>
          ))}
          {manage && kpis.length > 0 && <div><button type="button" className="btn btn--sm" onClick={() => setPens((x) => [...x, { id: crypto.randomUUID(), kpi_id: kpis[0]!.id, below_percent: "10", cut_kind: "percent", cut_value: "5" }])}><Plus aria-hidden="true" /> Ceza kuralı</button></div>}
          {p.monthly_amount && <p className="xs muted mb-0">Yüzde kesinti aylık bedel ({formatMoney(p.monthly_amount)}) üzerinden hesaplanır.</p>}
        </fieldset>
      </div>
      {manage && <div className="card__foot"><SubmitButton busy={m.isPending}>Kaydet</SubmitButton></div>}
    </form>
  );
}

function ScoreCard({ c, period, onPeriod, manage }: { c: Contract; period: string; onPeriod: (v: string) => void; manage: boolean }) {
  const q = useSiteGet<Card>(`/contracts/${c.id}/scorecards/${period}`);
  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: "12rem" }}><label className="field__label" htmlFor="sc-p">Dönem</label><input id="sc-p" className="field__input" type="month" max={todayIso().slice(0, 7)} value={period} onChange={(e) => onPeriod(e.target.value)} /></div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.rows.length === 0 ? <Empty title="KPI tanımlı değil">"KPI ve ceza" sekmesinden ölçütleri girin.</Empty> : q.data.period !== period ? <Loading /> : <CardBody key={`${q.data.period}-${q.data.status}`} c={c} card={q.data} manage={manage} />}
    </div>
  );
}

function CardBody({ c, card, manage }: { c: Contract; card: Card; manage: boolean }) {
  const me = useMe();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(card.rows.map((r) => [r.kpi_id, r.actual == null ? "" : String(r.actual)])));
  const [comment, setComment] = useState(card.comment ?? "");
  const [note, setNote] = useState("");
  const fin = useSiteMutation<Record<string, never>, Card>("POST", `/contracts/${c.id}/scorecards/${card.period}/finalize`);
  const save = useSiteMutation<Record<string, unknown>, Card>("PATCH", `/contracts/${c.id}/scorecards/${card.period}`, { onSuccess: () => fin.reset() });
  const pen = useSiteMutation<{ decision: string; note: string }, Card>("POST", `/contracts/${c.id}/scorecards/${card.period}/penalty`);
  const draft = card.status === "draft";
  const editable = (r: Row) => r.source === "manual" || (r.detail ?? "").startsWith("Bu ay");
  const notice = card.penalty?.status === "approved" ? `Sayın ${c.vendor},\n${card.period} dönemi hizmet karnesinde ${card.penalty.reasons.join("; ")}. Sözleşmedeki ceza maddesi gereği ${formatMoney(card.penalty.amount)} kesinti uygulanmıştır; bu dönem faturanızı ${formatMoney(card.expected_invoice)} olarak düzenlemenizi rica ederiz.` : "";
  return (
    <div className="stack">
      <div className="card"><div className="card__head"><span className="card__title">{card.period} hizmet karnesi</span><span className="ml-auto">{draft ? <Badge tone="muted">Taslak</Badge> : <Badge tone="ok">Kesinleşti</Badge>}</span></div>
        <div className="card__body card__body--flush"><div className="table-wrap"><table className="data"><caption className="visually-hidden">KPI karnesi</caption>
          <thead><tr><th scope="col">KPI</th><th scope="col" className="right">Hedef</th><th scope="col" className="right">Gerçekleşen</th><th scope="col" className="right">Puan</th><th scope="col" className="right">Ağırlık</th></tr></thead>
          <tbody>{card.rows.map((r) => (
            <tr key={r.kpi_id}>
              <td><div className="cell-main">{r.name}</div><div className="cell-sub">{kpiSource(r.source)}{r.detail && ` · ${r.detail}`}</div></td>
              <td className="right num">{r.target}</td>
              <td className="right">{draft && manage && editable(r) ? <input className="field__input" style={{ width: "5.5rem", minHeight: 36, textAlign: "right" }} inputMode="decimal" aria-label={`${r.name} gerçekleşen`} value={vals[r.kpi_id] ?? ""} aria-invalid={fieldError(save.error, `values.${r.kpi_id}`) ? true : undefined} onChange={(e) => setVals((x) => ({ ...x, [r.kpi_id]: e.target.value }))} /> : <span className="num">{r.actual ?? "—"}</span>}{fieldError(save.error, `values.${r.kpi_id}`) && <div className="field__error">{fieldError(save.error, `values.${r.kpi_id}`)}</div>}</td>
              <td className="right num">{r.score == null ? "—" : r.score < 100 ? <Badge tone={r.score < 85 ? "danger" : "warn"}>{r.score}</Badge> : <Badge tone="ok">100</Badge>}</td>
              <td className="right num">{r.weight}</td>
            </tr>
          ))}
            <tr><td colSpan={3} className="right strong">Toplam skor</td><td className="right strong num">{card.total ?? "—"}</td><td /></tr></tbody>
        </table></div></div>
        {draft && manage && <div className="card__foot stack" style={{ gap: "var(--s-2)" }}>
          <FormError error={save.error ?? fin.error} />
          <Field label="Yönetici yorumu">{(pp) => <textarea {...pp} className="field__input" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
          <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
            <button className="btn" type="button" disabled={save.isPending} onClick={() => save.mutate({ values: Object.fromEntries(card.rows.filter(editable).map((r) => [r.kpi_id, (vals[r.kpi_id] ?? "") === "" ? null : Number(vals[r.kpi_id]!.replace(",", "."))])), comment })}>Değerleri kaydet</button>
            <button className="btn btn--primary" type="button" disabled={fin.isPending} onClick={() => fin.mutate({})}>Karneyi kesinleştir</button>
          </div>
          <p className="xs muted mb-0">Kaynaktan gelen değerler otomatik; veri yoksa elle girin. Dönem bitmeden kesinleşmez.</p>
        </div>}
        {!draft && <div className="card__foot small muted">{card.finalized_by}, {formatDateTime(card.finalized_at)}{card.comment && ` · ${card.comment}`}</div>}
      </div>
      {card.penalty && (
        <div className="card" style={{ borderColor: card.penalty.status === "pending" ? "var(--warn-line)" : undefined }}><div className="card__head"><span className="card__title">Ceza kesintisi</span><span className="ml-auto">{card.penalty.status === "pending" ? <Badge tone="warn">Onay bekliyor</Badge> : card.penalty.status === "approved" ? <Badge tone="ok">Onaylandı</Badge> : card.penalty.status === "rejected" ? <Badge tone="muted">Reddedildi</Badge> : <Badge tone="info">Kesinleşince onaya düşer</Badge>}</span></div>
          <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>{card.penalty.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <div className="kv"><span className="kv__k strong">Kesinti</span><span className="kv__v strong"><Money value={card.penalty.amount} /></span></div>
            {card.monthly_amount && <div className="kv"><span className="kv__k">Dönem faturası beklenen tutar</span><span className="kv__v">{formatMoney(card.expected_invoice)}{card.penalty.status !== "approved" && <span className="xs muted"> (onaylanınca {formatMoney((Number(card.monthly_amount) - Number(card.penalty.amount)).toFixed(2))})</span>}</span></div>}
            {card.penalty.decided_by && <div className="small muted">{card.penalty.decided_by}{card.penalty.note && `: ${card.penalty.note}`}</div>}
            {card.penalty.status === "pending" && (me.user_id === card.finalized_by_id ? <p className="small muted mb-0">Karneyi siz kesinleştirdiniz; kesintiyi başka bir yetkili onaylar.</p> : manage && (
              <div className="stack" style={{ gap: "var(--s-2)" }}>
                <FormError error={pen.error} />
                <Field label="Not" hint="Retde zorunlu" error={fieldError(pen.error, "note")}>{(pp) => <input {...pp} className="field__input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                <div className="row" style={{ gap: "var(--s-2)" }}><button className="btn btn--primary btn--sm" type="button" disabled={pen.isPending} onClick={() => pen.mutate({ decision: "approve", note })}>Kesintiyi onayla</button><button className="btn btn--sm" type="button" disabled={pen.isPending} onClick={() => pen.mutate({ decision: "reject", note })}>Reddet</button></div>
              </div>
            ))}
            {notice && <div className="stack" style={{ gap: "var(--s-1)" }}><label className="field__label" htmlFor={`nt-${card.period}`}>Tedarikçiye bildirim taslağı</label><textarea id={`nt-${card.period}`} className="field__input" rows={4} readOnly value={notice} /><div><button type="button" className="btn btn--sm" onClick={() => navigator.clipboard?.writeText(notice)}><Copy aria-hidden="true" /> Kopyala</button></div></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function EscalationTab({ c, p, manage }: { c: Contract; p: Perf; manage: boolean }) {
  const [e, setE] = useState({ kind: p.escalation.kind, fixed_rate: p.escalation.fixed_rate == null ? "" : String(p.escalation.fixed_rate), period: p.escalation.period, cap: p.escalation.cap == null ? "" : String(p.escalation.cap) });
  const [note, setNote] = useState("");
  const save = useSiteMutation<Record<string, unknown>, Perf>("PUT", `/contracts/${c.id}/performance`);
  const dec = useSiteMutation<{ decision: string; note: string }, Preview>("POST", `/contracts/${c.id}/escalation`);
  const ep = p.escalation_preview;
  return (
    <div className="stack">
      <form className="card" noValidate onSubmit={(ev) => { ev.preventDefault(); save.mutate({ vendor_id: p.vendor_id, kpis: p.kpis, penalties: p.penalties, escalation: { kind: e.kind, fixed_rate: e.fixed_rate ? Number(e.fixed_rate.replace(",", ".")) : null, period: e.period, cap: e.cap ? Number(e.cap.replace(",", ".")) : null } }); }}>
        <div className="card__head"><span className="card__title">Artış kuralı</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={save.error} />
          <div className="grid grid--kpi">
            <Field label="Kural" error={fieldError(save.error, "escalation.kind")}>{(pp) => <select {...pp} className="field__input" disabled={!manage} value={e.kind} onChange={(x) => setE((y) => ({ ...y, kind: x.target.value }))}>{["none", "tufe", "ufe", "avg", "fixed"].map((k) => <option key={k} value={k}>{escalationKind(k)}</option>)}</select>}</Field>
            {e.kind === "fixed" && <Field label="Oran (%)" error={fieldError(save.error, "escalation.fixed_rate")}>{(pp) => <input {...pp} className="field__input" inputMode="decimal" disabled={!manage} value={e.fixed_rate} onChange={(x) => setE((y) => ({ ...y, fixed_rate: x.target.value }))} />}</Field>}
            {e.kind !== "none" && <Field label="Dönem">{(pp) => <select {...pp} className="field__input" disabled={!manage} value={e.period} onChange={(x) => setE((y) => ({ ...y, period: x.target.value }))}><option value="yearly">Yıllık</option><option value="semiannual">6 aylık</option></select>}</Field>}
            {e.kind !== "none" && <Field label="Tavan (%)" hint="Boş: tavan yok" error={fieldError(save.error, "escalation.cap")}>{(pp) => <input {...pp} className="field__input" inputMode="decimal" disabled={!manage} value={e.cap} onChange={(x) => setE((y) => ({ ...y, cap: x.target.value }))} />}</Field>}
          </div>
          <p className="xs muted mb-0">Endeks değerlerini platform yöneticisi aylık girer (tüm tesisler için ortak). Artış tarihinden 30 gün önce yeni bedel hesaplanır ve onaya düşer.</p>
        </div>
        {manage && <div className="card__foot"><SubmitButton busy={save.isPending}>Kaydet</SubmitButton></div>}
      </form>
      {ep.status !== "none" && (
        <div className="card"><div className="card__head"><span className="card__title">Sıradaki artış · {formatDate(ep.date)}</span><span className="card__meta ml-auto">{ep.days_left} gün sonra</span></div>
          <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            {ep.status === "not_due" && <p className="small mb-0">Artış tarihine 30 günden fazla var; hesap {formatDate(ep.date && new Date(new Date(ep.date).getTime() - 30 * 864e5).toISOString().slice(0, 10))} tarihinde açılır.</p>}
            {ep.status === "missing_index" && <Alert tone="warn" title="Endeks değeri eksik">{ep.index_period} dönemi TÜFE/ÜFE değeri girilmemiş. Platform yöneticisine bildirildi; değer girilince hesap açılır.</Alert>}
            {(ep.status === "due" || ep.status === "approved" || ep.status === "rejected") && ep.rate != null && <>
              <div className="kv"><span className="kv__k">{ep.record ? "Uygulanan oran" : `Endeks (${ep.index_period})`}</span><span className="kv__v">%{ep.rate?.toLocaleString("tr-TR")}{ep.capped_rate !== ep.rate && ` → tavan %${ep.capped_rate?.toLocaleString("tr-TR")}`}</span></div>
              <div className="kv"><span className="kv__k">Bedel</span><span className="kv__v">{formatMoney(ep.old_amount)} → <strong>{formatMoney(ep.new_amount)}</strong></span></div>
              <div className="kv"><span className="kv__k">Bütçe etkisi (yıllık)</span><span className="kv__v">+{formatMoney(ep.annual_effect)}</span></div>
            </>}
            {ep.status === "due" && manage && <>
              <FormError error={dec.error} />
              <Field label="Not" hint="Retde zorunlu: tedarikçiyle görüşme notu" error={fieldError(dec.error, "note")}>{(pp) => <input {...pp} className="field__input" maxLength={300} value={note} onChange={(x) => setNote(x.target.value)} />}</Field>
              <div className="row" style={{ gap: "var(--s-2)" }}><button className="btn btn--primary btn--sm" type="button" disabled={dec.isPending} onClick={() => dec.mutate({ decision: "approve", note })}>Yeni bedeli onayla</button><button className="btn btn--sm" type="button" disabled={dec.isPending} onClick={() => dec.mutate({ decision: "reject", note })}>Bedel değişmesin</button></div>
            </>}
            {ep.record && <div className="small muted">{ep.record.decision === "approve" ? "Onaylandı" : "Reddedildi"} — {ep.record.by}, {formatDateTime(ep.record.at)}{ep.record.note && ` · ${ep.record.note}`}</div>}
          </div>
        </div>
      )}
      {p.escalations.length > 0 && <div className="card"><div className="card__head"><span className="card__title">Artış geçmişi</span></div><div className="card__body stack" style={{ gap: 2 }}>{p.escalations.map((x, i) => <div key={i} className="small">{formatDate(x.date)} · %{x.rate} · {formatMoney(x.old_amount)} → {formatMoney(x.new_amount)} · {x.decision === "approve" ? "onaylandı" : "reddedildi"} ({x.by}){x.note && ` · ${x.note}`}</div>)}</div></div>}
    </div>
  );
}
