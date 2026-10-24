import { useState, type FormEvent } from "react";
import { Bell, CalendarClock, FileText, Phone, StickyNote } from "lucide-react";
import { Link } from "react-router";
import { useSiteGet, useSiteMutation } from "../api/hooks";
import { Badge, ConfirmButton, Field, FormError, Loading, Money, SubmitButton, fieldError } from "./ui";
import { formatDate, formatDateTime, formatMoney, parseMoneyInput, todayIso } from "../lib/format";
import { collectionKind, installmentStatus, installmentTone, letterMethod, letterStatus, planStatus, planStatusTone, reminderChannel } from "../lib/labels";
import { P, useSite } from "../site/SiteContext";

/** Servis isteği 29 ve 30'daki şekiller. */
export interface Installment { no: number; due_date: string; amount: string; paid: string; status: "paid" | "partial" | "open" | "overdue" }
export interface PaymentPlan {
  id: string; account_id: string; unit_id: string; unit_name: string; person_name: string | null; reference_code: string; total: string; installment_count: number; tolerance_days: number;
  note: string | null; created_by: string; created_at: string; cancelled_at: string | null; cancel_reason: string | null; installments: Installment[]; status: "active" | "broken" | "completed" | "cancelled"; paid_total: string;
}
interface TimelineItem {
  id: string; kind: "reminder" | "call" | "note" | "demand_letter" | "payment_plan"; channel: string | null; note: string | null; by: string; at: string;
  letter?: { id: string; method: string; sent_on: string; tracking_no: string | null; served_on: string | null; status: "sent" | "served" }; plan?: { id: string; status: string } | null;
}

/** Toplamı koruyan eşit bölme (servisle aynı kural): kuruş artığı ilk taksitlere. */
export function splitEven(totalCents: number, n: number) {
  const base = Math.floor(totalCents / n), rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}
export function addMonths(d: string, n: number) {
  const x = new Date(d + "T00:00:00"); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/**
 * Borç takibi (FIN-12): cari hesap üzerinde hatırlatma, arama notu, ihtarname gönderim/tebliğ kaydı ve ödeme planı.
 * Borçlu bilgisi yalnız yetkili rollerde; sakin ekranlarında hiç yok. Gönderim (bildirim/SMS) K5 ile gelecek.
 */
export function CollectionPanel({ accountId, balance }: { accountId: string; balance: string }) {
  const { site, can } = useSite();
  const manage = can(P.paymentRecord);
  const tl = useSiteGet<TimelineItem[]>(`/accounts/${accountId}/collection-timeline`);
  const plans = useSiteGet<PaymentPlan[]>(`/accounts/${accountId}/payment-plans`);
  const [panel, setPanel] = useState<"action" | "letter" | "plan" | null>(null);
  const active = plans.data?.find((p) => p.status === "active" || p.status === "broken");
  const toggle = (p: typeof panel) => setPanel((x) => (x === p ? null : p));
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--warn"><CalendarClock aria-hidden="true" /></span>
        <span className="card__title">Borç takibi</span>
        <span className="card__meta">hatırlatma, ihtarname, ödeme planı</span>
      </div>
      {manage && (
        <div className="card__body row" style={{ gap: "var(--s-2)", borderBottom: "1px solid var(--line)" }}>
          <button className="btn btn--sm" type="button" aria-expanded={panel === "action"} onClick={() => toggle("action")}><Bell aria-hidden="true" /> Hatırlatma / not</button>
          <Link className="btn btn--sm" to={`/s/${site.slug}/belge/ihtar/${accountId}`}><FileText aria-hidden="true" /> İhtarname yazısı</Link>
          <button className="btn btn--sm" type="button" aria-expanded={panel === "letter"} onClick={() => toggle("letter")}>İhtarname gönderimini kaydet</button>
          {Number(balance) > 0 && !active && <button className="btn btn--sm btn--primary" type="button" aria-expanded={panel === "plan"} onClick={() => toggle("plan")}>Ödeme planı oluştur</button>}
        </div>
      )}
      {panel === "action" && <ActionForm accountId={accountId} onDone={() => setPanel(null)} />}
      {panel === "letter" && <LetterForm accountId={accountId} onDone={() => setPanel(null)} />}
      {panel === "plan" && <PlanForm accountId={accountId} balance={balance} onDone={() => setPanel(null)} />}
      {active && <div className="card__body" style={{ borderBottom: "1px solid var(--line)" }}><PlanView p={active} manage={manage} /></div>}
      <div className="card__body">
        {tl.isPending ? <Loading /> : !tl.data || tl.data.length === 0 ? <p className="small muted mb-0">Henüz takip kaydı yok.</p> : (
          <ol className="timeline">
            {tl.data.map((e) => (
              <li key={e.id}>
                <div className="timeline__title">
                  {collectionKind(e.kind)}
                  {e.kind === "reminder" && e.channel && <span className="muted"> · {reminderChannel(e.channel)}</span>}
                  {e.letter && <> · {letterMethod(e.letter.method)} <Badge tone={e.letter.status === "served" ? "ok" : "info"}>{letterStatus(e.letter.status)}</Badge></>}
                  {e.plan && <> <Badge tone={planStatusTone(e.plan.status)}>{planStatus(e.plan.status)}</Badge></>}
                </div>
                <div className="timeline__meta">{formatDateTime(e.at)} · {e.by}</div>
                {e.note && <div className="small">{e.note}</div>}
                {e.letter && (
                  <div className="small">
                    Gönderim {formatDate(e.letter.sent_on)}{e.letter.tracking_no && <> · takip no <span className="mono">{e.letter.tracking_no}</span></>}
                    {e.letter.served_on ? <> · tebliğ {formatDate(e.letter.served_on)}</> : manage && <ServeButton letterId={e.letter.id} sentOn={e.letter.sent_on} />}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ActionForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [f, setF] = useState({ kind: "reminder", channel: "app", note: "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/accounts/${accountId}/collection-actions`, { onSuccess: onDone });
  return (
    <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ kind: f.kind, channel: f.kind === "reminder" ? f.channel : undefined, note: f.note.trim() || undefined }); }}>
      <FormError error={m.error} />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Kayıt türü</legend>
        <div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>
          {[["reminder", "Hatırlatma", Bell], ["call", "Arama", Phone], ["note", "Not", StickyNote]].map(([k, l, I]) => {
            const Icon = I as typeof Bell;
            return <label key={k as string} className="check"><input type="radio" name="col-kind" checked={f.kind === k} onChange={() => setF((x) => ({ ...x, kind: k as string }))} /><span><Icon aria-hidden="true" style={{ width: 16, height: 16, verticalAlign: "-3px" }} /> {l as string}</span></label>;
          })}
        </div>
      </fieldset>
      {f.kind === "reminder" && <Field label="Kanal" hint="Gönderim servisi (K5) gelene kadar yalnız kayıt tutulur" error={fieldError(m.error, "channel")}>{(p) => <select {...p} className="field__input" style={{ maxWidth: "18rem" }} value={f.channel} onChange={(e) => setF((x) => ({ ...x, channel: e.target.value }))}><option value="app">{reminderChannel("app")}</option><option value="sms">{reminderChannel("sms")}</option></select>}</Field>}
      <Field label={f.kind === "reminder" ? "Not (isteğe bağlı)" : "Not"} required={f.kind !== "reminder"} error={fieldError(m.error, "note")}>{(p) => <textarea {...p} className="field__input" rows={2} maxLength={500} placeholder={f.kind === "call" ? "ör. Ay sonunda ödeyeceğini söyledi" : undefined} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function LetterForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [f, setF] = useState({ method: "registered_mail", sent_on: todayIso(), tracking_no: "", note: "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/accounts/${accountId}/demand-letters`, { onSuccess: onDone });
  return (
    <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, tracking_no: f.tracking_no.trim() || null, note: f.note.trim() || null }); }}>
      <FormError error={m.error} />
      <p className="small muted mb-0">İhtarname yazısını "İhtarname yazısı" düğmesinden yazdırın; burada gönderimi kaydedersiniz. Metin avukat onayı bekliyor (A-04); KEP gönderimi sonraki fazda.</p>
      <div className="grid grid--kpi">
        <Field label="Gönderim yöntemi" required error={fieldError(m.error, "method")}>{(p) => <select {...p} className="field__input" value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value }))}>{["hand", "registered_mail", "notary"].map((k) => <option key={k} value={k}>{letterMethod(k)}</option>)}</select>}</Field>
        <Field label="Gönderim tarihi" required error={fieldError(m.error, "sent_on")}>{(p) => <input {...p} className="field__input" type="date" max={todayIso()} value={f.sent_on} onChange={(e) => setF((x) => ({ ...x, sent_on: e.target.value }))} />}</Field>
        <Field label={f.method === "notary" ? "Yevmiye no" : "Takip no"} required={f.method !== "hand"} error={fieldError(m.error, "tracking_no")}>{(p) => <input {...p} className="field__input" maxLength={40} value={f.tracking_no} onChange={(e) => setF((x) => ({ ...x, tracking_no: e.target.value }))} />}</Field>
      </div>
      <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={300} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Gönderimi kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ServeButton({ letterId, sentOn }: { letterId: string; sentOn: string }) {
  const [date, setDate] = useState(todayIso());
  const m = useSiteMutation<{ served_on: string }, unknown>("PATCH", `/demand-letters/${letterId}`);
  return (
    <>
      {" · "}
      <ConfirmButton className="btn btn--ghost btn--sm" title="Tebliğ tarihini kaydet" confirmLabel="Kaydet"
        body={<div className="field"><label className="field__label" htmlFor={`srv-${letterId}`}>Tebliğ tarihi</label><input id={`srv-${letterId}`} className="field__input" type="date" min={sentOn} max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /><span className="field__hint">Tebliğ belgesinin yüklenmesi belge modülüyle gelecek.</span></div>}
        onConfirm={() => m.mutateAsync({ served_on: date })}>
        Tebliğ edildi
      </ConfirmButton>
    </>
  );
}

function PlanForm({ accountId, balance, onDone }: { accountId: string; balance: string; onDone: () => void }) {
  const [f, setF] = useState({ amount: Number(balance).toLocaleString("tr-TR", { minimumFractionDigits: 2 }), count: "6", first: addMonths(todayIso(), 1).slice(0, 8) + "10", note: "" });
  const m = useSiteMutation<Record<string, unknown>, PaymentPlan>("POST", `/accounts/${accountId}/payment-plans`, { onSuccess: onDone });
  const amount = parseMoneyInput(f.amount);
  const n = Number(f.count);
  const preview = amount && Number(amount) > 0 && n >= 2 && n <= 36 && f.first ? splitEven(Math.round(Number(amount) * 100), n).map((c, i) => ({ no: i + 1, due: addMonths(f.first, i), amount: (c / 100).toFixed(2) })) : [];
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ amount, installment_count: n, first_due_date: f.first, note: f.note.trim() || null });
  }
  return (
    <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Yapılandırılacak tutar (₺)" required hint={`Açık bakiye ${formatMoney(balance)}`} error={fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} />}</Field>
        <Field label="Taksit sayısı" required hint="2–36" error={fieldError(m.error, "installment_count")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.count} onChange={(e) => setF((x) => ({ ...x, count: e.target.value.replace(/\D/g, "").slice(0, 2) }))} />}</Field>
        <Field label="İlk taksit vadesi" required hint="Sonrakiler ayda bir" error={fieldError(m.error, "first_due_date")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.first} onChange={(e) => setF((x) => ({ ...x, first: e.target.value }))} />}</Field>
      </div>
      <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={300} placeholder="ör. Yönetim kurulu 12.10 kararı" value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
      {preview.length > 0 && (
        <details open={preview.length <= 12}>
          <summary className="small">Taksit takvimi ({preview.length} taksit, toplam {formatMoney(amount)})</summary>
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Taksit önizlemesi</caption>
            <thead><tr><th scope="col">Taksit</th><th scope="col">Vade</th><th scope="col" className="right">Tutar</th></tr></thead>
            <tbody>{preview.map((i) => <tr key={i.no}><td className="num">{i.no}</td><td className="small nowrap">{formatDate(i.due)}</td><td className="right"><Money value={i.amount} /></td></tr>)}</tbody>
          </table></div>
        </details>
      )}
      <p className="small muted mb-0">Taksitler vadesinde ödendikçe plan ilerler; tolerans gününü (Finans ayarları) aşan taksit planı bozar ve yöneticiye uyarı düşer. Plan onay mekanizmasına bağlanması ortak kararı bekliyor (K21).</p>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!preview.length}>Planı oluştur</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

/** Plan özeti ve taksit tablosu: personel ve sakin ekranında ortak. */
export function PlanView({ p, manage }: { p: PaymentPlan | (Pick<PaymentPlan, "id" | "unit_name" | "total" | "installment_count" | "installments" | "status"> & Partial<PaymentPlan>); manage?: boolean }) {
  const cancel = useSiteMutation<{ reason: string }, PaymentPlan>("POST", `/payment-plans/${p.id}/cancel`);
  const [reason, setReason] = useState("");
  const paid = p.installments.filter((i) => i.status === "paid").length;
  return (
    <div className="stack" style={{ gap: "var(--s-3)" }}>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <div>
          <span className="strong">Ödeme planı</span> <Badge tone={planStatusTone(p.status)}>{planStatus(p.status)}</Badge>
          <div className="small muted">{p.installment_count} taksit · toplam {formatMoney(p.total)} · {paid}/{p.installment_count} ödendi{p.created_by && <> · {p.created_by}, {formatDate(p.created_at)}</>}</div>
        </div>
        {manage && (p.status === "active" || p.status === "broken") && (
          <ConfirmButton className="btn btn--ghost btn--sm" danger title="Ödeme planını iptal et" confirmLabel="İptal et"
            body={<div className="field"><label className="field__label" htmlFor={`pc-${p.id}`}>Gerekçe *</label><input id={`pc-${p.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} /><span className="field__hint">Kalan borç normal hatırlatma kurallarına döner.</span></div>}
            onConfirm={() => cancel.mutateAsync({ reason })}>
            Planı iptal et
          </ConfirmButton>
        )}
      </div>
      {p.status === "broken" && <p className="small field__error mb-0">Geciken taksit var; plan bozuldu. Kalan taksitler normal gecikme kurallarına döner.</p>}
      <div className="table-wrap"><table className="data">
        <caption className="visually-hidden">Taksitler</caption>
        <thead><tr><th scope="col">Taksit</th><th scope="col">Vade</th><th scope="col" className="right">Tutar</th><th scope="col" className="right">Ödenen</th><th scope="col">Durum</th></tr></thead>
        <tbody>{p.installments.map((i) => (
          <tr key={i.no}><td className="num">{i.no}</td><td className="small nowrap">{formatDate(i.due_date)}</td><td className="right"><Money value={i.amount} /></td><td className="right"><Money value={i.paid} /></td><td><Badge tone={installmentTone(i.status)}>{installmentStatus(i.status)}</Badge></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
