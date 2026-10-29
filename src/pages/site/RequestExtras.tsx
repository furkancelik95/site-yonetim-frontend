import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { GitMerge, Lock, Plus, Receipt, Star, Trash2 } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Field, FormError, Money, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, formatMoney, parseMoneyInput } from "../../lib/format";
import { hourType, quoteTone, slaState, slaTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Detail = Schemas["RequestDetail"];
export type Sla = Schemas["RequestSlaOut"];
type Note = Schemas["InternalNoteOut"];
type Suggest = Schemas["MergeSuggestionsOut"];
export type Quote = Schemas["ServiceQuoteOut"];
type Tariff = Schemas["ServiceTariffOut"];

const hm = (m: number) => (m >= 1440 ? `${Math.floor(m / 1440)} g ${Math.floor((m % 1440) / 60)} sa` : `${Math.floor(m / 60)} sa ${m % 60} dk`);

export function SlaBadge({ s }: { s: Sla | null | undefined }) {
  if (!s) return null;
  return <Badge tone={slaTone(s.state)}>{slaState(s.state)}{(s.state === "ok" || s.state === "warning") && ` · ${hm(s.remaining_minutes)}`}{s.paused && " · durdu"}</Badge>;
}

/** SLA kartı (istek 47): hedef, saat tipi, kalan süre; çalışma saati dışında sayaç durur. */
export function SlaCard({ s }: { s: Sla | null | undefined }) {
  if (!s) return null;
  return (
    <div className="kv"><span className="kv__k">SLA</span><span className="kv__v"><SlaBadge s={s} /><div className="xs muted">Hedef {s.target_hours} sa ({hourType(s.hour_type)}) · {formatDateTime(s.due_at)}</div></span></div>
  );
}

/** İç notlar (istek 48, K26): yalnız personel; sakin hiçbir kanalda görmez, silinmez. */
export function InternalNotes({ id }: { id: string }) {
  const q = useSiteGet<Note[]>(`/requests/${id}/internal-notes`);
  const [body, setBody] = useState("");
  const m = useSiteMutation<{ body: string }, Note>("POST", `/requests/${id}/internal-notes`, { onSuccess: () => setBody("") });
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--warn"><Lock aria-hidden="true" /></span><span className="card__title">İç notlar</span><span className="card__meta ml-auto">sakin görmez</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {(q.data ?? []).map((n) => <div key={n.id} className="small" style={{ borderLeft: "3px solid var(--warn-solid, #d97706)", paddingLeft: "var(--s-2)" }}><Badge tone="warn">İç not</Badge> {n.body}<div className="xs muted">{n.author_name} · {formatDateTime(n.created_at)}</div></div>)}
        <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ body: body.trim() }); }}>
          <FormError error={m.error} />
          <Field label="İç not ekle" error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={2} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
          <div><SubmitButton busy={m.isPending} className="btn" disabled={body.trim().length < 2}>Notu ekle</SubmitButton></div>
        </form>
      </div>
    </div>
  );
}

/** Birleştirme önerisi ve ana olay (istek 49). Kural tabanlı: aynı kategori + konum/blok + zaman penceresi. */
export function MergeCard({ r }: { r: Detail }) {
  const { site, can } = useSite();
  const manage = can(P.requestsAssign);
  const q = useSiteGet<Suggest>(`/requests/${r.id}/merge-suggestions`, undefined, { enabled: manage });
  const create = useSiteMutation<Record<string, unknown>, unknown>("POST", "/outages");
  const [f, setF] = useState({ title: r.title, public_description: "" });
  const [open, setOpen] = useState(false);
  if (r.outage) return <LinkedOutage requestId={r.id} outage={r.outage} canUnlink={manage} />;
  if (!manage || !q.data) return null;
  const d = q.data;
  if (d.similar.length === 0 && d.open_outages.length === 0) return null;
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--info"><GitMerge aria-hidden="true" /></span><span className="card__title">Bu talepler aynı arıza olabilir</span><span className="card__meta ml-auto">son {d.window_hours} saat, aynı kategori ve konum</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        {d.similar.map((x) => <div key={x.id} className="small"><Link to={`/s/${site.slug}/talepler/${x.id}`}>#{x.number} {x.title}</Link> <span className="muted">· {x.unit_name ?? x.location ?? "Ortak alan"} · {formatDateTime(x.created_at)}</span></div>)}
        {d.open_outages.map((o) => <OutageLink key={o.id} outageId={o.id} title={o.title} count={o.request_count} requestId={r.id} />)}
        {d.similar.length > 0 && (open ? (
          <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); create.mutate({ title: f.title, category: r.category, location: r.location, public_description: f.public_description, request_ids: [r.id, ...d.similar.map((x) => x.id)] }, { onSuccess: () => setOpen(false) }); }}>
            <FormError error={create.error} />
            <Field label="Ana olay başlığı" error={fieldError(create.error, "title")}>{(p) => <input {...p} className="field__input" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
            <Field label="Sakinlerin göreceği açıklama" hint="Sakinler birbirinin talebini görmez; yalnız bu genel açıklamayı görür" error={fieldError(create.error, "public_description")}>{(p) => <textarea {...p} className="field__input" rows={2} value={f.public_description} onChange={(e) => setF((x) => ({ ...x, public_description: e.target.value }))} />}</Field>
            <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={create.isPending}>{d.similar.length + 1} talebi ana olayda topla</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Vazgeç</button></div>
          </form>
        ) : <div className="row" style={{ gap: "var(--s-2)" }}><button className="btn btn--sm btn--primary" type="button" onClick={() => setOpen(true)}>Ana olay oluştur</button><span className="small muted">ya da yok sayın; öneri kural tabanlıdır.</span></div>)}
      </div>
    </div>
  );
}

/** Bağlı ana olay; açık olaydan talep ayrılabilir (POST /outages/{id}/unlink). Çözülmüş olayda backend reddeder, düğme gösterilmez. */
function LinkedOutage({ requestId, outage, canUnlink }: { requestId: string; outage: NonNullable<Detail["outage"]>; canUnlink: boolean }) {
  const { site } = useSite();
  const m = useSiteMutation<{ request_id: string }, unknown>("POST", `/outages/${outage.id}/unlink`);
  return (
    <Alert tone="info" title={`Ana olaya bağlı: ${outage.title}`}>
      {outage.status === "resolved" ? "Ana olay çözüldü." : "Ana olay çözülünce bu talep de çözülür."} <Link to={`/s/${site.slug}/talepler/ana-olaylar`}>Ana olaylar</Link>
      {canUnlink && outage.status === "open" && (
        <div className="mt-2">
          <ConfirmButton className="btn btn--sm" title="Talebi ana olaydan ayır" confirmLabel="Ayır" body="Talep ana olayla birlikte çözülmez; kendi akışında devam eder." onConfirm={() => m.mutateAsync({ request_id: requestId })}>Ana olaydan ayır</ConfirmButton>
        </div>
      )}
    </Alert>
  );
}

function OutageLink({ outageId, title, count, requestId }: { outageId: string; title: string; count: number; requestId: string }) {
  const m = useSiteMutation<{ request_id: string }, unknown>("POST", `/outages/${outageId}/links`);
  return <div className="row row--between small"><span>Açık ana olay: <strong>{title}</strong> <span className="muted">({count} talep)</span></span><button className="btn btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ request_id: requestId })}>Bu olaya bağla</button></div>;
}

/** Sakin kapanış onayı ve puan (istek 50) ile ücretli hizmet teklifi (istek 51). */
export function ExtrasCard({ r }: { r: Detail }) {
  const { can } = useSite();
  const [quoting, setQuoting] = useState(false);
  const { feedback, quote } = r;
  const active = !["closed", "cancelled"].includes(r.status);
  const canQuote = can(P.requestsAssign) && !!r.unit_id && active && (!quote || ["rejected", "billed"].includes(quote.status));
  return (
    <>
      {feedback && (
        <div className="card"><div className="card__body">
          <div className="row" style={{ gap: "var(--s-2)" }}><Star aria-hidden="true" /> <strong>Sakin değerlendirmesi</strong> {feedback.solved ? <Badge tone={(feedback.score ?? 0) <= 2 ? "danger" : "ok"}>{feedback.score}/5</Badge> : <Badge tone="danger">Sorun devam ediyor</Badge>}</div>
          {feedback.comment && <p className="small mb-0 mt-2">"{feedback.comment}"</p>}
          <div className="xs muted">{feedback.by_name} · {formatDateTime(feedback.created_at)}</div>
        </div></div>
      )}
      {r.status === "resolved" && r.auto_close_at && !feedback?.solved && <p className="small muted mb-0">Sakin onayı bekleniyor; yanıt gelmezse {formatDateTime(r.auto_close_at)} itibarıyla kendiliğinden kapanır.</p>}
      {(quote || canQuote) && (
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><Receipt aria-hidden="true" /></span><span className="card__title">Ücretli hizmet</span>{quote && <span className="ml-auto"><Badge tone={quoteTone(quote.status)}>{quote.status_label}</Badge></span>}</div>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            {quote && <QuoteView q={quote} />}
            {quote?.status === "accepted" && can(P.requestsAssign) && <CompleteQuote q={quote} />}
            {canQuote && (quoting ? <QuoteForm requestId={r.id} onDone={() => setQuoting(false)} /> : <div><button className="btn btn--sm" type="button" onClick={() => setQuoting(true)}><Plus aria-hidden="true" /> Teklif hazırla</button> <span className="small muted">Bölüm içi işte sakin onayı olmadan ücret yansımaz.</span></div>)}
          </div>
        </div>
      )}
    </>
  );
}

export function QuoteView({ q }: { q: Quote }) {
  return (
    <div className="stack" style={{ gap: "var(--s-1)" }}>
      {q.lines.map((l, i) => <div key={i} className="kv"><span className="kv__k">{l.description} · {Number(l.qty).toLocaleString("tr-TR")} × {formatMoney(l.unit_price)}</span><span className="kv__v"><Money value={l.total} /></span></div>)}
      <div className="kv"><span className="kv__k strong">Teklif</span><span className="kv__v strong"><Money value={q.total} /></span></div>
      {q.actual_total && <div className="kv"><span className="kv__k">Gerçekleşen</span><span className="kv__v"><Money value={q.actual_total} /></span></div>}
      {q.billed_total && <div className="kv"><span className="kv__k">Cariye yansıyan</span><span className="kv__v"><Money value={q.billed_total} /></span></div>}
      {q.note && <p className="small muted mb-0">{q.note}</p>}
    </div>
  );
}

function QuoteForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const tariffs = useSiteGet<Tariff[]>("/service-tariffs");
  const [lines, setLines] = useState([{ description: "", qty: "1", unit_price: "" }]);
  const [note, setNote] = useState("");
  const m = useSiteMutation<Record<string, unknown>, Quote>("POST", `/requests/${requestId}/quotes`, { onSuccess: onDone });
  const upd = (i: number, k: "description" | "qty" | "unit_price", v: string) => setLines((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(parseMoneyInput(l.unit_price) ?? 0), 0);
  const active = (tariffs.data ?? []).filter((t) => t.is_active);
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ lines: lines.map((l) => ({ description: l.description, qty: l.qty || "0", unit_price: parseMoneyInput(l.unit_price) ?? "0" })), note: note.trim() || null }); }
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={submit}>
      <FormError error={m.error} />
      {active.length > 0 && <div className="row" style={{ gap: "var(--s-1)" }}>{active.map((t) => <button key={t.id} type="button" className="btn btn--sm" onClick={() => setLines((l) => [...l.filter((x) => x.description || x.unit_price), { description: t.name, qty: "1", unit_price: Number(t.price).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) }])}><Plus aria-hidden="true" /> {t.name} ({formatMoney(t.price)}/{t.unit})</button>)}</div>}
      {lines.map((l, i) => (
        <div key={i} className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "2 1 12rem" }}><label className="field__label" htmlFor={`ql-d-${i}`}>Kalem</label><input id={`ql-d-${i}`} className="field__input" value={l.description} onChange={(e) => upd(i, "description", e.target.value)} placeholder="ör. Batarya değişimi (malzeme)" /></div>
          <div className="field" style={{ flex: "0 1 5rem" }}><label className="field__label" htmlFor={`ql-q-${i}`}>Miktar</label><input id={`ql-q-${i}`} className="field__input" inputMode="decimal" value={l.qty} onChange={(e) => upd(i, "qty", e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} /></div>
          <div className="field" style={{ flex: "1 1 7rem" }}><label className="field__label" htmlFor={`ql-p-${i}`}>Birim fiyat (₺)</label><input id={`ql-p-${i}`} className="field__input" inputMode="decimal" value={l.unit_price} onChange={(e) => upd(i, "unit_price", e.target.value)} /></div>
          {lines.length > 1 && <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={`${i + 1}. kalemi kaldır`} onClick={() => setLines((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>}
        </div>
      ))}
      {fieldError(m.error, "lines") && <span className="field__error" role="alert">{fieldError(m.error, "lines")}</span>}
      <div className="row row--between"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setLines((x) => [...x, { description: "", qty: "1", unit_price: "" }])}><Plus aria-hidden="true" /> Kalem</button><span className="strong">Toplam {formatMoney(total.toFixed(2))}</span></div>
      <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Sakine gönder</SubmitButton><button type="button" className="btn btn--ghost" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function CompleteQuote({ q }: { q: Quote }) {
  const [amount, setAmount] = useState(Number(q.total).toLocaleString("tr-TR", { minimumFractionDigits: 2 }));
  const m = useSiteMutation<{ actual_total: string | null }, Quote>("POST", `/quotes/${q.id}/complete`);
  return (
    <ConfirmButton className="btn btn--primary btn--sm" title="İşi tamamla" confirmLabel="Tamamla"
      body={<div className="field"><label className="field__label" htmlFor={`qc-${q.id}`}>Gerçekleşen tutar (₺)</label><input id={`qc-${q.id}`} className="field__input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /><span className="field__hint">Teklifi aşarsa ek tutar için sakin onayı istenir; reddederse teklif tutarı geçerli olur.</span></div>}
      onConfirm={() => m.mutateAsync({ actual_total: parseMoneyInput(amount) })}>
      İş tamamlandı
    </ConfirmButton>
  );
}
