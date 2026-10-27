import { useState, type FormEvent } from "react";
import { Copy, FileText, Link2, Plus, Printer, ShoppingCart, Star, Trash2, Truck } from "lucide-react";
import { Link, useParams } from "react-router";
import Decimal from "decimal.js";
import { api, openDocument } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CashAccounts, Page, Schemas } from "../../api/types";
import { useMe } from "../../auth/AuthContext";
import { PhotoInput } from "../../components/PhotoInput";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, Pager, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { invoiceStatus, invoiceTone, poStatus, poTone, prStatus, prTone, vendorStatus, vendorTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Üretilmiş şemadan (servis istekleri 62–67, backend `api/v1/purchasing.py`). */
export type VendorRow = Schemas["VendorOut"];
type Pr = Schemas["PurchaseRequestOut"];
type PrRow = Schemas["PurchaseRequestRow"];
type Quote = Schemas["PurchaseQuoteOut"];
type Po = Schemas["PurchaseOrderOut"];
type PoRow = Schemas["PurchaseOrderRow"];
type PoWrite = Schemas["PurchaseOrderWriteOut"];
type Invoice = Schemas["VendorInvoiceOut"];
type Payables = Schemas["PayablesOut"];
type Settings = Schemas["PurchaseSettingsOut"];
type Budget = Schemas["PurchaseBudgetOut"];
type LinkCreated = Schemas["QuoteLinkCreated"];
type FileOut = Schemas["PurchaseFileOut"];

const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="row" role="tablist" aria-label={label} style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className={`btn btn--sm${v === k ? " btn--primary" : ""}`} onClick={() => set(k)}>{l}</button>)}</div>
);
const money = (v: string) => Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Miktar metni ("2.5") → ekranda "2,5". */
const qtyText = (v: string) => v.replace(".", ",");
/** Kullanıcının yazdığı miktar ("2,5") → API metni ("2.5"). */
const qtyInput = (v: string) => v.trim().replace(",", ".") || "0";
/** Önizleme toplamı (para hesabı Decimal ile; backend asıl tutarı hesaplar). */
const previewTotal = (rows: { qty: string; price: string }[]) =>
  rows.reduce((s, r) => { try { return s.plus(new Decimal(qtyInput(r.qty)).times(parseMoneyInput(r.price) ?? "0")); } catch { return s; } }, new Decimal(0)).toFixed(2);
const useBase = () => `/s/${useSite().site.slug}`;

/** Kayda bağlı belgeyi (teklif, irsaliye, fatura) yetkili uçtan açar. */
function FileButton({ id, name }: { id: string | null; name: string | null }) {
  const { site } = useSite();
  const toast = useToast();
  if (!id) return null;
  return <button className="btn btn--ghost btn--sm" type="button" style={{ paddingLeft: 0 }} onClick={() => openDocument(`/sites/${site.slug}/files/${id}`).catch(() => toast("Belge açılamadı.", "danger"))}><FileText aria-hidden="true" /> {name ?? "Belge"}</button>;
}

/** Kayıt oluştuktan sonra belge yükler (multipart; PDF/JPG/PNG/WEBP, ≤ 10 MB). Hata bildirim olarak gösterilir. */
function useAttach() {
  const { site } = useSite();
  const toast = useToast();
  return async (path: string, file: File | Blob | null, name?: string) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file, name ?? (file instanceof File ? file.name : "belge.jpg"));
    try {
      const res = await api<{ data: FileOut; message: string }>("POST", `/sites/${site.slug}${path}`, { form });
      toast(res.message);
    } catch (e) {
      toast(`Belge eklenemedi: ${e instanceof Error ? e.message : "bilinmeyen hata"}`, "danger");
    }
  };
}

function FilePick({ label, hint, onPick }: { label: string; hint?: string; onPick: (f: File | null) => void }) {
  return <Field label={label} hint={hint ?? "PDF, JPG, PNG ya da WEBP · en çok 10 MB"}>{(pp) => <input {...pp} className="field__input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />}</Field>;
}

// ===================================================================== 64–67 Satın alma
/** Satın alma (SAT-01..05): talepler, siparişler, tedarikçi faturaları, ödenecekler ve ayarlar. */
export function PurchasePage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ sekme: "talep", durum: "", page: "1" });
  const items: [string, string][] = [["talep", "Talepler"], ["siparis", "Siparişler"], ["fatura", "Faturalar"], ["odenecek", "Ödenecekler"], ...(can(P.expensesManage) ? ([["ayar", "Ayarlar"]] as [string, string][]) : [])];
  const page = Number(s.page) || 1;
  const onPage = (p: number) => set({ page: String(p) });
  return (
    <div className="stack">
      <PageHead title="Satın alma" subtitle="Talep → teklif → onay → sipariş → kabul → fatura eşleşmesi → ödeme. Onaysız sipariş verilmez; talep eden kendi talebini onaylayamaz." />
      {tabs(items, s.sekme, (k) => set({ sekme: k, page: "1", durum: "" }), "Satın alma")}
      {s.sekme === "siparis" ? <Orders page={page} onPage={onPage} /> : s.sekme === "fatura" ? <Invoices page={page} onPage={onPage} /> : s.sekme === "odenecek" ? <Payables /> : s.sekme === "ayar" ? <SettingsForm /> : <Requests status={s.durum} onStatus={(v) => set({ durum: v, page: "1" })} page={page} onPage={onPage} />}
    </div>
  );
}

function Requests({ status, onStatus, page, onPage }: { status: string; onStatus: (v: string) => void; page: number; onPage: (p: number) => void }) {
  const base = useBase();
  const { can } = useSite();
  const q = useSiteGet<Page<PrRow>>("/purchase-requests", { status: status || undefined, page, page_size: 50 });
  const [adding, setAdding] = useState(false);
  const canOpen = can(P.expensesManage) || can(P.requestsAssign);
  return (
    <div className="stack">
      <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
        {canOpen && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Satın alma talebi</button>}
        <div className="field ml-auto"><label className="field__label" htmlFor="pr-st">Durum</label><select id="pr-st" className="field__input" value={status} onChange={(e) => onStatus(e.target.value)}><option value="">Tümü</option>{["quoting", "exception_pending", "approval_pending", "approved", "ordered", "rejected", "cancelled"].map((k) => <option key={k} value={k}>{prStatus(k)}</option>)}</select></div>
      </div>
      {adding && <NewRequest onDone={() => setAdding(false)} />}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Satın alma talebi yok" icon={<ShoppingCart aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Satın alma talepleri</caption>
            <thead><tr><th scope="col">Talep</th><th scope="col">Kategori</th><th scope="col" className="right">Tahmini</th><th scope="col">Teklif</th><th scope="col">Durum</th></tr></thead>
            <tbody>{q.data.items.map((p) => (
              <tr key={p.id}>
                <td><Link className="cell-main" to={`${base}/satin-alma/${p.id}`}>{p.number} · {p.title}</Link><div className="cell-sub">{p.created_by}, {formatDate(p.created_at)}</div></td>
                <td className="small">{p.category_name}{p.over_budget && <div><Badge tone="danger">Bütçe aşımı</Badge></div>}</td>
                <td className="right"><Money value={p.estimated_total} /></td>
                <td className="small num">{p.quote_count}/{p.required_quotes}</td>
                <td><Badge tone={prTone(p.status)}>{prStatus(p.status)}</Badge>{p.order_number && <div className="cell-sub">{p.order_number}</div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
      {q.data && <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={onPage} />}
    </div>
  );
}

function NewRequest({ onDone }: { onDone: () => void }) {
  const cats = useSiteGet<{ id: string; name: string }[]>("/expense-categories");
  const stock = useSiteGet<{ id: string; name: string; unit_label: string }[]>("/stock-items");
  const [f, setF] = useState({ title: "", reason: "", category_id: "" });
  const [items, setItems] = useState<{ description: string; qty: string; unit: string; price: string; stock_item_id: string }[]>([{ description: "", qty: "1", unit: "adet", price: "", stock_item_id: "" }]);
  const cat = f.category_id || cats.data?.[0]?.id || "";
  const bud = useSiteGet<Budget>("/purchase-budget", { category_id: cat }, { enabled: !!cat });
  const set = useSiteGet<Settings>("/purchase-settings");
  const m = useSiteMutation<Record<string, unknown>, Pr>("POST", "/purchase-requests", { onSuccess: onDone });
  const total = previewTotal(items);
  const need = set.data ? (() => { for (const t of set.data.thresholds) if (new Decimal(total).lessThan(t.max)) return t.quotes; return set.data.above_quotes; })() : null;
  const over = bud.data?.has_budget && new Decimal(total).greaterThan(bud.data.remaining);
  const upItem = (k: number, patch: Partial<(typeof items)[number]>) => setItems((x) => x.map((it, i) => (i === k ? { ...it, ...patch } : it)));
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ ...f, category_id: cat || null, items: items.map((i) => ({ description: i.description, qty: qtyInput(i.qty), unit: i.unit, est_unit_price: parseMoneyInput(i.price), stock_item_id: i.stock_item_id || null })) });
  }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__head"><span className="card__title">Yeni satın alma talebi</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Konu" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={120} placeholder="ör. Bahçe sulama pompası" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Gider kategorisi" required error={fieldError(m.error, "category_id")}>{(p) => <select {...p} className="field__input" value={cat} onChange={(e) => setF((x) => ({ ...x, category_id: e.target.value }))}>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
        </div>
        <Field label="Gerekçe" required error={fieldError(m.error, "reason")}>{(p) => <textarea {...p} className="field__input" rows={2} maxLength={500} value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} />}</Field>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <legend className="field__label">Kalemler</legend>
          {fieldError(m.error, "items") && <span className="field__error" role="alert">{fieldError(m.error, "items")}</span>}
          {items.map((it, k) => (
            <div key={k} className="grid grid--kpi" style={{ alignItems: "end", borderTop: k ? "1px solid var(--line)" : undefined, paddingTop: k ? "var(--s-2)" : undefined }}>
              <Field label={`${k + 1}. kalem`} error={fieldError(m.error, `items.${k}.description`)}>{(p) => <input {...p} className="field__input" maxLength={120} value={it.description} onChange={(e) => upItem(k, { description: e.target.value })} />}</Field>
              <Field label="Miktar" error={fieldError(m.error, `items.${k}.qty`)}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={it.qty} onChange={(e) => upItem(k, { qty: e.target.value })} />}</Field>
              <Field label="Birim">{(p) => <input {...p} className="field__input" maxLength={12} value={it.unit} onChange={(e) => upItem(k, { unit: e.target.value })} />}</Field>
              <Field label="Tahmini birim fiyat (₺)" error={fieldError(m.error, `items.${k}.est_unit_price`)}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={it.price} onChange={(e) => upItem(k, { price: e.target.value })} />}</Field>
              <Field label="Stok kartı" hint="Kabulde stoğa girer" error={fieldError(m.error, `items.${k}.stock_item_id`)}>{(p) => <select {...p} className="field__input" value={it.stock_item_id} onChange={(e) => upItem(k, { stock_item_id: e.target.value })}><option value="">— stoksuz —</option>{(stock.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</Field>
              {items.length > 1 && <div><button type="button" className="btn btn--ghost btn--sm" aria-label={`${k + 1}. kalemi kaldır`} onClick={() => setItems((x) => x.filter((_, i) => i !== k))}><Trash2 aria-hidden="true" /></button></div>}
            </div>
          ))}
          <div><button type="button" className="btn btn--sm" onClick={() => setItems((x) => [...x, { description: "", qty: "1", unit: "adet", price: "", stock_item_id: "" }])}><Plus aria-hidden="true" /> Kalem</button></div>
        </fieldset>
        <div className="kv"><span className="kv__k strong">Tahmini toplam</span><span className="kv__v strong">{formatMoney(total)}</span></div>
        {bud.data && (bud.data.has_budget
          ? <div className="small">Kategori bütçesi {formatMoney(bud.data.annual)} · bu yıl harcanan {formatMoney(bud.data.spent)} · açık taahhüt {formatMoney(bud.data.committed)} · <strong>kalan {formatMoney(bud.data.remaining)}</strong></div>
          : <div className="small muted">Bu kategori için işletme projesinde bütçe kalemi yok.</div>)}
        {over && <Alert tone="warn" title="Bütçe aşımı">Tahmini tutar kalan bütçeyi aşıyor; talep "bütçe aşımı" işaretiyle onaya gider.</Alert>}
        {need != null && new Decimal(total).greaterThan(0) && <div className="small">Bu tutar için en az <strong>{need} teklif</strong> gerekir.</div>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Talebi aç</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

/** Satın alma talebi ayrıntısı (SAT-01/02/03): teklifler ve karşılaştırma, tedarikçi linki, istisna, onay, sipariş. */
export function PurchaseRequestPage() {
  const { prId = "" } = useParams();
  const base = useBase();
  const { can } = useSite();
  const q = useSiteGet<Pr>(`/purchase-requests/${prId}`);
  useDocumentTitle(q.data ? `${q.data.number} · Satın alma` : "Satın alma talebi");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const p = q.data;
  const buyer = can(P.expensesManage) || can(P.requestsAssign);
  return (
    <div className="stack">
      <PageHead title={`${p.number} · ${p.title}`} subtitle={<><Link to={`${base}/satin-alma`}>Satın alma</Link> · {p.category_name} · {p.created_by}, {formatDateTime(p.created_at)}</>} actions={<Badge tone={prTone(p.status)}>{prStatus(p.status)}</Badge>} />
      {p.status === "rejected" && <Alert tone="danger" title="Reddedildi">{p.reject_reason}</Alert>}
      <div className="grid grid--2">
        <div className="card"><div className="card__head"><span className="card__title">Kalemler</span></div><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
          {p.items.map((i, k) => <div key={k} className="kv"><span className="kv__k">{i.description} · {qtyText(i.qty)} {i.unit}{i.stock_item_name && <span className="xs muted"> · stok: {i.stock_item_name}</span>}</span><span className="kv__v">{formatMoney(i.est_unit_price)}</span></div>)}
          <div className="kv"><span className="kv__k strong">Tahmini toplam</span><span className="kv__v strong"><Money value={p.estimated_total} /></span></div>
          <p className="small mb-0">{p.reason}</p>
        </div></div>
        <div className="card"><div className="card__head"><span className="card__title">Bütçe ve kural</span></div><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
          {p.budget ? <><div className="kv"><span className="kv__k">Yıllık bütçe</span><span className="kv__v"><Money value={p.budget.annual} /></span></div><div className="kv"><span className="kv__k">Harcanan + taahhüt</span><span className="kv__v">{formatMoney(new Decimal(p.budget.spent).plus(p.budget.committed).toFixed(2))}</span></div><div className="kv"><span className="kv__k">Talep anında kalan</span><span className="kv__v"><Money value={p.budget.remaining} /></span></div></> : <p className="small muted mb-0">Kategoride bütçe kalemi yok.</p>}
          {p.over_budget && <Badge tone="danger">Bütçe aşımı</Badge>}
          <div className="small">Gereken teklif: <strong>{p.required_quotes}</strong> · mevcut: <strong>{p.quote_count}</strong></div>
          {p.exception_reason && <div className="small">Teklif istisnası gerekçesi: {p.exception_reason}</div>}
          {p.decisions.map((d, i) => <div key={i} className="small muted">{d.stage === "exception" ? "İstisna" : d.stage === "order" ? "Sipariş" : "Satın alma"}: {d.decision === "approve" ? "onaylandı" : d.decision === "reject" ? "reddedildi" : "geri çekildi"} — {d.by}, {formatDateTime(d.at)}{d.note && ` · ${d.note}`}</div>)}
        </div></div>
      </div>
      <QuotesCard p={p} buyer={buyer} />
      {p.status === "quoting" && buyer && <QuoteInputs p={p} />}
      <DecisionCard p={p} />
      {p.status === "approved" && can(P.expensesManage) && <OrderCreate p={p} />}
      {p.order_id && <Alert tone="info" title="Sipariş">{p.order_number} — <Link to={`${base}/satin-alma/siparis/${p.order_id}`}>siparişe git</Link></Alert>}
      {buyer && !["ordered", "rejected", "cancelled"].includes(p.status) && <div><CancelPr id={p.id} /></div>}
    </div>
  );
}

function QuotesCard({ p, buyer }: { p: Pr; buyer: boolean }) {
  const [sel, setSel] = useState(p.selected_quote_id ?? "");
  const [reason, setReason] = useState("");
  const m = useSiteMutation<Record<string, unknown>, Pr>("POST", `/purchase-requests/${p.id}/select-quote`);
  const totals = p.quotes.map((q) => new Decimal(q.total));
  const min = totals.length ? Decimal.min(...totals) : null;
  const short = p.quotes.length < p.required_quotes;
  const choosing = p.status === "quoting" && buyer;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Teklif karşılaştırma</span><span className="card__meta ml-auto">{p.quotes.length}/{p.required_quotes} teklif</span></div>
      <div className="card__body card__body--flush">
        {p.quotes.length === 0 ? <Empty title="Henüz teklif yok">Teklifi siz girin ya da tedarikçiye link gönderin.</Empty> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Teklif karşılaştırma</caption>
            <thead><tr>{choosing && <th scope="col"><span className="visually-hidden">Seç</span></th>}<th scope="col">Tedarikçi</th>{p.items.map((i, k) => <th key={k} scope="col" className="right">{i.description}<div className="cell-sub">{qtyText(i.qty)} {i.unit}</div></th>)}<th scope="col" className="right">Toplam</th><th scope="col">Teslim / vade</th></tr></thead>
            <tbody>{p.quotes.map((q) => (
              <tr key={q.id} aria-selected={p.selected_quote_id === q.id}>
                {choosing && <td><input type="radio" name={`q-${p.id}`} aria-label={`${q.vendor_name} teklifini seç`} checked={sel === q.id} onChange={() => setSel(q.id)} /></td>}
                <td><div className="cell-main">{q.vendor_name}{p.selected_quote_id === q.id && <> <Badge tone="ok">Seçildi</Badge></>}</div><div className="cell-sub">{q.source === "vendor_link" ? <Badge tone="info">Tedarikçi girdi</Badge> : `${q.created_by} girdi`}{q.rating_avg != null && <> · <Star aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: "-1px" }} /> {q.rating_avg.replace(".", ",")} ({q.rating_count})</>}</div><QuoteFile q={q} editable={choosing} /></td>
                {q.lines.map((l, k) => <td key={k} className="right num">{money(l.unit_price)}</td>)}
                <td className="right strong">{formatMoney(q.total)}{min && min.equals(q.total) && p.quotes.length > 1 && <div><Badge tone="ok">En düşük</Badge></div>}</td>
                <td className="small">{q.delivery_days} gün · {q.payment_terms}<div className="cell-sub">geçerli {formatDate(q.valid_until)}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {choosing && p.quotes.length > 0 && (
        <form className="card__foot stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ quote_id: sel || null, exception_reason: short ? reason : null }); }}>
          <FormError error={m.error} />
          {short && <Field label="Eksik teklif gerekçesi" required hint={`${p.required_quotes} teklif gerekiyor; teklif istisnası onaya düşer`} error={fieldError(m.error, "exception_reason")}>{(pp) => <textarea {...pp} className="field__input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
          <div><SubmitButton busy={m.isPending} disabled={!sel}>{short ? "Seç ve istisna onayına gönder" : "Seç ve onaya gönder"}</SubmitButton></div>
        </form>
      )}
    </div>
  );
}

/** Teklif belgesi: varsa açılır; yoksa (teklif aşamasında) eklenebilir. */
function QuoteFile({ q, editable }: { q: Quote; editable: boolean }) {
  const attach = useAttach();
  const [busy, setBusy] = useState(false);
  if (q.file_id) return <FileButton id={q.file_id} name={q.file_name} />;
  if (!editable) return null;
  return (
    <label className="xs" style={{ cursor: "pointer" }}>
      <span className="muted">{busy ? "Yükleniyor…" : "Belge ekle"}</span>
      <input type="file" className="visually-hidden" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={async (e) => { setBusy(true); await attach(`/purchase-quotes/${q.id}/file`, e.target.files?.[0] ?? null); setBusy(false); }} />
    </label>
  );
}

function QuoteInputs({ p }: { p: Pr }) {
  const vendors = useSiteGet<Page<VendorRow>>("/vendors", { status: "active", page_size: 200 });
  const quoted = new Set(p.quotes.map((q) => q.vendor_id));
  const avail = (vendors.data?.items ?? []).filter((v) => !quoted.has(v.id));
  const [vid, setVid] = useState("");
  const vendor = vid || avail[0]?.id || "";
  const [prices, setPrices] = useState<string[]>(p.items.map(() => ""));
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ delivery_days: "7", payment_terms: "30 gün vadeli", valid_until: todayIso(), note: "" });
  const attach = useAttach();
  const add = useSiteMutation<Record<string, unknown>, Quote>("POST", `/purchase-requests/${p.id}/quotes`, { onSuccess: async (q) => { if (q && file) await attach(`/purchase-quotes/${q.id}/file`, file); setPrices(p.items.map(() => "")); setVid(""); setFile(null); } });
  const link = useSiteMutation<{ vendor_id: string }, LinkCreated>("POST", `/purchase-requests/${p.id}/quote-links`);
  const url = link.data ? `${window.location.origin}/teklif/${link.data.data.token}` : "";
  const base = useBase();
  if (vendors.data && vendors.data.items.length === 0) return <Alert tone="info" title="Tedarikçi yok">Teklif için önce <Link to={`${base}/tedarikciler`}>Tedarikçiler</Link> ekranından aktif bir tedarikçi ekleyin.</Alert>;
  return (
    <div className="grid grid--2">
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); add.mutate({ vendor_id: vendor || null, lines: prices.map((x) => ({ unit_price: parseMoneyInput(x) })), delivery_days: f.delivery_days === "" ? null : Number(f.delivery_days), payment_terms: f.payment_terms, valid_until: f.valid_until || null, note: f.note || null }); }}>
        <div className="card__head"><span className="card__title">Teklifi ben gireyim</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
          <FormError error={add.error} />
          <Field label="Tedarikçi" error={fieldError(add.error, "vendor_id")}>{(pp) => <select {...pp} className="field__input" value={vendor} onChange={(e) => setVid(e.target.value)}>{avail.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>}</Field>
          {fieldError(add.error, "lines") && <span className="field__error" role="alert">{fieldError(add.error, "lines")}</span>}
          {p.items.map((i, k) => <Field key={k} label={`${i.description} — birim fiyat (₺)`} hint={`${qtyText(i.qty)} ${i.unit}`} error={fieldError(add.error, `lines.${k}`)}>{(pp) => <input {...pp} className="field__input" inputMode="decimal" value={prices[k]} onChange={(e) => setPrices((x) => x.map((v, j) => (j === k ? e.target.value : v)))} />}</Field>)}
          <div className="grid grid--2">
            <Field label="Teslim (gün)" error={fieldError(add.error, "delivery_days")}>{(pp) => <input {...pp} className="field__input" inputMode="numeric" value={f.delivery_days} onChange={(e) => setF((x) => ({ ...x, delivery_days: e.target.value.replace(/\D/g, "") }))} />}</Field>
            <Field label="Geçerlilik" error={fieldError(add.error, "valid_until")}>{(pp) => <input {...pp} className="field__input" type="date" min={todayIso()} value={f.valid_until} onChange={(e) => setF((x) => ({ ...x, valid_until: e.target.value }))} />}</Field>
          </div>
          <Field label="Ödeme koşulu" error={fieldError(add.error, "payment_terms")}>{(pp) => <input {...pp} className="field__input" maxLength={80} value={f.payment_terms} onChange={(e) => setF((x) => ({ ...x, payment_terms: e.target.value }))} />}</Field>
          <FilePick label="Teklif belgesi (isteğe bağlı)" onPick={setFile} />
        </div>
        <div className="card__foot"><SubmitButton busy={add.isPending} disabled={!vendor}>Teklifi ekle</SubmitButton></div>
      </form>
      <div className="card">
        <div className="card__head"><span className="card__title">Tedarikçiye link gönder</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
          <p className="small muted mb-0">Tedarikçi hesap açmadan teklifini girer. Link tek kullanımlık, süreli ve yalnız bu talebe bağlıdır; tedarikçi başka hiçbir veriyi görmez. E-posta gönderimi henüz yok (K5): linki kopyalayıp iletin. Link yalnız oluşturulurken bir kez gösterilir.</p>
          <FormError error={link.error} />
          <Field label="Tedarikçi" error={fieldError(link.error, "vendor_id")}>{(pp) => <select {...pp} className="field__input" value={vendor} onChange={(e) => setVid(e.target.value)}>{avail.map((v) => <option key={v.id} value={v.id}>{v.name}{v.email ? ` (${v.email})` : ""}</option>)}</select>}</Field>
          <div><button className="btn" type="button" disabled={!vendor || link.isPending} onClick={() => link.mutate({ vendor_id: vendor })}><Link2 aria-hidden="true" /> Link oluştur</button></div>
          {url && <div className="stack" style={{ gap: "var(--s-1)" }}><label className="field__label" htmlFor={`ql-${p.id}`}>{link.data!.data.vendor_name} linki</label><div className="row" style={{ gap: "var(--s-2)" }}><input id={`ql-${p.id}`} className="field__input mono" readOnly value={url} onFocus={(e) => e.target.select()} /><button type="button" className="btn btn--sm" onClick={() => navigator.clipboard?.writeText(url)}><Copy aria-hidden="true" /> Kopyala</button></div><span className="xs muted">Son geçerlilik {formatDateTime(link.data!.data.expires_at)}</span></div>}
          {p.links.length > 0 && <div className="stack" style={{ gap: 2 }}>{p.links.map((l) => <div key={l.id} className="small">{l.vendor_name} — {l.state === "used" ? <Badge tone="ok">Kullanıldı</Badge> : l.state === "expired" ? <Badge tone="muted">Süresi doldu / kapandı</Badge> : <Badge tone="info">Açık, {formatDate(l.expires_at)}'e kadar</Badge>}</div>)}</div>}
        </div>
      </div>
    </div>
  );
}

function DecisionCard({ p }: { p: Pr }) {
  const me = useMe();
  const { can, site } = useSite();
  const [note, setNote] = useState("");
  const m = useSiteMutation<{ decision: string; note: string }, Pr>("POST", `/purchase-requests/${p.id}/decide`);
  if (!["exception_pending", "approval_pending"].includes(p.status)) {
    return p.status === "approved" && p.approval ? <Alert tone="info" title="Sipariş onayı bekleniyor">Siparişin onay kuralına göre onay talebi #{p.approval.number} açıldı; karar <Link to={`/s/${site.slug}/onaylar`}>Onaylar</Link> ekranından verilir.</Alert> : null;
  }
  const sel = p.quotes.find((q) => q.id === p.selected_quote_id);
  const own = me.user_id === p.created_by_id;
  const viaRule = !!p.approval;
  return (
    <div className="card" style={{ borderColor: "var(--warn-line)" }}>
      <div className="card__head"><span className="card__title">{p.status === "exception_pending" ? "Teklif istisnası onayı" : "Satın alma onayı"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="small">Seçilen: <strong>{sel?.vendor_name}</strong> — {sel && formatMoney(sel.total)}{p.over_budget && <> · <Badge tone="danger">Bütçe aşımı</Badge></>}</div>
        {viaRule && <p className="small mb-0">Sitenin onay kuralı uygulanıyor (onay talebi #{p.approval!.number}); karar <Link to={`/s/${site.slug}/onaylar`}>Onaylar</Link> ekranından ya da burada, onaycı olarak atandıysanız verilir.</p>}
        {own ? <p className="small muted mb-0">Talebi siz açtınız; kendi talebinizi onaylayamazsınız. Onay başka bir yetkiliden bekleniyor.</p> : !viaRule && !can(P.expensesManage) ? <p className="small muted mb-0">Onay yetkiniz yok.</p> : (
          <>
            <FormError error={m.error} />
            <Field label="Not" hint="Retde zorunlu" error={fieldError(m.error, "note")}>{(pp) => <input {...pp} className="field__input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <div className="row" style={{ gap: "var(--s-2)" }}>
              <button className="btn btn--primary" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "approve", note })}>Onayla</button>
              <button className="btn" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "reject", note })}>Reddet</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OrderCreate({ p }: { p: Pr }) {
  const m = useSiteMutation<{ pr_id: string }, PoWrite>("POST", "/purchase-orders");
  const sel = p.quotes.find((q) => q.id === p.selected_quote_id);
  if (p.approval) return null;
  return (
    <div className="card"><div className="card__body row row--between" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
      <div><div className="strong">Sipariş oluştur</div><div className="small muted">{sel?.vendor_name} · {sel && formatMoney(sel.total)} · numaralı sipariş oluşur; e-posta gönderimi henüz yok (K5), sipariş formunu yazdırıp iletin</div></div>
      <FormError error={m.error} />
      <button className="btn btn--primary" type="button" disabled={m.isPending} onClick={() => m.mutate({ pr_id: p.id })}><Truck aria-hidden="true" /> Siparişi oluştur</button>
    </div></div>
  );
}

function CancelPr({ id }: { id: string }) {
  const m = useSiteMutation<Record<string, never>, Pr>("POST", `/purchase-requests/${id}/cancel`);
  return <ConfirmButton className="btn btn--ghost btn--sm" title="Talebi iptal et" confirmLabel="İptal et" danger body={<p className="mb-0">Açık teklif linkleri kapanır; bekleyen onay talebi geri çekilir.</p>} onConfirm={() => m.mutateAsync({})}>Talebi iptal et</ConfirmButton>;
}

function Orders({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const base = useBase();
  const q = useSiteGet<Page<PoRow>>("/purchase-orders", { page, page_size: 50 });
  return (
    <div className="stack">
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Sipariş yok" icon={<Truck aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Siparişler</caption>
            <thead><tr><th scope="col">Sipariş</th><th scope="col">Tedarikçi</th><th scope="col" className="right">Tutar</th><th scope="col">Durum</th></tr></thead>
            <tbody>{q.data.items.map((o) => <tr key={o.id}><td><Link className="cell-main" to={`${base}/satin-alma/siparis/${o.id}`}>{o.number}</Link><div className="cell-sub">{o.pr_number} · {formatDate(o.created_at)}</div></td><td>{o.vendor_name}</td><td className="right"><Money value={o.total} /></td><td><Badge tone={poTone(o.status)}>{poStatus(o.status)}</Badge></td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
      {q.data && <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={onPage} />}
    </div>
  );
}

/** Sipariş (SAT-03/04/05): sipariş formu (yazdır), mal/hizmet kabul, tedarikçi faturası ve üçlü eşleşme. */
export function PurchaseOrderPage() {
  const { poId = "" } = useParams();
  const base = useBase();
  const { can } = useSite();
  const q = useSiteGet<Po>(`/purchase-orders/${poId}`);
  useDocumentTitle(q.data ? `${q.data.number} · Sipariş` : "Sipariş");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const o = q.data;
  const canReceive = can(P.expensesManage) || can(P.requestsAssign) || can(P.inventoryManage);
  const open = o.lines.some((l) => new Decimal(l.received).greaterThan(l.invoiced));
  const pending = o.invoices.some((i) => i.status === "diff_pending");
  return (
    <div className="stack">
      <PageHead title={`${o.number} · ${o.vendor_name}`} subtitle={<><Link to={`${base}/satin-alma?sekme=siparis`}>Siparişler</Link> · <Link to={`${base}/satin-alma/${o.pr_id}`}>{o.pr_number}</Link> · {o.created_by}, {formatDateTime(o.created_at)}</>}
        actions={<><Badge tone={poTone(o.status)}>{poStatus(o.status)}</Badge> <button className="btn btn--sm print-hide" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Sipariş formu</button></>} />
      <div className="card"><div className="card__body card__body--flush"><div className="table-wrap"><table className="data"><caption className="visually-hidden">Sipariş kalemleri</caption>
        <thead><tr><th scope="col">Kalem</th><th scope="col" className="right">Miktar</th><th scope="col" className="right">Birim fiyat</th><th scope="col" className="right">Tutar</th><th scope="col" className="right">Teslim alınan</th><th scope="col" className="right print-hide">Faturalanan</th></tr></thead>
        <tbody>{o.lines.map((l) => { const done = new Decimal(l.received).greaterThanOrEqualTo(l.qty); const some = new Decimal(l.received).greaterThan(0); return <tr key={l.id}><td className="cell-main">{l.description}{l.stock_item_id && <div className="cell-sub">stoklu</div>}</td><td className="right num">{qtyText(l.qty)} {l.unit}</td><td className="right num">{money(l.unit_price)}</td><td className="right"><Money value={l.total} /></td><td className="right num">{done ? <Badge tone="ok">{qtyText(l.received)}</Badge> : some ? <Badge tone="warn">{qtyText(l.received)}</Badge> : "0"}</td><td className="right num print-hide">{qtyText(l.invoiced)}</td></tr>; })}
          <tr><td colSpan={3} className="right strong">Toplam</td><td className="right strong"><Money value={o.total} /></td><td /><td className="print-hide" /></tr></tbody>
      </table></div></div></div>
      {(o.status === "sent" || o.status === "partial") && canReceive && <ReceiptForm o={o} />}
      {o.receipts.length > 0 && <div className="card print-hide"><div className="card__head"><span className="card__title">Kabul kayıtları</span></div><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
        {o.receipts.map((r) => <div key={r.id} className="small">{formatDateTime(r.at)} · {r.by} · {r.lines.map((x, k) => (new Decimal(x.qty).greaterThan(0) ? `${o.lines[k]!.description} ${qtyText(x.qty)}` : null)).filter(Boolean).join(", ")}{r.rating && <> · <Star aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: "-1px" }} /> {r.rating}</>}{r.note && ` · ${r.note}`} <FileButton id={r.file_id} name={r.file_name} /></div>)}
      </div></div>}
      {open && !pending && can(P.expensesManage) && <InvoiceForm o={o} />}
      {o.invoices.length > 0 && <div className="stack print-hide">{o.invoices.map((i) => <InvoiceCard key={i.id} i={i} />)}</div>}
    </div>
  );
}

function ReceiptForm({ o }: { o: Po }) {
  const remaining = (l: Po["lines"][number]) => new Decimal(l.qty).minus(l.received).toString();
  const [qty, setQty] = useState<string[]>(o.lines.map((l) => qtyText(remaining(l))));
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const attach = useAttach();
  const m = useSiteMutation<Record<string, unknown>, Po>("POST", `/purchase-orders/${o.id}/receipts`, {
    onSuccess: async (po) => {
      const last = po?.receipts[po.receipts.length - 1];
      if (last && photo) await attach(`/purchase-receipts/${last.id}/file`, await (await fetch(photo)).blob(), "kabul-fotografi.jpg");
      setNote(""); setPhoto(null); setRating(0);
    },
  });
  return (
    <form className="card print-hide" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ lines: qty.map((x) => ({ qty: qtyInput(x) })), note: note || null, rating: rating || null }); }}>
      <div className="card__head"><span className="card__title">Mal / hizmet kabul</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <FormError error={m.error} />
        {fieldError(m.error, "lines") && <span className="field__error" role="alert">{fieldError(m.error, "lines")}</span>}
        <div className="grid grid--kpi">{o.lines.map((l, k) => <Field key={k} label={`${l.description} (kalan ${qtyText(remaining(l))} ${l.unit})`} error={fieldError(m.error, `lines.${k}`)}>{(pp) => <input {...pp} className="field__input" inputMode="decimal" value={qty[k]} onChange={(e) => setQty((x) => x.map((v, j) => (j === k ? e.target.value : v)))} />}</Field>)}</div>
        <Field label="Not" hint="Eksik/fazla, hasar, irsaliye no">{(pp) => <input {...pp} className="field__input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <PhotoInput label="Fotoğraf / irsaliye" value={photo} onChange={setPhoto} />
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Tedarikçi puanı (isteğe bağlı)</legend>
          <div className="row" style={{ gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`btn btn--sm${rating >= n ? " btn--primary" : ""}`} aria-pressed={rating === n} aria-label={`${n} puan`} onClick={() => setRating(rating === n ? 0 : n)}><Star aria-hidden="true" /></button>)}</div>
          {fieldError(m.error, "rating") && <span className="field__error" role="alert">{fieldError(m.error, "rating")}</span>}
        </fieldset>
        <p className="xs muted mb-0">Stoklu kalemler kabulle birlikte sistem adına stoğa girer; stok yetkiniz olması gerekmez.</p>
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending}>Kabulü kaydet</SubmitButton></div>
    </form>
  );
}

function InvoiceForm({ o }: { o: Po }) {
  const open = (l: Po["lines"][number]) => new Decimal(l.received).minus(l.invoiced).toString();
  const [f, setF] = useState({ number: "", date: todayIso(), due_date: todayIso() });
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState(o.lines.map((l) => ({ qty: qtyText(open(l)), price: money(l.unit_price) })));
  const attach = useAttach();
  const m = useSiteMutation<Record<string, unknown>, Invoice>("POST", "/vendor-invoices", { onSuccess: async (inv) => { if (inv && file) await attach(`/vendor-invoices/${inv.id}/file`, file); setF((x) => ({ ...x, number: "" })); setFile(null); } });
  const total = previewTotal(lines);
  return (
    <form className="card print-hide" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ order_id: o.id, number: f.number, date: f.date || null, due_date: f.due_date || null, lines: lines.map((l) => ({ qty: qtyInput(l.qty), unit_price: parseMoneyInput(l.price) })) }); }}>
      <div className="card__head"><span className="card__title">Tedarikçi faturası</span><span className="card__meta ml-auto">sipariş + kabul + fatura eşleşmesi</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Fatura no" required error={fieldError(m.error, "number")}>{(pp) => <input {...pp} className="field__input mono" maxLength={30} value={f.number} onChange={(e) => setF((x) => ({ ...x, number: e.target.value }))} />}</Field>
          <Field label="Fatura tarihi" error={fieldError(m.error, "date")}>{(pp) => <input {...pp} className="field__input" type="date" max={todayIso()} value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} />}</Field>
          <Field label="Vade" error={fieldError(m.error, "due_date")}>{(pp) => <input {...pp} className="field__input" type="date" min={f.date} value={f.due_date} onChange={(e) => setF((x) => ({ ...x, due_date: e.target.value }))} />}</Field>
          <FilePick label="Fatura görüntüsü" hint="PDF ya da görsel · ödenince gidere bağlanır" onPick={setFile} />
        </div>
        {fieldError(m.error, "lines") && <span className="field__error" role="alert">{fieldError(m.error, "lines")}</span>}
        {o.lines.map((l, k) => (
          <fieldset key={k} className="stack" style={{ border: 0, padding: 0, margin: 0, gap: "var(--s-1)" }}>
            <legend className="small strong">{l.description} <span className="xs muted">· sipariş {qtyText(l.qty)} × {money(l.unit_price)} · teslim {qtyText(l.received)} · faturalanmamış {qtyText(open(l))}</span></legend>
            <div className="grid grid--2">
              <Field label="Faturadaki miktar" error={fieldError(m.error, `lines.${k}`)}>{(pp) => <input {...pp} className="field__input" inputMode="decimal" value={lines[k]!.qty} onChange={(e) => setLines((x) => x.map((v, j) => (j === k ? { ...v, qty: e.target.value } : v)))} />}</Field>
              <Field label="Faturadaki birim fiyat">{(pp) => <input {...pp} className="field__input" inputMode="decimal" value={lines[k]!.price} onChange={(e) => setLines((x) => x.map((v, j) => (j === k ? { ...v, price: e.target.value } : v)))} />}</Field>
            </div>
          </fieldset>
        ))}
        <div className="kv"><span className="kv__k strong">Fatura toplamı</span><span className="kv__v strong">{formatMoney(total)}</span></div>
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending}>Faturayı kaydet ve eşleştir</SubmitButton></div>
    </form>
  );
}

function InvoiceCard({ i }: { i: Invoice }) {
  const me = useMe();
  const { can, site } = useSite();
  const [note, setNote] = useState("");
  const m = useSiteMutation<{ decision: string; note: string }, Invoice>("POST", `/vendor-invoices/${i.id}/decide`);
  const viaRule = !!i.approval_request_id;
  return (
    <div className="card"><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}><span className="strong">Fatura {i.number} · {formatDate(i.date)}</span><Badge tone={invoiceTone(i.status)}>{invoiceStatus(i.status)}</Badge></div>
      <div className="small">Tutar {formatMoney(i.total)} · beklenen {formatMoney(i.expected_total)} · vade {formatDate(i.due_date)}{i.paid_on && ` · ödendi ${formatDate(i.paid_on)}`} <FileButton id={i.file_id} name={i.file_name} /></div>
      {i.diffs.length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>{i.diffs.map((d, k) => <li key={k}>{d}</li>)}</ul>}
      {i.decision && <div className="small muted">{i.decision.by}, {formatDateTime(i.decision.at)}: {i.decision.note}</div>}
      {i.status === "diff_pending" && viaRule && <p className="small mb-0">Fark, sitenin "Fatura farkı" onay kuralına düştü; karar <Link to={`/s/${site.slug}/onaylar`}>Onaylar</Link> ekranından ya da burada (onaycıysanız) verilir.</p>}
      {i.status === "diff_pending" && (me.user_id === i.created_by_id ? <p className="small muted mb-0">Faturayı siz girdiniz; farkı başka bir yetkili onaylar.</p> : (viaRule || can(P.expensesManage)) && (
        <div className="stack" style={{ gap: "var(--s-2)" }}>
          <FormError error={m.error} />
          <Field label="Gerekçe" required error={fieldError(m.error, "note")}>{(pp) => <input {...pp} className="field__input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div className="row" style={{ gap: "var(--s-2)" }}><button className="btn btn--sm btn--primary" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "approve", note })}>Farkı onayla</button><button className="btn btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "reject", note })}>İtiraz et</button></div>
        </div>
      ))}
    </div></div>
  );
}

function Invoices({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const base = useBase();
  const [st, setSt] = useState("");
  const q = useSiteGet<Page<Invoice>>("/vendor-invoices", { status: st || undefined, page, page_size: 50 });
  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: "16rem" }}><label className="field__label" htmlFor="vi-st">Durum</label><select id="vi-st" className="field__input" value={st} onChange={(e) => { setSt(e.target.value); onPage(1); }}><option value="">Tümü</option>{["diff_pending", "matched", "paid", "disputed"].map((k) => <option key={k} value={k}>{invoiceStatus(k)}</option>)}</select></div>
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Tedarikçi faturası yok">Fatura, siparişin ayrıntısından kabulden sonra girilir.</Empty> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Tedarikçi faturaları</caption>
            <thead><tr><th scope="col">Fatura</th><th scope="col">Tedarikçi</th><th scope="col" className="right">Tutar</th><th scope="col">Vade</th><th scope="col">Durum</th></tr></thead>
            <tbody>{q.data.items.map((i) => <tr key={i.id}><td><div className="cell-main">{i.number}</div><div className="cell-sub"><Link to={`${base}/satin-alma/siparis/${i.order_id}`}>{i.order_number}</Link></div></td><td>{i.vendor_name}</td><td className="right"><Money value={i.total} /></td><td className="small">{formatDate(i.due_date)}</td><td><Badge tone={invoiceTone(i.status)}>{invoiceStatus(i.status)}</Badge></td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
      {q.data && <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={onPage} />}
    </div>
  );
}

function Payables() {
  const base = useBase();
  const { can } = useSite();
  const q = useSiteGet<Payables>("/payables");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const overdue = q.data.invoices.filter((i) => i.overdue);
  return (
    <div className="stack">
      <div className="grid grid--kpi"><Kpi label="Ödenecek fatura" value={q.data.invoices.length} /><Kpi label="Toplam" value={<Money value={q.data.total} />} /><Kpi label="Vadesi geçen" value={overdue.length} tone={overdue.length ? "danger" : undefined} /><Kpi label="Siparişsiz gider" value={q.data.direct_expenses.count} note={<Link to={`${base}/giderler`}>{formatMoney(q.data.direct_expenses.total)} · Giderler</Link>} /></div>
      <div className="card"><div className="card__body card__body--flush">
        {q.data.invoices.length === 0 ? <Empty title="Ödenecek fatura yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Ödenecekler</caption>
            <thead><tr><th scope="col">Vade</th><th scope="col">Tedarikçi / fatura</th><th scope="col" className="right">Tutar</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.invoices.map((i) => <tr key={i.id}><td className="small">{formatDate(i.due_date)}{i.overdue && <div><Badge tone="danger">Vadesi geçti</Badge></div>}</td><td><div className="cell-main">{i.vendor_name}</div><div className="cell-sub">{i.number} · <Link to={`${base}/satin-alma/siparis/${i.order_id}`}>{i.order_number}</Link></div></td><td className="right"><Money value={i.total} /></td><td className="right">{can(P.expensesManage) && <MarkPaid i={i} />}</td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
      <p className="small muted">Platform para hareketi başlatmaz: ödemeyi site bankasından yapın, burada "ödendi" işaretleyin. İşaretlemeyle aynı anda gider kaydı yazılır ve seçilen hesaptan çıkış düşer; banka ekstresindeki çıkışla eşleştirme banka içe aktarımında yapılır.</p>
    </div>
  );
}

function MarkPaid({ i }: { i: Invoice }) {
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const accs = cash.data?.items.filter((c) => c.is_active) ?? [];
  const [f, setF] = useState({ paid_on: todayIso(), cash_account_id: "" });
  const acc = f.cash_account_id || accs.find((a) => a.kind === "bank")?.id || accs[0]?.id || "";
  const m = useSiteMutation<Record<string, unknown>, Invoice>("POST", `/vendor-invoices/${i.id}/mark-paid`, { money: true });
  return (
    <ConfirmButton className="btn btn--sm btn--primary" title={`${i.vendor_name} ${i.number} — ödendi`} confirmLabel="Ödendi olarak işaretle"
      body={<div className="stack" style={{ gap: "var(--s-3)" }}>
        <div className="small">Tutar: <strong>{formatMoney(i.total)}</strong> — gider kaydı yazılır ve seçilen hesaptan düşer.</div>
        <div className="field"><label className="field__label" htmlFor={`mp-d-${i.id}`}>Ödeme tarihi</label><input id={`mp-d-${i.id}`} className="field__input" type="date" min={i.date} max={todayIso()} value={f.paid_on} onChange={(e) => setF((x) => ({ ...x, paid_on: e.target.value }))} /></div>
        <div className="field"><label className="field__label" htmlFor={`mp-a-${i.id}`}>Ödenen hesap</label><select id={`mp-a-${i.id}`} className="field__input" value={acc} onChange={(e) => setF((x) => ({ ...x, cash_account_id: e.target.value }))}>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      </div>}
      onConfirm={() => m.mutateAsync({ ...f, cash_account_id: acc })}>Ödendi</ConfirmButton>
  );
}

function SettingsForm() {
  const q = useSiteGet<Settings>("/purchase-settings");
  if (!q.data) return q.isError ? <ErrorState error={q.error} /> : <Loading />;
  return <SettingsInner s={q.data} />;
}
function SettingsInner({ s }: { s: Settings }) {
  const [th, setTh] = useState(s.thresholds.map((t) => ({ max: money(t.max), quotes: String(t.quotes) })));
  const [f, setF] = useState({ above_quotes: String(s.above_quotes), tolerance_percent: s.tolerance_percent.replace(".", ","), link_days: String(s.link_days) });
  const m = useSiteMutation<Record<string, unknown>, Settings>("PUT", "/purchase-settings");
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ thresholds: th.map((t) => ({ max: parseMoneyInput(t.max) ?? "0.00", quotes: Number(t.quotes) || 0 })), above_quotes: Number(f.above_quotes) || 0, tolerance_percent: f.tolerance_percent.trim().replace(",", ".") || "0", link_days: Number(f.link_days) || 0 }); }}>
      <div className="card__head"><span className="card__title">Asgari teklif sayısı ve eşleşme</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {th.map((t, k) => (
          <div key={k} className="row" style={{ gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
            <span className="small">Tutar</span><input className="field__input" style={{ width: "9rem" }} inputMode="decimal" aria-label={`${k + 1}. eşik tutarı`} value={t.max} onChange={(e) => setTh((x) => x.map((v, j) => (j === k ? { ...v, max: e.target.value } : v)))} /><span className="small">₺ altındaysa</span>
            <input className="field__input" style={{ width: "4.5rem" }} inputMode="numeric" aria-label={`${k + 1}. eşik teklif sayısı`} value={t.quotes} onChange={(e) => setTh((x) => x.map((v, j) => (j === k ? { ...v, quotes: e.target.value } : v)))} /><span className="small">teklif</span>
            {th.length > 1 && <button type="button" className="btn btn--ghost btn--sm" aria-label={`${k + 1}. eşiği kaldır`} onClick={() => setTh((x) => x.filter((_, j) => j !== k))}><Trash2 aria-hidden="true" /></button>}
          </div>
        ))}
        {fieldError(m.error, "thresholds") && <span className="field__error" role="alert">{fieldError(m.error, "thresholds")}</span>}
        <div><button type="button" className="btn btn--sm" onClick={() => setTh((x) => [...x, { max: "", quotes: "2" }])}><Plus aria-hidden="true" /> Eşik</button></div>
        <div className="grid grid--kpi">
          <Field label="Son eşiğin üstünde teklif" error={fieldError(m.error, "above_quotes")}>{(pp) => <input {...pp} className="field__input" inputMode="numeric" value={f.above_quotes} onChange={(e) => setF((x) => ({ ...x, above_quotes: e.target.value }))} />}</Field>
          <Field label="Fatura tutar toleransı (%)" error={fieldError(m.error, "tolerance_percent")}>{(pp) => <input {...pp} className="field__input" inputMode="decimal" value={f.tolerance_percent} onChange={(e) => setF((x) => ({ ...x, tolerance_percent: e.target.value }))} />}</Field>
          <Field label="Teklif linki geçerliliği (gün)" error={fieldError(m.error, "link_days")}>{(pp) => <input {...pp} className="field__input" inputMode="numeric" value={f.link_days} onChange={(e) => setF((x) => ({ ...x, link_days: e.target.value }))} />}</Field>
        </div>
        <p className="xs muted mb-0">Miktar farkına tolerans yoktur: faturadaki miktar teslim alınanla aynı olmalı. Onay zinciri (kim onaylar, tutar eşikleri) Onay kuralları ekranından: "Satın alma talebi", "Teklif istisnası", "Sipariş", "Fatura farkı".</p>
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending}>Kaydet</SubmitButton></div>
    </form>
  );
}

// ===================================================================== 62 Tedarikçiler
/** Tedarikçi kartı (SAT-06): unvan, vergi no, iletişim, IBAN (maskeli), kategori, durum, ortalama puan. */
export function VendorsPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ q: "", durum: "", page: "1" });
  const q = useSiteGet<Page<VendorRow>>("/vendors", { q: s.q || undefined, status: s.durum || undefined, page: s.page, page_size: 50 });
  const [edit, setEdit] = useState<VendorRow | "new" | null>(null);
  return (
    <div className="stack">
      <PageHead title="Tedarikçiler" subtitle="Teklif, sipariş ve faturada kullanılan tedarikçi kartları. IBAN yalnız ödeme için tutulur ve maskeli gösterilir."
        actions={can(P.expensesManage) && <button className="btn btn--primary" type="button" onClick={() => setEdit("new")}><Plus aria-hidden="true" /> Tedarikçi ekle</button>} />
      {edit && <VendorForm v={edit === "new" ? null : edit} onDone={() => setEdit(null)} />}
      <div className="filters">
        <div className="field"><label className="field__label" htmlFor="vd-q">Ara</label><input id="vd-q" className="field__input" type="search" placeholder="Unvan ya da vergi no" value={s.q} onChange={(e) => set({ q: e.target.value, page: "1" })} /></div>
        <div className="field"><label className="field__label" htmlFor="vd-s">Durum</label><select id="vd-s" className="field__input" value={s.durum} onChange={(e) => set({ durum: e.target.value, page: "1" })}><option value="">Tümü</option>{["active", "passive", "blacklist"].map((k) => <option key={k} value={k}>{vendorStatus(k)}</option>)}</select></div>
      </div>
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Tedarikçi yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Tedarikçiler</caption>
            <thead><tr><th scope="col">Tedarikçi</th><th scope="col">İletişim</th><th scope="col">Puan</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.items.map((v) => <tr key={v.id}>
              <td><div className="cell-main">{v.name}</div><div className="cell-sub">VKN {v.tax_no}{v.category && ` · ${v.category}`}{v.iban_masked && ` · ${v.iban_masked}`}</div></td>
              <td className="small">{v.phone && <div>{v.phone}</div>}{v.email && <div>{v.email}</div>}</td>
              <td className="small">{v.rating_avg != null ? <><Star aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: "-1px" }} /> {v.rating_avg.replace(".", ",")} ({v.rating_count})</> : "—"}<div className="cell-sub">{v.order_count} sipariş</div></td>
              <td><Badge tone={vendorTone(v.status)}>{vendorStatus(v.status)}</Badge></td>
              <td className="right">{can(P.expensesManage) && <button className="btn btn--sm btn--ghost" type="button" onClick={() => setEdit(v)}>Düzenle</button>}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </div></div>
      {q.data && <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

function VendorForm({ v, onDone }: { v: VendorRow | null; onDone: () => void }) {
  const [f, setF] = useState({ name: v?.name ?? "", tax_no: v?.tax_no ?? "", phone: v?.phone ?? "", email: v?.email ?? "", iban: "", category: v?.category ?? "", status: v?.status ?? "active", note: v?.note ?? "" });
  const m = useSiteMutation<Record<string, unknown>, VendorRow>(v ? "PATCH" : "POST", v ? `/vendors/${v.id}` : "/vendors", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); const { iban, ...rest } = f; m.mutate(v && !iban ? rest : f); }}>
      <div className="card__head"><span className="card__title">{v ? v.name : "Yeni tedarikçi"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Unvan" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={120} autoComplete="organization" value={f.name} onChange={up("name")} />}</Field>
          <Field label="Vergi / T.C. kimlik no" required error={fieldError(m.error, "tax_no")}>{(p) => <input {...p} className="field__input mono" inputMode="numeric" maxLength={11} value={f.tax_no} onChange={up("tax_no")} />}</Field>
          <Field label="Telefon" error={fieldError(m.error, "phone")}>{(p) => <input {...p} className="field__input" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={up("phone")} />}</Field>
          <Field label="E-posta" hint="Teklif linki ve sipariş buraya iletilir" error={fieldError(m.error, "email")}>{(p) => <input {...p} className="field__input" type="email" autoComplete="email" maxLength={254} value={f.email} onChange={up("email")} />}</Field>
          <Field label="IBAN" hint={v?.iban_masked ? `Kayıtlı: ${v.iban_masked} — değiştirmek için yazın` : "TR ile başlayan 26 karakter"} error={fieldError(m.error, "iban")}>{(p) => <input {...p} className="field__input mono" maxLength={34} autoComplete="off" value={f.iban} onChange={up("iban")} />}</Field>
          <Field label="Kategori" hint="ör. Asansör bakım, temizlik malzemesi">{(p) => <input {...p} className="field__input" maxLength={60} value={f.category} onChange={up("category")} />}</Field>
          <Field label="Durum" error={fieldError(m.error, "status")}>{(p) => <select {...p} className="field__input" value={f.status} onChange={up("status")}>{["active", "passive", "blacklist"].map((k) => <option key={k} value={k}>{vendorStatus(k)}</option>)}</select>}</Field>
          <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={up("note")} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>{v ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
