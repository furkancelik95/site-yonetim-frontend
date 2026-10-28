import { useState, type FormEvent } from "react";
import { Gauge, Hammer, KeyRound, Star } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { AuthImage } from "../../components/AuthImage";
import { ResidentHead, type ResidentStat } from "../../components/ResidentHead";
import { useSite } from "../../site/SiteContext";
import type { Schemas } from "../../api/types";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, Money, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, todayIso } from "../../lib/format";
import { meterKind, permitStatus, permitTone, permitType } from "../../lib/labels";

type Req = Schemas["RequestOut"];
type Quote = Schemas["ServiceQuoteOut"];
type Permit = Schemas["PermitOut"];

/** Sakinin talep kartı ekleri (istek 49–51): ana olay açıklaması, teklif onayı, kapanış onayı ve puan, iptal. */
export function RequestExtrasBlock({ r }: { r: Req }) {
  const { outage, quote, feedback } = r;
  // "Devam ediyor" denip yeniden açılan talepte son değerlendirme yalnız bilgi; yeni çözümde yeniden onay istenir.
  const confirmed = feedback?.solved && r.status === "closed";
  return (
    <div className="stack" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
      {outage && <div className="small" style={{ background: "var(--bg-sunken)", borderRadius: 8, padding: "var(--s-2)" }}><strong>{outage.title}</strong> {outage.status === "resolved" ? <Badge tone="ok">Giderildi</Badge> : <Badge tone="warn">Üzerinde çalışılıyor</Badge>}<div>{outage.public_description}</div></div>}
      {quote && (quote.status === "pending" || quote.status === "extra_pending") && <QuoteDecision q={quote} />}
      {quote && !["pending", "extra_pending"].includes(quote.status) && <div className="small">Ücretli hizmet: {quote.status_label}{quote.billed_total && <> · <Money value={quote.billed_total} /></>}</div>}
      {r.status === "resolved" && <ConfirmForm id={r.id} autoClose={r.auto_close_at} />}
      {confirmed && <div className="small"><Star aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px" }} /> Değerlendirmeniz: {feedback.score}/5</div>}
      {feedback && !feedback.solved && r.status !== "resolved" && <div className="small muted">Sorunun devam ettiğini bildirdiniz; talep yeniden ele alınıyor.</div>}
      {r.can_cancel && <CancelRequest r={r} />}
    </div>
  );
}

function CancelRequest({ r }: { r: Req }) {
  const [reason, setReason] = useState("");
  const m = useSiteMutation<{ reason: string | null }, unknown>("POST", `/resident/requests/${r.id}/cancel`);
  return (
    <div><ConfirmButton className="btn btn--ghost btn--sm" danger title={`#${r.number} talebini iptal et`} confirmLabel="İptal et"
      body={<div className="field"><label className="field__label" htmlFor={`rc-${r.id}`}>Neden vazgeçtiniz? (isteğe bağlı)</label><input id={`rc-${r.id}`} className="field__input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /><span className="field__hint">Üzerinde çalışılmaya başlanan talep iptal edilemez.</span></div>}
      onConfirm={() => m.mutateAsync({ reason: reason.trim() || null })}>Talebi iptal et</ConfirmButton></div>
  );
}

function QuoteDecision({ q }: { q: Quote }) {
  const m = useSiteMutation<{ decision: string }, Quote>("POST", `/resident/quotes/${q.id}/decision`);
  const extra = q.status === "extra_pending";
  return (
    <div className="card" style={{ borderColor: "var(--warn-solid, #d97706)" }}><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
      <div className="strong small">{extra ? "Ek tutar onayı" : "Ücretli hizmet teklifi"}</div>
      {q.lines.map((l, i) => <div key={i} className="kv"><span className="kv__k">{l.description} · {Number(l.qty).toLocaleString("tr-TR")} × {formatMoney(l.unit_price)}</span><span className="kv__v"><Money value={l.total} /></span></div>)}
      <div className="kv"><span className="kv__k strong">{extra ? "Teklif" : "Toplam"}</span><span className="kv__v strong"><Money value={q.total} /></span></div>
      {extra && q.actual_total && <div className="kv"><span className="kv__k strong">Gerçekleşen</span><span className="kv__v strong"><Money value={q.actual_total} /></span></div>}
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
      <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}><SubmitButton busy={m.isPending} className="btn btn--sm btn--primary" disabled={solved && score === 0}>Gönder</SubmitButton>{autoClose && <span className="xs muted">Yanıt vermezseniz talep {formatDateTime(autoClose)} itibarıyla kapanır.</span>}</div>
    </form>
  );
}

/** Tadilat ve taşınma (HIZ-05, sakin): başvuru ve durum; çalışma saatleri kuralları görünür. */
export function ResidentPermitsPage() {
  useDocumentTitle("Tadilat ve taşınma");
  const q = useSiteGet<Schemas["MyPermitsOut"]>("/resident/permits");
  const [adding, setAdding] = useState(false);
  const head = (stats?: ResidentStat[]) => <ResidentHead icon={<Hammer />} title="Tadilat ve taşınma" sub="Tadilat, taşınma ve taşınıp çıkma için yönetime izin başvurusu yapın; onay durumunu buradan izleyin." stats={stats} />;
  if (q.isPending) return <>{head()}<Loading /></>;
  if (q.isError) return <>{head()}<ErrorState error={q.error} /></>;
  const r = q.data.rules;
  const waiting = q.data.items.filter((p) => p.status === "pending").length;
  return (
    <>
      {head([
        { label: "Başvuru", value: q.data.items.length },
        { label: "Onay bekleyen", value: waiting, tone: waiting ? "warn" : undefined },
        { label: "Onaylanan", value: q.data.items.filter((p) => p.status === "approved").length },
      ])}
      <div className="r-split">
        <div className="r-split__col">
          {adding ? <PermitForm onDone={() => setAdding(false)} /> : <button className="btn btn--primary" style={{ width: "100%" }} type="button" onClick={() => setAdding(true)}><Hammer aria-hidden="true" /> Başvuru yap</button>}
          <div className="card"><div className="card__head"><span className="card__title">Site kuralları</span></div>
            <div className="card__body">
              <div className="kv"><span className="kv__k">Hafta içi</span><span className="kv__v">{r.weekday_hours}</span></div>
              <div className="kv"><span className="kv__k">Cumartesi</span><span className="kv__v">{r.saturday_hours || "Yasak"}</span></div>
              <div className="kv"><span className="kv__k">Pazar</span><span className="kv__v">{r.sunday_allowed ? "Serbest" : "Yasak"}</span></div>
              {Number(r.deposit_amount) > 0 && <div className="kv"><span className="kv__k">Tadilat depozitosu</span><span className="kv__v">{formatMoney(r.deposit_amount)} · iş bitince iade</span></div>}
            </div>
          </div>
        </div>
        <div className="r-split__col">
          <div className="section-title">Başvurularım</div>
          {q.data.items.length === 0 ? <Empty title="Başvurunuz yok" icon={<Hammer aria-hidden="true" />}>Yaptığınız başvurular ve onay durumları burada görünür.</Empty> : q.data.items.map((p) => (
            <div key={p.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
              <div className="r-item__title">{permitType(p.type)} <Badge tone={permitTone(p.status)}>{permitStatus(p.status)}</Badge></div>
              <div className="r-item__meta">{p.unit_name} · {formatDate(p.date_from)}{p.date_to !== p.date_from && ` – ${formatDate(p.date_to)}`}{p.contractor && ` · ${p.contractor}`}</div>
              <div className="r-item__body">{p.description}{p.reject_reason && <div>Ret gerekçesi: {p.reject_reason}</div>}{p.deposit && <div>Depozito: <Money value={p.deposit} />{p.deposit_refunded && " (iade edildi)"}</div>}</div>
            </div></div>
          ))}
        </div>
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
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ ...f, unit_id: f.unit_id || units[0]?.unit_id || null, date_to: f.type === "renovation" ? f.date_to : null, contractor: f.contractor.trim() || null }); }
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

type ResDepKey = Schemas["DepositedKeyOut"];
type ResMeter = Schemas["ResidentMeterOut"];
const DEP_TEXT: Record<string, string> = { requested: "teslim bekleniyor", held: "emanette", returned: "size iade edildi", expired: "süresi doldu" };

/** Emanet ve sayaçlar (OPS-01/05, sakin): anahtar bırakma + yetkili kişiler; sayaç okumaları ve tüketim. */
export function ResidentKeysMetersPage() {
  useDocumentTitle("Emanet ve sayaçlar");
  const { site } = useSite();
  const keys = useSiteGet<ResDepKey[]>("/resident/deposited-keys");
  const mtr = useSiteGet<ResMeter[]>("/resident/meter-readings");
  const [names, setNames] = useState("");
  const [until, setUntil] = useState(todayIso());
  const add = useSiteMutation<Record<string, unknown>, unknown>("POST", "/resident/deposited-keys", { onSuccess: () => setNames("") });
  const held = (keys.data ?? []).filter((k) => k.status === "held").length;
  const anomalies = (mtr.data ?? []).reduce((n, m) => n + m.readings.filter((r) => r.status === "anomaly").length, 0);
  return (
    <>
      <ResidentHead icon={<KeyRound />} tone="teal" title="Emanet ve sayaçlar" sub="Anahtarınızı yönetime bırakın; yalnız yazdığınız kişilere kimlik kontrolüyle verilir. Sayaç okumalarınızı ve tüketiminizi izleyin."
        stats={keys.data && mtr.data && [
          { label: "Emanetteki anahtar", value: held },
          { label: "Sayaç", value: mtr.data.length },
          { label: "Onay bekleyen okuma", value: anomalies, tone: anomalies ? "warn" : undefined },
        ]} />
      <div className="r-split">
      <div className="r-split__col">
      <div className="section-title">Emanet anahtar</div>
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
          <div className="r-item__title">Emanet anahtar · {k.unit_name} · {k.status === "handed" ? `${k.handed_to} kişisine verildi` : DEP_TEXT[k.status] ?? k.status}</div>
          <div className="r-item__meta">Yetkili: {k.authorized.map((a) => a.name).join(", ")} · {formatDate(k.valid_until)} tarihine kadar</div>
        </div></div>
      ))}
      </div>
      <div className="r-split__col">
      <div className="section-title">Sayaçlarım</div>
      {mtr.isPending ? <Loading /> : !mtr.data || mtr.data.length === 0 ? <Empty title="Bölümünüze bağlı sayaç yok" icon={<Gauge aria-hidden="true" />} /> : mtr.data.map((m) => (
        <div key={m.meter.id} className="card"><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
          <div className="strong">{meterKind(m.meter.kind)} <span className="small muted mono">{m.meter.serial}</span></div>
          {m.readings.length === 0 ? <p className="small muted mb-0">Henüz okuma yok.</p> : m.readings.map((r) => (
            <div key={r.id} className="kv"><span className="kv__k">{r.period}{r.status === "anomaly" && " · onay bekliyor"}{r.status === "unreadable" && ` · okunamadı${r.reason ? ` (${r.reason})` : ""}`}</span>
              <span className="kv__v">{r.value ? `${Number(r.value).toLocaleString("tr-TR")} ${m.meter.unit_label}` : "—"}{r.consumption && <span className="xs muted"> · tüketim {Number(r.consumption).toLocaleString("tr-TR")}</span>}{r.photo_id && <span style={{ marginLeft: 6 }}><AuthImage path={`/sites/${site.slug}/resident/meter-readings/${r.id}/photo`} alt={`${r.period} sayaç fotoğrafı`} size={32} /></span>}</span></div>
          ))}
          <p className="xs muted mb-0">Okumaya itirazınız varsa Taleplerim ekranından talep açın.</p>
        </div></div>
      ))}
      </div>
      </div>
    </>
  );
}
