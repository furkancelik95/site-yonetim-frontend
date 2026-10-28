import { Fragment, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CalendarDays, CheckCircle2, ClipboardCheck, Hammer, Hourglass, Layers, MessageSquareText, Pencil, Plus, Receipt, Settings2, Siren, Tags, Timer, Wallet } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, formatMoneyShort, parseMoneyInput } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { PRIORITIES, WEEKDAYS_LONG, hourType, permitStatus, permitTone, permitType, requestPriority } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { categoryName, useRequestCategories, type RequestCategory } from "./requestCategories";

type ReqSettings = Schemas["RequestSettingsOut"];
type DayHours = ReqSettings["calendar"][number];
type Tpl = Schemas["ReplyTemplateOut"];
type Tariff = Schemas["ServiceTariffOut"];
type Outage = Schemas["OutageOut"];
type Permit = Schemas["PermitOut"];
type PermitRules = Schemas["PermitRulesOut"];
type Hours = Schemas["ResolveHours"];
type Department = { id: string; name: string; is_active: boolean };

// ---------------------------------------------------------------- Talep ayarları (47, 48, 51; D-26)
/** Talep ayarları (HIZ-03/04, HIZ-02 hazır yanıtlar): kategoriler, SLA ve çalışma takvimi, hazır yanıtlar, hizmet tarifesi. */
export function RequestSettingsPage() {
  const { site } = useSite();
  const [s, set] = useUrlState({ sekme: "sla" });
  const st = useSiteGet<ReqSettings>("/settings/requests");
  const cats = useSiteGet<RequestCategory[]>("/request-categories");
  const tpl = useSiteGet<Tpl[]>("/reply-templates");
  const tar = useSiteGet<Tariff[]>("/service-tariffs");
  const activeCats = cats.data?.filter((c) => c.is_active) ?? [];
  const allDay = activeCats.filter((c) => c.hour_type === "24x7").length;
  const openDays = st.data ? st.data.calendar.filter((d) => !d.closed).length : 0;
  return (
    <div className="stack">
      <PageHead title="Talep ayarları" subtitle="Kategoriler, SLA hedefleri, çalışma takvimi, hazır yanıtlar ve ücretli hizmet tarifesi." actions={<Link className="btn" to={`/s/${site.slug}/talepler`}>Taleplere dön</Link>}>
        <div className="tabs" role="tablist" aria-label="Talep ayarları">
          {[["sla", "SLA ve takvim"], ["kategori", "Kategoriler"], ["yanit", "Hazır yanıtlar"], ["tarife", "Hizmet tarifesi"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className="tabs__tab" onClick={() => set({ sekme: k! })}>{l}</button>)}
        </div>
      </PageHead>
      {st.data && cats.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Kullanımdaki kategori" icon={<Tags aria-hidden="true" />} value={activeCats.length} note={`${allDay} tanesi 7/24, ${activeCats.length - allDay} tanesi mesai`} />
          <Kpi label="Çalışma günü" icon={<CalendarDays aria-hidden="true" />} value={`${openDays} / 7`} note="haftalık çalışma takvimi" />
          <Kpi label="Hazır yanıt" icon={<MessageSquareText aria-hidden="true" />} value={tpl.data ? tpl.data.filter((x) => x.is_active).length : "…"} note={tpl.data ? `${tpl.data.length} şablondan etkin olan` : undefined} />
          <Kpi label="Tarife kalemi" icon={<Receipt aria-hidden="true" />} value={tar.data ? tar.data.filter((x) => x.is_active).length : "…"} note="ücretli hizmet teklifinde" />
        </div>
      ) : !st.isError && !cats.isError && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {s.sekme === "yanit" ? <Templates /> : s.sekme === "tarife" ? <Tariffs /> : s.sekme === "kategori" ? <Categories /> : <SlaSettings />}
    </div>
  );
}

function SlaSettings() {
  const { can } = useSite();
  const edit = can(P.requestsSettings);
  const categories = useRequestCategories();
  const q = useSiteGet<ReqSettings>("/settings/requests");
  const m = useSiteMutation<ReqSettings, ReqSettings>("PUT", "/settings/requests");
  const [s, setS] = useState<ReqSettings | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  if (!s) return q.isError ? <ErrorState error={q.error} /> : <Loading />;
  const dirty = JSON.stringify(s) !== JSON.stringify(q.data);
  const keys = [...categories.map((c) => c.key).filter((k) => s.categories[k]), ...Object.keys(s.categories).filter((k) => !categories.some((c) => c.key === k))];
  const setHours = (c: string, p: keyof Hours, v: string) => setS({ ...s, categories: { ...s.categories, [c]: { ...s.categories[c]!, resolve_hours: { ...s.categories[c]!.resolve_hours, [p]: Number(v.replace(/\D/g, "").slice(0, 4)) } } } });
  const setDay = (i: number, patch: Partial<DayHours>) => setS({ ...s, calendar: s.calendar.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  function submit(e: FormEvent) { e.preventDefault(); if (s) m.mutate(s); }
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <fieldset disabled={!edit} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><Timer aria-hidden="true" /></span><span className="card__title">Çözüm süresi hedefleri (saat)</span><span className="card__meta ml-auto">çalışma saati tipinde mesai dışında sayaç durur</span></div>
          <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Kategori ve öncelik bazında SLA</caption>
            <thead><tr><th scope="col">Kategori</th><th scope="col">Saat tipi</th>{PRIORITIES.map((p) => <th key={p} scope="col" className="right">{requestPriority(p)}</th>)}</tr></thead>
            <tbody>{keys.map((c) => { const v = s.categories[c]!; const name = categoryName(categories, c); return (
              <tr key={c}>
                <td className="cell-main">{name}</td>
                <td><select className="field__input" style={{ minHeight: 36 }} aria-label={`${name} saat tipi`} value={v.hour_type} onChange={(e) => setS({ ...s, categories: { ...s.categories, [c]: { ...v, hour_type: e.target.value as "24x7" } } })}><option value="24x7">{hourType("24x7")}</option><option value="business">{hourType("business")}</option></select></td>
                {PRIORITIES.map((p) => <td key={p} className="right"><input className="field__input" style={{ width: "5rem", minHeight: 36, textAlign: "right" }} inputMode="numeric" aria-label={`${name} ${requestPriority(p)} saat`} aria-invalid={fieldError(m.error, `categories.${c}.${p}`) ? true : undefined} title={fieldError(m.error, `categories.${c}.${p}`)} value={v.resolve_hours[p as keyof Hours] ?? ""} onChange={(e) => setHours(c, p as keyof Hours, e.target.value)} /></td>)}
              </tr>
            ); })}</tbody>
          </table></div></div>
        </div>
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><CalendarDays aria-hidden="true" /></span><span className="card__title">Çalışma takvimi</span><span className="card__meta ml-auto">resmî tatiller platform takviminden gelecek (S-03)</span></div>
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
          <Field label="Düşük puan eşiği" hint="Bu puan ve altı yöneticiye bildirilir" error={fieldError(m.error, "low_rating_threshold")}>{(p) => <select {...p} className="field__input" value={s.low_rating_threshold} onChange={(e) => setS({ ...s, low_rating_threshold: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select>}</Field>
        </div></div>
      </fieldset>
      {edit && <div className="row"><SubmitButton busy={m.isPending} disabled={!dirty}>Kaydet</SubmitButton><span className="small muted">Açık talepler açıldıkları kuralla devam eder.</span></div>}
    </form>
  );
}

/** Site tanımlı kategoriler (HIZ-03, D-26): ad, saat tipi, varsayılan öncelik, atanacak ekip; silme yok, pasifleştirme var. */
function Categories() {
  const { can } = useSite();
  const q = useSiteGet<RequestCategory[]>("/request-categories");
  const deps = useSiteGet<Department[]>("/departments");
  const [editing, setEditing] = useState<RequestCategory | "new" | null>(null);
  const depName = (id: string | null) => (id ? deps.data?.find((d) => d.id === id)?.name ?? "—" : "—");
  return (
    <>
      {can(P.requestsSettings) && <div className="row"><button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Kategori ekle</button><span className="small muted">Yeni talepler bu kurallarla açılır; açık talepler açıldıkları kuralla devam eder.</span></div>}
      {editing && <CategoryForm c={editing === "new" ? null : editing} departments={deps.data ?? []} onDone={() => setEditing(null)} />}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><Tags aria-hidden="true" /></span><span className="card__title">Talep kategorileri</span>{q.data && <span className="card__meta ml-auto">{q.data.length} kategori</span>}</div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Talep kategorileri</caption>
            <thead><tr><th scope="col">Kategori</th><th scope="col">Saat tipi</th><th scope="col">Varsayılan öncelik</th><th scope="col">Ekip</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((c) => (
              <tr key={c.id} style={!c.is_active ? { opacity: 0.6 } : undefined}>
                <td className="cell-main">{c.name}{!c.is_active && <> <Badge>Pasif</Badge></>}</td>
                <td className="small">{hourType(c.hour_type)}</td>
                <td className="small">{requestPriority(c.default_priority)}</td>
                <td className="small">{depName(c.department_id)}</td>
                <td className="right">{can(P.requestsSettings) && <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${c.name} düzenle`} onClick={() => setEditing(c)}><Pencil aria-hidden="true" /></button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function CategoryForm({ c, departments, onDone }: { c: RequestCategory | null; departments: Department[]; onDone: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? "", hour_type: c?.hour_type ?? "business", default_priority: c?.default_priority ?? "normal", department_id: c?.department_id ?? "", is_active: c?.is_active ?? true, resolve_hours: c?.resolve_hours ?? { low: 168, normal: 72, high: 24, urgent: 4 } });
  const m = useSiteMutation<Record<string, unknown>, RequestCategory>(c ? "PATCH" : "POST", c ? `/request-categories/${c.id}` : "/request-categories", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, department_id: f.department_id || null }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
          <Field label="Saat tipi">{(p) => <select {...p} className="field__input" value={f.hour_type} onChange={(e) => setF((x) => ({ ...x, hour_type: e.target.value as "24x7" }))}><option value="24x7">{hourType("24x7")}</option><option value="business">{hourType("business")}</option></select>}</Field>
          <Field label="Varsayılan öncelik" hint="Sakin talebinde öncelik buradan gelir">{(p) => <select {...p} className="field__input" value={f.default_priority} onChange={(e) => setF((x) => ({ ...x, default_priority: e.target.value as "normal" }))}>{PRIORITIES.map((x) => <option key={x} value={x}>{requestPriority(x)}</option>)}</select>}</Field>
          <Field label="Atanacak ekip" error={fieldError(m.error, "department_id")}>{(p) => <select {...p} className="field__input" value={f.department_id} onChange={(e) => setF((x) => ({ ...x, department_id: e.target.value }))}><option value="">—</option>{departments.filter((d) => d.is_active || d.id === f.department_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}</Field>
        </div>
        <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
          {PRIORITIES.map((p) => <Field key={p} label={`${requestPriority(p)} (saat)`} error={fieldError(m.error, `resolve_hours.${p}`)}>{(pp) => <input {...pp} className="field__input" style={{ width: "6rem" }} inputMode="numeric" value={f.resolve_hours[p as keyof Hours]} onChange={(e) => setF((x) => ({ ...x, resolve_hours: { ...x.resolve_hours, [p]: Number(e.target.value.replace(/\D/g, "").slice(0, 4)) } }))} />}</Field>)}
        </div>
        {c && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Kullanımda (pasif kategoriye yeni talep açılmaz)</span></label>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>{c ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function Templates() {
  const { can } = useSite();
  const categories = useRequestCategories();
  const q = useSiteGet<Tpl[]>("/reply-templates");
  const [editing, setEditing] = useState<Tpl | "new" | null>(null);
  return (
    <>
      <div className="row">{can(P.requestsSettings) && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Şablon ekle</button>}<span className="small muted">Değişkenler: {"{{sakin.ad}}"}, {"{{talep.no}}"}, {"{{talep.konu}}"}</span></div>
      {editing && <TplForm t={editing === "new" ? null : editing} categories={categories} onDone={() => setEditing(null)} />}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><MessageSquareText aria-hidden="true" /></span><span className="card__title">Hazır yanıtlar</span>{q.data && <span className="card__meta ml-auto">{q.data.length} şablon</span>}</div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Şablon yok" icon={<MessageSquareText aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Hazır yanıtlar</caption>
            <thead><tr><th scope="col">Şablon</th><th scope="col">Kategori</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id} style={!t.is_active ? { opacity: 0.6 } : undefined}><td><div className="cell-main">{t.title}</div><div className="cell-sub">{t.body}</div></td><td className="small">{t.category ? categoryName(categories, t.category) : "Tümü"}</td><td className="right">{can(P.requestsSettings) && <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${t.title} düzenle`} onClick={() => setEditing(t)}><Pencil aria-hidden="true" /></button>}</td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function TplForm({ t, categories, onDone }: { t: Tpl | null; categories: RequestCategory[]; onDone: () => void }) {
  const [f, setF] = useState({ title: t?.title ?? "", category: t?.category ?? "", body: t?.body ?? "", is_active: t?.is_active ?? true });
  const m = useSiteMutation<Record<string, unknown>, Tpl>(t ? "PATCH" : "POST", t ? `/reply-templates/${t.id}` : "/reply-templates", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, category: f.category || null }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Başlık" required error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={60} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Kategori" error={fieldError(m.error, "category")}>{(p) => <select {...p} className="field__input" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}><option value="">Tümü</option>{categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>}</Field>
        </div>
        <Field label="Metin" required error={fieldError(m.error, "body")}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={1000} value={f.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} />}</Field>
        {t && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Etkin</span></label>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>{t ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function Tariffs() {
  const { can } = useSite();
  const edit = can(P.requestsSettings);
  const q = useSiteGet<Tariff[]>("/service-tariffs");
  const [f, setF] = useState({ name: "", unit: "saat", price: "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/service-tariffs", { onSuccess: () => setF({ name: "", unit: "saat", price: "" }) });
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><Receipt aria-hidden="true" /></span><span className="card__title">Hizmet tarifesi</span><span className="card__meta ml-auto">teknik ekip teklif hazırlarken kullanır</span></div>
      {edit && (
        <form className="card__body grid grid--kpi" style={{ alignItems: "end", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, price: parseMoneyInput(f.price) }); }}>
          <FormError error={m.error} />
          <Field label="Kalem" error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. İşçilik" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
          <Field label="Birim" error={fieldError(m.error, "unit")}>{(p) => <input {...p} className="field__input" maxLength={20} value={f.unit} onChange={(e) => setF((x) => ({ ...x, unit: e.target.value }))} />}</Field>
          <Field label="Birim fiyat (₺)" error={fieldError(m.error, "price")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} />}</Field>
          <div><SubmitButton busy={m.isPending} disabled={!f.name.trim() || !f.price}>Ekle</SubmitButton></div>
        </form>
      )}
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Tarife kalemi yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Hizmet tarifesi</caption>
            <thead><tr><th scope="col">Kalem</th><th scope="col">Birim</th><th scope="col" className="right">Fiyat</th>{edit && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id} style={!t.is_active ? { opacity: 0.6 } : undefined}><td className="cell-main">{t.name}</td><td className="small">{t.unit}</td><td className="right"><Money value={t.price} /></td>{edit && <td className="right"><TariffEdit t={t} /></td>}</tr>)}</tbody>
          </table></div>
        )}
      </div>
      <div className="card__foot small muted">Tarife ekleme ve değişikliği "Ücretli hizmet tarifesi" onay kuralı varsa onaya gider. Ücret, iş kapanınca sakinin cari hesabına (ücretli hizmet) yansır.</div>
    </div>
  );
}

function TariffEdit({ t }: { t: Tariff }) {
  const [price, setPrice] = useState(Number(t.price).toLocaleString("tr-TR", { minimumFractionDigits: 2 }));
  const [active, setActive] = useState(t.is_active);
  const m = useSiteMutation<Record<string, unknown>, unknown>("PATCH", `/service-tariffs/${t.id}`);
  return (
    <ConfirmButton className="btn btn--ghost btn--sm btn--icon" title={`${t.name} — tarifeyi değiştir`} confirmLabel="Kaydet" aria-label={`${t.name} düzenle`}
      body={<div className="stack" style={{ gap: "var(--s-2)" }}><div className="field"><label className="field__label" htmlFor={`tp-${t.id}`}>Birim fiyat (₺)</label><input id={`tp-${t.id}`} className="field__input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div><label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Kullanımda</span></label></div>}
      onConfirm={() => m.mutateAsync({ name: t.name, unit: t.unit, price: parseMoneyInput(price), is_active: active })}>
      <Pencil aria-hidden="true" />
    </ConfirmButton>
  );
}

// ---------------------------------------------------------------- Ana olaylar (49)
/** Ana olaylar (HIZ-02): aynı arızaya gelen talepleri toplar; çözülünce bağlı talepler çözülür, her sakine bildirim. */
export function OutagesPage() {
  const { site, can } = useSite();
  const categories = useRequestCategories();
  const [s, set] = useUrlState({ page: "1" });
  const q = useSiteGet<Page<Outage>>("/outages", { page: s.page, page_size: 50 });
  // Göstergeler sayfadan bağımsız: en yeni 200 olay; daha fazlası varsa sayılar gösterilmez (uydurulmaz)
  const all = useSiteGet<Page<Outage>>("/outages", { page_size: 200 });
  const items = all.data?.items ?? [];
  const complete = !!all.data && all.data.total <= items.length;
  return (
    <div className="stack">
      <PageHead title="Ana olaylar" subtitle="Aynı arızadan gelen talepler tek olayda; sakinler birbirinin talebini değil olayın genel açıklamasını görür." actions={<Link className="btn" to={`/s/${site.slug}/talepler`}>Taleplere dön</Link>} />
      {all.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Açık olay" tone={items.some((o) => o.status === "open") ? "warn" : "ok"} icon={<Siren aria-hidden="true" />} value={complete ? items.filter((o) => o.status === "open").length : "—"} note="çözüm bekleyen arıza" />
          <Kpi label="Çözülen" tone="ok" icon={<CheckCircle2 aria-hidden="true" />} value={complete ? items.filter((o) => o.status === "resolved").length : "—"} note="bağlı talepleriyle kapandı" />
          <Kpi label="Toplanan talep" icon={<Layers aria-hidden="true" />} value={complete ? items.reduce((a, o) => a + o.request_ids.length, 0) : "—"} note={`${all.data.total} olaya bağlı`} />
        </div>
      ) : !all.isError && <div className="grid grid--kpi">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--warn"><Siren aria-hidden="true" /></span><span className="card__title">Olay listesi</span>{q.data && <span className="card__meta ml-auto">{q.data.total} olay</span>}</div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Ana olay yok" icon={<Siren aria-hidden="true" />}>Talep ayrıntısındaki birleştirme önerisinden oluşturulur.</Empty> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Ana olaylar</caption>
            <thead><tr><th scope="col">Olay</th><th scope="col" className="right">Talep</th><th scope="col">Durum</th>{can(P.requestsAssign) && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.items.map((o) => (
              <tr key={o.id}>
                <td><div className="cell-main">{o.title}</div><div className="cell-sub">{categoryName(categories, o.category)}{o.location && ` · ${o.location}`} · {o.created_by}, {formatDateTime(o.created_at)}</div><div className="small">{o.public_description}</div>{o.resolution && <div className="cell-sub">Çözüm: {o.resolution}</div>}</td>
                <td className="right num">{o.request_ids.length}</td>
                <td>{o.status === "open" ? <Badge tone="warn">Açık</Badge> : <Badge tone="ok">Çözüldü</Badge>}</td>
                {can(P.requestsAssign) && <td className="right">{o.status === "open" && <ResolveOutage o={o} />}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {q.data && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
      <p className="small muted">Bağlı talepler: <Link to={`/s/${site.slug}/talepler`}>Talepler</Link> listesinde.</p>
    </div>
  );
}

function ResolveOutage({ o }: { o: Outage }) {
  const [text, setText] = useState("");
  const m = useSiteMutation<{ resolution: string }, Outage>("POST", `/outages/${o.id}/resolve`);
  return (
    <ConfirmButton className="btn btn--primary btn--sm" title={`${o.title} — çözüldü`} confirmLabel="Çözüldü olarak kapat"
      body={<div className="field"><label className="field__label" htmlFor={`or-${o.id}`}>Çözüm açıklaması *</label><textarea id={`or-${o.id}`} className="field__input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /><span className="field__hint">{o.request_ids.length} bağlı açık talep "çözüldü" olur ve her sakine bu açıklama gider.</span></div>}
      onConfirm={() => m.mutateAsync({ resolution: text })}><CheckCircle2 aria-hidden="true" /> Çözüldü</ConfirmButton>
  );
}

// ---------------------------------------------------------------- Tadilat ve taşınma (52)
/** Tadilat ve taşınma izinleri (HIZ-05): başvuru → onay (onay kuralı varsa onay talebi) / ret → kontrol listesiyle tamamlama; depozito ve iadesi. */
export function PermitsPage() {
  const { can } = useSite();
  const manage = can(P.requestsAssign);
  const [s, set] = useUrlState({ durum: "pending", page: "1" });
  const q = useSiteGet<Page<Permit>>("/permits", { status: s.durum || undefined, page: s.page, page_size: 50 });
  const ps = useSiteGet<PermitRules>("/settings/permits");
  const [open, setOpen] = useState<string | null>(null);
  // Sekme sayıları: durum başına süzgeçli sorgunun toplamı. Bugün süren iş ve depozito, onay
  // bekleyen + onaylı başvuruların ilk 200'ünden; fazlası varsa o iki sayı gösterilmez.
  const pen = useSiteGet<Page<Permit>>("/permits", { status: "pending", page_size: 200 });
  const apr = useSiteGet<Page<Permit>>("/permits", { status: "approved", page_size: 200 });
  const cmp = useSiteGet<Page<Permit>>("/permits", { status: "completed", page_size: 1 });
  const rej = useSiteGet<Page<Permit>>("/permits", { status: "rejected", page_size: 1 });
  const counts: Record<string, number | undefined> = { pending: pen.data?.total, approved: apr.data?.total, completed: cmp.data?.total, rejected: rej.data?.total };
  const full = !!pen.data && !!apr.data && pen.data.total <= pen.data.items.length && apr.data.total <= apr.data.items.length;
  const today = new Date().toISOString().slice(0, 10);
  const activeNow = apr.data?.items.filter((p) => p.date_from <= today && p.date_to >= today).length;
  const deposits = full ? [...pen.data!.items, ...apr.data!.items].filter((p) => p.deposit && !p.deposit_refunded).reduce((a, p) => a + Number(p.deposit), 0) : undefined;
  return (
    <div className="stack">
      <PageHead title="Tadilat ve taşınma" subtitle="Sakinlerin tadilat ve taşınma başvuruları; çalışma saatleri, kontrol listesi ve depozito." />
      {pen.data && apr.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Onay bekleyen" tone={pen.data.total > 0 ? "warn" : undefined} icon={<Hourglass aria-hidden="true" />} value={pen.data.total} note="yönetim kararı bekliyor" />
          <Kpi label="Bugün süren iş" tone="accent" icon={<Hammer aria-hidden="true" />} value={full ? activeNow ?? 0 : "—"} note="onaylı, tarih aralığı bugünü kapsıyor" />
          <Kpi label="Tamamlanan" tone="ok" icon={<CheckCircle2 aria-hidden="true" />} value={cmp.data?.total ?? "…"} note="kontrol listesiyle kapandı" />
          <Kpi label="Bekleyen depozito" icon={<Wallet aria-hidden="true" />} value={deposits !== undefined ? formatMoneyShort(deposits.toFixed(2)) : "—"} note="iadesi henüz yapılmamış" />
        </div>
      ) : !pen.isError && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {can(P.requestsSettings) && <PermitRulesForm />}
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><Hammer aria-hidden="true" /></span>
          <span className="card__title">Başvurular</span>
          <div className="card__tools">
            <div className="tabs" role="tablist" aria-label="Durum">
              {[["pending", "Onay bekleyen"], ["approved", "Onaylı"], ["completed", "Tamamlanan"], ["rejected", "Reddedilen"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.durum === k} className="tabs__tab" onClick={() => set({ durum: k!, page: "1" })}>{l}{counts[k!] !== undefined && <span className="tabs__count">{counts[k!]}</span>}</button>)}
            </div>
          </div>
        </div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Başvuru yok" icon={<Hammer aria-hidden="true" />}>Sakinler uygulamadaki "Tadilat ve taşınma" ekranından başvurur.</Empty> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Tadilat ve taşınma başvuruları</caption>
            <thead><tr><th scope="col">Bölüm</th><th scope="col">Başvuru</th><th scope="col">Tarih</th><th scope="col">Durum</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.items.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td className="cell-main">{p.unit_name}<div className="cell-sub">{p.created_by}</div></td>
                  <td className="small">{permitType(p.type)}{p.contractor && ` · ${p.contractor}`}<div className="cell-sub">{p.description}</div></td>
                  <td className="small nowrap">{formatDate(p.date_from)}{p.date_to !== p.date_from && ` – ${formatDate(p.date_to)}`}</td>
                  <td><Badge tone={permitTone(p.status)}>{permitStatus(p.status)}</Badge>{p.approval_status === "pending" && <div className="cell-sub">Onay sürecinde</div>}{p.deposit && <div className="cell-sub">Depozito <Money value={p.deposit} />{p.deposit_refunded && " (iade edildi)"}</div>}{p.reject_reason && <div className="cell-sub">{p.reject_reason}</div>}</td>
                  {manage && <td className="right nowrap"><PermitActions p={p} onComplete={() => setOpen((x) => (x === p.id ? null : p.id))} /></td>}
                </tr>
                {open === p.id && <tr><td colSpan={5}><CompletePermit p={p} checklist={ps.data?.checklist ?? []} onDone={() => setOpen(null)} /></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {q.data && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(n) => set({ page: String(n) })} /></div>}
      </div>
    </div>
  );
}

function PermitActions({ p, onComplete }: { p: Permit; onComplete: () => void }) {
  const [reason, setReason] = useState("");
  const approve = useSiteMutation<Record<string, never>, unknown>("POST", `/permits/${p.id}/approve`);
  const reject = useSiteMutation<{ reason: string }, Permit>("POST", `/permits/${p.id}/reject`);
  if (p.status === "pending") return <><button className="btn btn--sm btn--primary" type="button" disabled={approve.isPending || p.approval_status === "pending"} onClick={() => approve.mutate({})}>{p.approval_status === "pending" ? "Onayda" : "Onayla"}</button>{" "}<ConfirmButton className="btn btn--ghost btn--sm" danger title="Başvuruyu reddet" confirmLabel="Reddet" body={<div className="field"><label className="field__label" htmlFor={`pr-${p.id}`}>Gerekçe *</label><input id={`pr-${p.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} onConfirm={() => reject.mutateAsync({ reason })}>Reddet</ConfirmButton></>;
  if (p.status === "approved") return <button className="btn btn--sm" type="button" onClick={onComplete}><ClipboardCheck aria-hidden="true" /> Tamamla</button>;
  return null;
}

function CompletePermit({ p, checklist, onDone }: { p: Permit; checklist: string[]; onDone: () => void }) {
  const items = p.type === "move_out" ? ["Anahtar ve kartlar teslim alındı", "Asansör ve koridorda hasar yok", "Sayaçlar okundu"] : checklist;
  const [ok, setOk] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i, true])));
  const [refund, setRefund] = useState(true);
  const m = useSiteMutation<Record<string, unknown>, Permit>("POST", `/permits/${p.id}/complete`, { onSuccess: onDone });
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ checklist: p.type === "move_in" ? [] : items.map((i) => ({ item: i, ok: !!ok[i] })), refund_deposit: !!p.deposit && refund }); }}>
      <FormError error={m.error} />
      {fieldError(m.error, "checklist") && <span className="field__error" role="alert">{fieldError(m.error, "checklist")}</span>}
      {p.type === "move_in" ? <p className="small mb-0">Giriş taşınmasında kontrol listesi gerekmez.</p> : items.map((i) => <label key={i} className="check"><input type="checkbox" checked={!!ok[i]} onChange={(e) => setOk((x) => ({ ...x, [i]: e.target.checked }))} /><span>{i}</span></label>)}
      {p.deposit && <label className="check"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /><span>Depozitoyu iade et (ters kayıt)</span></label>}
      {p.type === "move_out" && <p className="small muted mb-0">Çıkışta bölümün açık borçlarını kontrol edin; ilişkinin bitiş tarihini bölüm kartından girin.</p>}
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Tamamla</SubmitButton><button type="button" className="btn btn--ghost" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function PermitRulesForm() {
  const q = useSiteGet<PermitRules>("/settings/permits");
  const m = useSiteMutation<Record<string, unknown>, PermitRules>("PUT", "/settings/permits");
  const [s, setS] = useState<{ weekday_hours: string; saturday_hours: string; sunday_allowed: boolean; deposit_amount: string; checklist: string[] } | null>(null);
  useEffect(() => { if (q.data) setS({ ...q.data, saturday_hours: q.data.saturday_hours ?? "", deposit_amount: Number(q.data.deposit_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) }); }, [q.data]);
  if (!s) return null;
  return (
    <details className="card">
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__icon card__icon--accent"><Settings2 aria-hidden="true" /></span><span className="card__title">Tadilat kuralları</span><span className="card__meta ml-auto">hafta içi {q.data?.weekday_hours} · cumartesi {q.data?.saturday_hours || "yasak"} · pazar {q.data?.sunday_allowed ? "serbest" : "yasak"}</span></summary>
      <form className="card__body stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...s, saturday_hours: s.saturday_hours.trim() || null, deposit_amount: parseMoneyInput(s.deposit_amount) ?? "0", checklist: s.checklist.map((x) => x.trim()).filter(Boolean) }); }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Hafta içi saatler" hint="SS:DD-SS:DD" error={fieldError(m.error, "weekday_hours")}>{(p) => <input {...p} className="field__input mono" value={s.weekday_hours} onChange={(e) => setS({ ...s, weekday_hours: e.target.value })} />}</Field>
          <Field label="Cumartesi" hint="Boş: yasak" error={fieldError(m.error, "saturday_hours")}>{(p) => <input {...p} className="field__input mono" value={s.saturday_hours} onChange={(e) => setS({ ...s, saturday_hours: e.target.value })} />}</Field>
          <Field label="Depozito (₺)" hint="0: alınmaz; onayda malik hesabına yazılır, tamamlamada ters kayıtla iade" error={fieldError(m.error, "deposit_amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={s.deposit_amount} onChange={(e) => setS({ ...s, deposit_amount: e.target.value })} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={s.sunday_allowed} onChange={(e) => setS({ ...s, sunday_allowed: e.target.checked })} /><span>Pazar günü çalışılabilir</span></label>
        <Field label="Tamamlanma kontrol listesi" hint="Her satıra bir madde">{(p) => <textarea {...p} className="field__input" rows={4} value={s.checklist.join("\n")} onChange={(e) => setS({ ...s, checklist: e.target.value.split("\n") })} />}</Field>
        <div><SubmitButton busy={m.isPending}>Kuralları kaydet</SubmitButton></div>
      </form>
    </details>
  );
}
