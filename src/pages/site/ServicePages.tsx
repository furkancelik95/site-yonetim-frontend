import { Fragment, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CheckCircle2, ClipboardCheck, Hammer, Pencil, Plus, Siren } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, parseMoneyInput } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { CATEGORIES, PRIORITIES, WEEKDAYS_LONG, hourType, permitStatus, permitTone, permitType, requestCategory, requestPriority } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 47, 48, 49, 51, 52'deki şekiller. */
interface DayHours { closed: boolean; open: string; close: string }
interface ReqSettings { categories: Record<string, { hour_type: "24x7" | "business"; resolve_hours: Record<string, number> }>; calendar: DayHours[]; auto_close_days: number; merge_window_hours: number; low_rating_threshold: number }
interface Tpl { id: string; title: string; category: string | null; body: string; is_active: boolean }
interface Tariff { id: string; name: string; unit: string; price: string; is_active: boolean }
interface Outage { id: string; title: string; category: string; location: string | null; public_description: string; status: "open" | "resolved"; request_ids: string[]; created_by: string; created_at: string; resolved_at: string | null; resolution: string | null }
interface Permit { id: string; unit_id: string; unit_name: string; type: string; date_from: string; date_to: string; contractor: string | null; description: string; status: string; reject_reason: string | null; checklist: { item: string; ok: boolean }[]; deposit: string | null; created_by: string; created_at: string; decided_by: string | null; completed_by: string | null; completed_at: string | null }
interface PermitSettings { weekday_hours: string; saturday_hours: string; sunday_allowed: boolean; deposit_amount: string; checklist: string[] }

// ---------------------------------------------------------------- Talep ayarları (47, 48, 51)
/** Talep ayarları (HIZ-03/04, HIZ-02 hazır yanıtlar): kategori × öncelik SLA, çalışma takvimi, hazır yanıtlar, hizmet tarifesi. */
export function RequestSettingsPage() {
  const { site } = useSite();
  const [s, set] = useUrlState({ sekme: "sla" });
  return (
    <div className="stack">
      <PageHead title="Talep ayarları" subtitle="SLA hedefleri, çalışma takvimi, hazır yanıtlar ve ücretli hizmet tarifesi." actions={<Link className="btn" to={`/s/${site.slug}/talepler`}>Taleplere dön</Link>} />
      <div className="row" role="tablist" aria-label="Talep ayarları" style={{ gap: "var(--s-2)" }}>
        {[["sla", "SLA ve takvim"], ["yanit", "Hazır yanıtlar"], ["tarife", "Hizmet tarifesi"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k! })}>{l}</button>)}
      </div>
      {s.sekme === "yanit" ? <Templates /> : s.sekme === "tarife" ? <Tariffs /> : <SlaSettings />}
    </div>
  );
}

function SlaSettings() {
  const q = useSiteGet<ReqSettings>("/settings/requests");
  const m = useSiteMutation<ReqSettings, ReqSettings>("PUT", "/settings/requests");
  const [s, setS] = useState<ReqSettings | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  if (!s) return q.isError ? <ErrorState error={q.error} /> : <Loading />;
  const dirty = JSON.stringify(s) !== JSON.stringify(q.data);
  const setHours = (c: string, p: string, v: string) => setS({ ...s, categories: { ...s.categories, [c]: { ...s.categories[c]!, resolve_hours: { ...s.categories[c]!.resolve_hours, [p]: Number(v.replace(/\D/g, "").slice(0, 4)) } } } });
  const setDay = (i: number, patch: Partial<DayHours>) => setS({ ...s, calendar: s.calendar.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  function submit(e: FormEvent) { e.preventDefault(); if (s) m.mutate(s); }
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <div className="card">
        <div className="card__head"><span className="card__title">Çözüm süresi hedefleri (saat)</span><span className="card__meta ml-auto">çalışma saati tipinde mesai dışında sayaç durur</span></div>
        <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Kategori ve öncelik bazında SLA</caption>
          <thead><tr><th scope="col">Kategori</th><th scope="col">Saat tipi</th>{PRIORITIES.map((p) => <th key={p} scope="col" className="right">{requestPriority(p)}</th>)}</tr></thead>
          <tbody>{CATEGORIES.map((c) => { const v = s.categories[c]; if (!v) return null; return (
            <tr key={c}>
              <td className="cell-main">{requestCategory(c)}</td>
              <td><select className="field__input" style={{ minHeight: 36 }} aria-label={`${requestCategory(c)} saat tipi`} value={v.hour_type} onChange={(e) => setS({ ...s, categories: { ...s.categories, [c]: { ...v, hour_type: e.target.value as "24x7" } } })}><option value="24x7">{hourType("24x7")}</option><option value="business">{hourType("business")}</option></select></td>
              {PRIORITIES.map((p) => <td key={p} className="right"><input className="field__input" style={{ width: "5rem", minHeight: 36, textAlign: "right" }} inputMode="numeric" aria-label={`${requestCategory(c)} ${requestPriority(p)} saat`} value={v.resolve_hours[p] ?? ""} onChange={(e) => setHours(c, p, e.target.value)} /></td>)}
            </tr>
          ); })}</tbody>
        </table></div></div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Çalışma takvimi</span><span className="card__meta ml-auto">resmî tatiller platform takviminden gelecek (S-03)</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
          {fieldError(m.error, "calendar") && <span className="field__error" role="alert">{fieldError(m.error, "calendar")}</span>}
          {s.calendar.map((d, i) => (
            <div key={i} className="row" style={{ gap: "var(--s-3)", alignItems: "center" }}>
              <span style={{ width: "7rem" }} className="strong small">{WEEKDAYS_LONG[i]}</span>
              <label className="check"><input type="checkbox" checked={!d.closed} onChange={(e) => setDay(i, { closed: !e.target.checked })} /><span>Açık</span></label>
              {!d.closed && <><input className="field__input" type="time" style={{ width: "8rem", minHeight: 36 }} aria-label={`${WEEKDAYS_LONG[i]} açılış`} value={d.open} onChange={(e) => setDay(i, { open: e.target.value })} /><span aria-hidden="true">–</span><input className="field__input" type="time" style={{ width: "8rem", minHeight: 36 }} aria-label={`${WEEKDAYS_LONG[i]} kapanış`} value={d.close} onChange={(e) => setDay(i, { close: e.target.value })} /></>}
            </div>
          ))}
        </div>
      </div>
      <div className="card"><div className="card__body grid grid--kpi">
        <Field label="Otomatik kapanış (gün)" hint="Çözüldü talebe sakin yanıt vermezse" error={fieldError(m.error, "auto_close_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={s.auto_close_days} onChange={(e) => setS({ ...s, auto_close_days: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) })} />}</Field>
        <Field label="Birleştirme penceresi (saat)" hint="Aynı kategori ve konumda öneri" error={fieldError(m.error, "merge_window_hours")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={s.merge_window_hours} onChange={(e) => setS({ ...s, merge_window_hours: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) })} />}</Field>
        <Field label="Düşük puan eşiği" hint="Bu puan ve altı yöneticiye bildirilir">{(p) => <select {...p} className="field__input" value={s.low_rating_threshold} onChange={(e) => setS({ ...s, low_rating_threshold: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>}</Field>
      </div></div>
      <div className="row"><SubmitButton busy={m.isPending} disabled={!dirty}>Kaydet</SubmitButton><span className="small muted">Açık talepler açıldıkları kuralla devam eder.</span></div>
    </form>
  );
}

function Templates() {
  const q = useSiteGet<Tpl[]>("/reply-templates");
  const [editing, setEditing] = useState<Tpl | "new" | null>(null);
  return (
    <>
      <div className="row"><button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Şablon ekle</button><span className="small muted">Değişkenler: {"{{sakin.ad}}"}, {"{{talep.no}}"}, {"{{talep.konu}}"}</span></div>
      {editing && <TplForm t={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="card"><div className="card__body card__body--flush">
        {!q.data ? <Loading /> : q.data.length === 0 ? <Empty title="Şablon yok" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Hazır yanıtlar</caption>
            <thead><tr><th scope="col">Şablon</th><th scope="col">Kategori</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id} style={!t.is_active ? { opacity: 0.6 } : undefined}><td><div className="cell-main">{t.title}</div><div className="cell-sub">{t.body}</div></td><td className="small">{t.category ? requestCategory(t.category) : "Tümü"}</td><td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${t.title} düzenle`} onClick={() => setEditing(t)}><Pencil aria-hidden="true" /></button></td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function TplForm({ t, onDone }: { t: Tpl | null; onDone: () => void }) {
  const [f, setF] = useState({ title: t?.title ?? "", category: t?.category ?? "", body: t?.body ?? "", is_active: t?.is_active ?? true });
  const m = useSiteMutation<Record<string, unknown>, Tpl>(t ? "PATCH" : "POST", t ? `/reply-templates/${t.id}` : "/reply-templates", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, category: f.category || null }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Başlık" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={60} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Kategori">{(p) => <select {...p} className="field__input" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}><option value="">Tümü</option>{CATEGORIES.map((c) => <option key={c} value={c}>{requestCategory(c)}</option>)}</select>}</Field>
        </div>
        <Field label="Metin" required error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={1000} value={f.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} />}</Field>
        {t && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Etkin</span></label>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>{t ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function Tariffs() {
  const q = useSiteGet<Tariff[]>("/service-tariffs");
  const [f, setF] = useState({ name: "", unit: "saat", price: "" });
  const m = useSiteMutation<Record<string, unknown>, Tariff>("POST", "/service-tariffs", { onSuccess: () => setF({ name: "", unit: "saat", price: "" }) });
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Hizmet tarifesi</span><span className="card__meta ml-auto">teknik ekip teklif hazırlarken kullanır</span></div>
      <form className="card__body grid grid--kpi" style={{ alignItems: "end", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, price: parseMoneyInput(f.price) }); }}>
        <Field label="Kalem" error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. İşçilik" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
        <Field label="Birim" error={fieldError(m.error, "unit")}>{(p) => <input {...p} className="field__input" maxLength={20} value={f.unit} onChange={(e) => setF((x) => ({ ...x, unit: e.target.value }))} />}</Field>
        <Field label="Birim fiyat (₺)" error={fieldError(m.error, "price")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} />}</Field>
        <div><SubmitButton busy={m.isPending} disabled={!f.name.trim() || !f.price}>Ekle</SubmitButton></div>
      </form>
      <div className="card__body card__body--flush">
        {!q.data || q.data.length === 0 ? <Empty title="Tarife kalemi yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Hizmet tarifesi</caption>
            <thead><tr><th scope="col">Kalem</th><th scope="col">Birim</th><th scope="col" className="right">Fiyat</th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id}><td className="cell-main">{t.name}</td><td className="small">{t.unit}</td><td className="right"><Money value={t.price} /></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
      <div className="card__foot small muted">Tarife değişikliğinin onay kuralına bağlanması K21. Ücret, iş kapanınca dönem dışı ücret olarak cariye yansır.</div>
    </div>
  );
}

// ---------------------------------------------------------------- Ana olaylar (49)
/** Ana olaylar (HIZ-02): aynı arızaya gelen talepleri toplar; çözülünce bağlı talepler kapanır, her sakine bildirim. */
export function OutagesPage() {
  const { site, can } = useSite();
  const q = useSiteGet<Outage[]>("/outages");
  return (
    <div className="stack">
      <PageHead title="Ana olaylar" subtitle="Aynı arızadan gelen talepler tek olayda; sakinler birbirinin talebini değil olayın genel açıklamasını görür." actions={<Link className="btn" to={`/s/${site.slug}/talepler`}>Taleplere dön</Link>} />
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Ana olay yok" icon={<Siren aria-hidden="true" />}>Talep ayrıntısındaki birleştirme önerisinden oluşturulur.</Empty> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Ana olaylar</caption>
            <thead><tr><th scope="col">Olay</th><th scope="col" className="right">Talep</th><th scope="col">Durum</th>{can(P.requestsAssign) && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((o) => (
              <tr key={o.id}>
                <td><div className="cell-main">{o.title}</div><div className="cell-sub">{requestCategory(o.category)}{o.location && ` · ${o.location}`} · {o.created_by}, {formatDateTime(o.created_at)}</div><div className="small">{o.public_description}</div>{o.resolution && <div className="cell-sub">Çözüm: {o.resolution}</div>}</td>
                <td className="right num">{o.request_ids.length}</td>
                <td>{o.status === "open" ? <Badge tone="warn">Açık</Badge> : <Badge tone="ok">Çözüldü</Badge>}</td>
                {can(P.requestsAssign) && <td className="right">{o.status === "open" && <ResolveOutage o={o} />}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
      <p className="small muted">Bağlı talepler: <Link to={`/s/${site.slug}/talepler`}>Talepler</Link> listesinde.</p>
    </div>
  );
}

function ResolveOutage({ o }: { o: Outage }) {
  const [text, setText] = useState("");
  const m = useSiteMutation<{ resolution: string }, Outage>("POST", `/outages/${o.id}/resolve`);
  return (
    <ConfirmButton className="btn btn--primary btn--sm" title={`${o.title} — çözüldü`} confirmLabel="Çözüldü olarak kapat"
      body={<div className="field"><label className="field__label" htmlFor={`or-${o.id}`}>Çözüm açıklaması *</label><textarea id={`or-${o.id}`} className="field__input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /><span className="field__hint">{o.request_ids.length} bağlı talep "çözüldü" olur ve her sakine bu açıklama gider.</span></div>}
      onConfirm={() => m.mutateAsync({ resolution: text })}><CheckCircle2 aria-hidden="true" /> Çözüldü</ConfirmButton>
  );
}

// ---------------------------------------------------------------- Tadilat ve taşınma (52)
/** Tadilat ve taşınma izinleri (HIZ-05): başvuru → onay/ret → kontrol listesiyle tamamlama; depozito ve iadesi. */
export function PermitsPage() {
  const { can } = useSite();
  const manage = can(P.requestsAssign);
  const [s, set] = useUrlState({ durum: "pending" });
  const q = useSiteGet<Permit[]>("/permits", { status: s.durum || undefined });
  const ps = useSiteGet<PermitSettings>("/settings/permits");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHead title="Tadilat ve taşınma" subtitle="Sakinlerin tadilat ve taşınma başvuruları; çalışma saatleri, kontrol listesi ve depozito." />
      {manage && <PermitRules />}
      <div className="row" role="tablist" aria-label="Durum" style={{ gap: "var(--s-2)" }}>
        {[["pending", "Onay bekleyen"], ["approved", "Onaylı"], ["completed", "Tamamlanan"], ["rejected", "Reddedilen"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.durum === k} className={`btn btn--sm${s.durum === k ? " btn--primary" : ""}`} onClick={() => set({ durum: k! })}>{l}</button>)}
      </div>
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Başvuru yok" icon={<Hammer aria-hidden="true" />}>Sakinler uygulamadaki "Tadilat ve taşınma" ekranından başvurur.</Empty> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Tadilat ve taşınma başvuruları</caption>
            <thead><tr><th scope="col">Bölüm</th><th scope="col">Başvuru</th><th scope="col">Tarih</th><th scope="col">Durum</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td className="cell-main">{p.unit_name}<div className="cell-sub">{p.created_by}</div></td>
                  <td className="small">{permitType(p.type)}{p.contractor && ` · ${p.contractor}`}<div className="cell-sub">{p.description}</div></td>
                  <td className="small nowrap">{formatDate(p.date_from)}{p.date_to !== p.date_from && ` – ${formatDate(p.date_to)}`}</td>
                  <td><Badge tone={permitTone(p.status)}>{permitStatus(p.status)}</Badge>{p.deposit && <div className="cell-sub">Depozito <Money value={p.deposit} /></div>}{p.reject_reason && <div className="cell-sub">{p.reject_reason}</div>}</td>
                  {manage && <td className="right nowrap"><PermitActions p={p} onComplete={() => setOpen((x) => (x === p.id ? null : p.id))} /></td>}
                </tr>
                {open === p.id && <tr><td colSpan={5}><CompletePermit p={p} checklist={ps.data?.checklist ?? []} onDone={() => setOpen(null)} /></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}

function PermitActions({ p, onComplete }: { p: Permit; onComplete: () => void }) {
  const [reason, setReason] = useState("");
  const approve = useSiteMutation<Record<string, never>, Permit>("POST", `/permits/${p.id}/approve`);
  const reject = useSiteMutation<{ reason: string }, Permit>("POST", `/permits/${p.id}/reject`);
  if (p.status === "pending") return <><button className="btn btn--sm btn--primary" type="button" disabled={approve.isPending} onClick={() => approve.mutate({})}>Onayla</button>{" "}<ConfirmButton className="btn btn--ghost btn--sm" danger title="Başvuruyu reddet" confirmLabel="Reddet" body={<div className="field"><label className="field__label" htmlFor={`pr-${p.id}`}>Gerekçe *</label><input id={`pr-${p.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} onConfirm={() => reject.mutateAsync({ reason })}>Reddet</ConfirmButton></>;
  if (p.status === "approved") return <button className="btn btn--sm" type="button" onClick={onComplete}><ClipboardCheck aria-hidden="true" /> Tamamla</button>;
  return null;
}

function CompletePermit({ p, checklist, onDone }: { p: Permit; checklist: string[]; onDone: () => void }) {
  const items = p.type === "move_out" ? ["Anahtar ve kartlar teslim alındı", "Asansör ve koridorda hasar yok", "Sayaçlar okundu"] : checklist;
  const [ok, setOk] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i, true])));
  const [refund, setRefund] = useState(true);
  const m = useSiteMutation<Record<string, unknown>, Permit>("POST", `/permits/${p.id}/complete`, { onSuccess: onDone });
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ checklist: items.map((i) => ({ item: i, ok: !!ok[i] })), refund_deposit: !!p.deposit && refund }); }}>
      <FormError error={m.error} />
      {p.type === "move_in" ? <p className="small mb-0">Giriş taşınmasında kontrol listesi gerekmez.</p> : items.map((i) => <label key={i} className="check"><input type="checkbox" checked={!!ok[i]} onChange={(e) => setOk((x) => ({ ...x, [i]: e.target.checked }))} /><span>{i}</span></label>)}
      {p.deposit && <label className="check"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /><span>Depozitoyu iade et (ters kayıt)</span></label>}
      {p.type === "move_out" && <p className="small muted mb-0">Çıkışta bölümün açık borçlarını kontrol edin; ilişkinin bitiş tarihini bölüm kartından girin.</p>}
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Tamamla</SubmitButton><button type="button" className="btn btn--ghost" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function PermitRules() {
  const q = useSiteGet<PermitSettings>("/settings/permits");
  const m = useSiteMutation<PermitSettings, PermitSettings>("PUT", "/settings/permits");
  const [s, setS] = useState<PermitSettings | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  if (!s) return null;
  return (
    <details className="card">
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Tadilat kuralları</span><span className="card__meta ml-auto">hafta içi {q.data?.weekday_hours} · cumartesi {q.data?.saturday_hours || "yasak"} · pazar {q.data?.sunday_allowed ? "serbest" : "yasak"}</span></summary>
      <form className="card__body stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...s, deposit_amount: parseMoneyInput(s.deposit_amount) ?? "0" }); }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Hafta içi saatler" hint="SS:DD-SS:DD" error={fieldError(m.error, "weekday_hours")}>{(p) => <input {...p} className="field__input mono" value={s.weekday_hours} onChange={(e) => setS({ ...s, weekday_hours: e.target.value })} />}</Field>
          <Field label="Cumartesi" hint="Boş: yasak" error={fieldError(m.error, "saturday_hours")}>{(p) => <input {...p} className="field__input mono" value={s.saturday_hours} onChange={(e) => setS({ ...s, saturday_hours: e.target.value })} />}</Field>
          <Field label="Depozito (₺)" hint="0: alınmaz; dönem dışı ücret olarak yazılır" error={fieldError(m.error, "deposit_amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={s.deposit_amount} onChange={(e) => setS({ ...s, deposit_amount: e.target.value })} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={s.sunday_allowed} onChange={(e) => setS({ ...s, sunday_allowed: e.target.checked })} /><span>Pazar günü çalışılabilir</span></label>
        <Field label="Tamamlanma kontrol listesi" hint="Her satıra bir madde">{(p) => <textarea {...p} className="field__input" rows={4} value={s.checklist.join("\n")} onChange={(e) => setS({ ...s, checklist: e.target.value.split("\n") })} />}</Field>
        <div><SubmitButton busy={m.isPending}>Kuralları kaydet</SubmitButton></div>
      </form>
    </details>
  );
}
