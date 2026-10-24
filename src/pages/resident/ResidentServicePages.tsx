import { useState, type FormEvent } from "react";
import { Hammer, Star } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Badge, Empty, ErrorState, Field, FormError, Loading, Money, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatMoney, todayIso } from "../../lib/format";
import { meterKind, permitStatus, permitTone, permitType, quoteStatus } from "../../lib/labels";

/** Servis isteği 49, 50, 51'deki şekiller (sakin tarafı). */
interface Quote { id: string; lines: { description: string; qty: number; unit_price: string; total: string }[]; total: string; status: string; actual_total: string | null; billed_total: string | null }
export interface ReqExtras { outage: { title: string; public_description: string; status: string } | null; rating: { solved: boolean; score: number | null; comment: string | null } | null; quote: Quote | null; auto_close_on: string | null }
interface Permit { id: string; unit_name: string; type: string; date_from: string; date_to: string; contractor: string | null; description: string; status: string; reject_reason: string | null; deposit: string | null }
interface Rules { weekday_hours: string; saturday_hours: string; sunday_allowed: boolean; deposit_amount: string }

/** Sakinin talep kartı ekleri: ana olay açıklaması, teklif onayı, kapanış onayı ve puan. */
export function RequestExtrasBlock({ id, status, ex }: { id: string; status: string; ex: ReqExtras | undefined }) {
  if (!ex) return null;
  return (
    <div className="stack" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
      {ex.outage && <div className="small" style={{ background: "var(--bg-sunken)", borderRadius: 8, padding: "var(--s-2)" }}><strong>{ex.outage.title}</strong> {ex.outage.status === "resolved" ? <Badge tone="ok">Giderildi</Badge> : <Badge tone="warn">Üzerinde çalışılıyor</Badge>}<div>{ex.outage.public_description}</div></div>}
      {ex.quote && (ex.quote.status === "pending" || ex.quote.status === "extra_pending") && <QuoteDecision q={ex.quote} />}
      {ex.quote && !["pending", "extra_pending"].includes(ex.quote.status) && <div className="small">Ücretli hizmet: {quoteStatus(ex.quote.status)}{ex.quote.billed_total && <> · <Money value={ex.quote.billed_total} /></>}</div>}
      {status === "resolved" && !ex.rating && <ConfirmForm id={id} autoClose={ex.auto_close_on} />}
      {ex.rating && <div className="small"><Star aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px" }} /> {ex.rating.solved ? `Değerlendirmeniz: ${ex.rating.score}/5` : "Sorunun devam ettiğini bildirdiniz"}</div>}
    </div>
  );
}

function QuoteDecision({ q }: { q: Quote }) {
  const m = useSiteMutation<{ decision: string }, Quote>("POST", `/resident/quotes/${q.id}/decision`);
  const extra = q.status === "extra_pending";
  return (
    <div className="card" style={{ borderColor: "var(--warn-solid, #d97706)" }}><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
      <div className="strong small">{extra ? "Ek tutar onayı" : "Ücretli hizmet teklifi"}</div>
      {q.lines.map((l, i) => <div key={i} className="kv"><span className="kv__k">{l.description} · {l.qty} × {formatMoney(l.unit_price)}</span><span className="kv__v"><Money value={l.total} /></span></div>)}
      <div className="kv"><span className="kv__k strong">{extra ? "Teklif" : "Toplam"}</span><span className="kv__v strong"><Money value={q.total} /></span></div>
      {extra && <div className="kv"><span className="kv__k strong">Gerçekleşen</span><span className="kv__v strong"><Money value={q.actual_total} /></span></div>}
      <p className="xs muted mb-0">{extra ? "Reddederseniz teklif tutarı geçerli olur." : "Onaylarsanız tutar iş bitince borcunuza eklenir. Onay vermeden ücretli iş yapılmaz."}</p>
      <div className="row" style={{ gap: "var(--s-2)" }}><button className="btn btn--primary btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "accept" })}>Onaylıyorum</button><button className="btn btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ decision: "reject" })}>Reddediyorum</button></div>
    </div></div>
  );
}

function ConfirmForm({ id, autoClose }: { id: string; autoClose: string | null }) {
  const [solved, setSolved] = useState(true);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/resident/requests/${id}/confirm`);
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ solved, score: solved ? score : null, comment: comment.trim() || null }); }}>
      <FormError error={m.error} />
      <div className="row" style={{ gap: "var(--s-3)" }}>
        <label className="check"><input type="radio" name={`sv-${id}`} checked={solved} onChange={() => setSolved(true)} /><span>Sorun çözüldü</span></label>
        <label className="check"><input type="radio" name={`sv-${id}`} checked={!solved} onChange={() => setSolved(false)} /><span>Devam ediyor</span></label>
      </div>
      {solved && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="xs muted">Hizmeti puanlayın</legend>
          <div className="row" style={{ gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`btn btn--sm${score >= n ? " btn--primary" : ""}`} aria-pressed={score === n} aria-label={`${n} puan`} onClick={() => setScore(n)}><Star aria-hidden="true" /></button>)}</div>
          {fieldError(m.error, "score") && <span className="field__error">{fieldError(m.error, "score")}</span>}
        </fieldset>
      )}
      <Field label={solved ? "Yorum (isteğe bağlı)" : "Ne devam ediyor?"} error={fieldError(m.error, "comment")}>{(p) => <input {...p} className="field__input" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
      <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}><SubmitButton busy={m.isPending} className="btn btn--sm btn--primary" disabled={solved && score === 0}>Gönder</SubmitButton>{autoClose && <span className="xs muted">Yanıt vermezseniz talep {formatDate(autoClose)} tarihinde kapanır.</span>}</div>
    </form>
  );
}

/** Tadilat ve taşınma (HIZ-05, sakin): başvuru ve durum; çalışma saatleri kuralları görünür. */
export function ResidentPermitsPage() {
  useDocumentTitle("Tadilat ve taşınma");
  const q = useSiteGet<{ rules: Rules; items: Permit[] }>("/resident/permits");
  const [adding, setAdding] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const r = q.data.rules;
  return (
    <>
      <div className="section-title">Tadilat ve taşınma</div>
      <p className="small muted">Tadilat saatleri: hafta içi {r.weekday_hours}, cumartesi {r.saturday_hours || "yasak"}, pazar {r.sunday_allowed ? "serbest" : "yasak"}.{Number(r.deposit_amount) > 0 && ` Tadilatta ${formatMoney(r.deposit_amount)} depozito alınır, iş bitince iade edilir.`}</p>
      <div className="stack" style={{ gap: "var(--s-3)" }}>
        {adding ? <PermitForm onDone={() => setAdding(false)} /> : <button className="btn btn--primary" style={{ width: "100%" }} type="button" onClick={() => setAdding(true)}><Hammer aria-hidden="true" /> Başvuru yap</button>}
        {q.data.items.length === 0 ? <Empty title="Başvurunuz yok" /> : q.data.items.map((p) => (
          <div key={p.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
            <div className="r-item__title">{permitType(p.type)} <Badge tone={permitTone(p.status)}>{permitStatus(p.status)}</Badge></div>
            <div className="r-item__meta">{p.unit_name} · {formatDate(p.date_from)}{p.date_to !== p.date_from && ` – ${formatDate(p.date_to)}`}{p.contractor && ` · ${p.contractor}`}</div>
            <div className="r-item__body">{p.description}{p.reject_reason && <div>Ret gerekçesi: {p.reject_reason}</div>}{p.deposit && <div>Depozito: <Money value={p.deposit} /></div>}</div>
          </div></div>
        ))}
      </div>
    </>
  );
}

function PermitForm({ onDone }: { onDone: () => void }) {
  const home = useSiteGet<Schemas["HomeOut"]>("/resident/home");
  const [f, setF] = useState({ type: "renovation", date_from: todayIso(), date_to: todayIso(), contractor: "", description: "", unit_id: "" });
  const m = useSiteMutation<Record<string, unknown>, Permit>("POST", "/resident/permits", { onSuccess: onDone });
  const units = home.data?.units ?? [];
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ ...f, unit_id: f.unit_id || units[0]?.unit_id, contractor: f.contractor.trim() || null }); }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {units.length > 1 && <Field label="Bölüm">{(p) => <select {...p} className="field__input" value={f.unit_id || units[0]!.unit_id} onChange={up("unit_id")}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}</select>}</Field>}
        <Field label="Başvuru" required>{(p) => <select {...p} className="field__input" value={f.type} onChange={up("type")}>{["renovation", "move_in", "move_out"].map((k) => <option key={k} value={k}>{permitType(k)}</option>)}</select>}</Field>
        <div className="grid grid--2">
          <Field label={f.type === "renovation" ? "Başlangıç" : "Tarih"} required error={fieldError(m.error, "date_from")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.date_from} onChange={up("date_from")} />}</Field>
          {f.type === "renovation" && <Field label="Bitiş" required error={fieldError(m.error, "date_to")}>{(p) => <input {...p} className="field__input" type="date" min={f.date_from} value={f.date_to} onChange={up("date_to")} />}</Field>}
        </div>
        <Field label={f.type === "renovation" ? "Çalışacak firma" : "Nakliye firması"} hint="İsteğe bağlı">{(p) => <input {...p} className="field__input" maxLength={80} value={f.contractor} onChange={up("contractor")} />}</Field>
        <Field label={f.type === "renovation" ? "Yapılacak iş" : "Açıklama"} required error={fieldError(m.error, "description")}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={500} value={f.description} onChange={up("description")} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Gönder</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

interface ResDepKey { id: string; authorized: { name: string }[]; valid_until: string; status: string; handed_to: string | null; handed_at: string | null }
interface ResMeter { meter: { id: string; kind: string; serial: string; unit_label: string }; readings: { id: string; period: string; value: string | null; consumption: string | null; status: string; photo: string | null; reason: string | null }[] }
const DEP_TEXT: Record<string, string> = { requested: "teslim bekleniyor", held: "emanette", returned: "size iade edildi", expired: "süresi doldu" };

/** Emanet ve sayaçlar (OPS-01/05, sakin): anahtar bırakma + yetkili kişiler; sayaç okumaları ve tüketim. */
export function ResidentKeysMetersPage() {
  useDocumentTitle("Emanet ve sayaçlar");
  const keys = useSiteGet<ResDepKey[]>("/resident/deposited-keys");
  const mtr = useSiteGet<ResMeter[]>("/resident/meter-readings");
  const [names, setNames] = useState("");
  const [until, setUntil] = useState(todayIso());
  const add = useSiteMutation<Record<string, unknown>, unknown>("POST", "/resident/deposited-keys", { onSuccess: () => setNames("") });
  return (
    <>
      <div className="section-title">Emanet anahtar</div>
      <p className="small muted">Anahtarınızı yönetime bırakın; yalnız yazdığınız kişilere kimlik kontrolüyle verilir.</p>
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); add.mutate({ authorized: names.split(",").map((n) => ({ name: n.trim() })).filter((a) => a.name), valid_until: until }); }}>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={add.error} />
          <Field label="Kimlere verilebilir" hint="Virgülle ayırın" error={fieldError(add.error, "authorized")}>{(p) => <input {...p} className="field__input" maxLength={200} value={names} onChange={(e) => setNames(e.target.value)} placeholder="ör. Ayşe Yılmaz, Mehmet Kaya" />}</Field>
          <Field label="Geçerlilik" error={fieldError(add.error, "valid_until")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
          <SubmitButton busy={add.isPending} disabled={!names.trim()}>Emanet kaydı oluştur</SubmitButton>
        </div>
      </form>
      {(keys.data ?? []).map((k) => (
        <div key={k.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
          <div className="r-item__title">Emanet anahtar · {k.status === "handed" ? `${k.handed_to} kişisine verildi` : DEP_TEXT[k.status] ?? k.status}</div>
          <div className="r-item__meta">Yetkili: {k.authorized.map((a) => a.name).join(", ")} · {formatDate(k.valid_until)} tarihine kadar</div>
        </div></div>
      ))}
      <div className="section-title">Sayaçlarım</div>
      {mtr.isPending ? <Loading /> : !mtr.data || mtr.data.length === 0 ? <Empty title="Bölümünüze bağlı sayaç yok" /> : mtr.data.map((m) => (
        <div key={m.meter.id} className="card"><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
          <div className="strong">{meterKind(m.meter.kind)} <span className="small muted mono">{m.meter.serial}</span></div>
          {m.readings.length === 0 ? <p className="small muted mb-0">Henüz okuma yok.</p> : m.readings.map((r) => (
            <div key={r.id} className="kv"><span className="kv__k">{r.period}{r.status === "unreadable" && ` · okunamadı${r.reason ? ` (${r.reason})` : ""}`}</span>
              <span className="kv__v">{r.value ? `${Number(r.value).toLocaleString("tr-TR")} ${m.meter.unit_label}` : "—"}{r.consumption && <span className="xs muted"> · tüketim {Number(r.consumption).toLocaleString("tr-TR")}</span>}{r.photo && <img src={r.photo} alt={`${r.period} sayaç fotoğrafı`} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, marginLeft: 6, verticalAlign: "middle" }} />}</span></div>
          ))}
          <p className="xs muted mb-0">Okumaya itirazınız varsa Taleplerim ekranından talep açın.</p>
        </div></div>
      ))}
    </>
  );
}
