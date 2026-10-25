import { Fragment, useState, type FormEvent } from "react";
import { ClipboardList, Gauge, KeyRound, ListTodo, Plus, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { AuthImage } from "../../components/AuthImage";
import { LinkedDocuments } from "../../components/LinkedDocuments";
import { PhotoInput } from "../../components/PhotoInput";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { WEEKDAYS, claimStatus, claimTone, depositStatus, depositTone, itemType, keyKind, meterKind, meterStatus, policyKind, readingStatus, readingTone, stockCountStatus, stockCountTone, taskFrequency, taskStatus, taskTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Üretilmiş tipler (servis istekleri 53–58; backend OPS-01..06). */
type KeyRow = Schemas["FacilityKeyOut"];
type KeyLoan = Schemas["KeyLoanOut"];
type DepKey = Schemas["DepositedKeyOut"];
type ChkTemplate = Schemas["ChecklistTemplateOut"];
type Inspection = Schemas["ChecklistInspectionOut"];
type Policy = Schemas["InsurancePolicyOut"];
type Claim = Schemas["InsuranceClaimOut"];
type Meter = Schemas["MeterOut"];
type MeterPeriod = Schemas["MeterPeriodOut"];
type OpSettings = Schemas["OperationSettingsOut"];
type TaskT = Schemas["TaskTemplateOut"];
type TaskRow = Schemas["DayTaskOut"];
type TaskReport = Schemas["TaskReportOut"];
type StockItem = Schemas["StockItemOut"];
type StockCountRow = Schemas["StockCountOut"];
type StaffMember = Schemas["StaffOut"];
/** Şablon formundaki madde (sayı sınırları metin olarak tutulur). */
interface ChkItemForm { text: string; type: "yesno" | "number" | "score"; photo_required: boolean; min: string; max: string }

const plusHours = (h: number) => { const d = new Date(Date.now() + h * 3600e3); d.setMinutes(0, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`; };
const ROLES = ["Yönetici", "Teknik Personel", "Güvenlik", "Görevli", "Sakin"];
const num = (v: string | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("tr-TR"));
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="row" role="tablist" aria-label={label} style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className={`btn btn--sm${v === k ? " btn--primary" : ""}`} onClick={() => set(k)}>{l}</button>)}</div>
);
/** Saha fotoğrafı (yetkili uçtan). */
function OpPhoto({ id, alt }: { id: string; alt: string }) {
  const { site } = useSite();
  return <AuthImage path={`/sites/${site.slug}/operation-photos/${id}`} alt={alt} />;
}

// ===================================================================== 53 Anahtar ve emanet
/** Anahtar ve emanet (OPS-01): ortak alan anahtar/kart/kumanda teslim-iade; sakinin bıraktığı emanet anahtar. */
export function KeysPage() {
  const [s, set] = useUrlState({ sekme: "anahtar" });
  return (
    <div className="stack">
      <PageHead title="Anahtar ve emanet" subtitle="Ortak alan anahtarları kimde, ne zaman dönecek; sakinlerin bıraktığı emanet anahtarlar yalnız yetkili kişiye." />
      {tabs([["anahtar", "Anahtarlar"], ["gecmis", "Teslim geçmişi"], ["emanet", "Emanet anahtarlar"]], s.sekme, (k) => set({ sekme: k }), "Anahtar")}
      {s.sekme === "emanet" ? <Deposits /> : s.sekme === "gecmis" ? <LoanHistory /> : <Keys />}
    </div>
  );
}

function Keys() {
  const q = useSiteGet<KeyRow[]>("/keys");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ kind: "key", code: "", name: "", area: "", authorized_roles: [] as string[] });
  const add = useSiteMutation<Record<string, unknown>, KeyRow>("POST", "/keys", { onSuccess: () => { setAdding(false); setF({ kind: "key", code: "", name: "", area: "", authorized_roles: [] }); } });
  const out = (q.data ?? []).filter((k) => k.loan).length, late = (q.data ?? []).filter((k) => k.overdue).length;
  return (
    <>
      <div className="grid grid--kpi"><Kpi label="Anahtar" value={q.data?.length ?? 0} /><Kpi label="Dışarıda" value={out} /><Kpi label="İadesi gecikmiş" value={late} tone={late ? "danger" : undefined} /></div>
      <div className="row"><button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Anahtar ekle</button></div>
      {adding && (
        <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); add.mutate({ ...f, area: f.area.trim() || null }); }}>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={add.error} />
            <div className="grid grid--kpi">
              <Field label="Tip" error={fieldError(add.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{["key", "card", "remote"].map((k) => <option key={k} value={k}>{keyKind(k)}</option>)}</select>}</Field>
              <Field label="Kod" required error={fieldError(add.error, "code")}>{(p) => <input {...p} className="field__input mono" maxLength={20} placeholder="ör. ANH-01" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value }))} />}</Field>
              <Field label="Ad" required error={fieldError(add.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. Toplantı salonu" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
              <Field label="Alan / bölüm">{(p) => <input {...p} className="field__input" maxLength={60} value={f.area} onChange={(e) => setF((x) => ({ ...x, area: e.target.value }))} />}</Field>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Yetkili roller (boş: herkes)</legend><div className="row" style={{ gap: "var(--s-2) var(--s-4)", flexWrap: "wrap" }}>{ROLES.map((r) => <label key={r} className="check"><input type="checkbox" checked={f.authorized_roles.includes(r)} onChange={(e) => setF((x) => ({ ...x, authorized_roles: e.target.checked ? [...x.authorized_roles, r] : x.authorized_roles.filter((y) => y !== r) }))} /><span>{r}</span></label>)}</div></fieldset>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={add.isPending}>Ekle</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setAdding(false)}>Vazgeç</button></div>
        </form>
      )}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Anahtar kaydı yok" icon={<KeyRound aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Anahtarlar</caption>
            <thead><tr><th scope="col">Anahtar</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((k) => (
              <tr key={k.id}>
                <td><div className="cell-main">{k.name}{!k.is_active && <> <Badge>Kullanım dışı</Badge></>}</div><div className="cell-sub"><span className="mono">{k.code}</span> · {keyKind(k.kind)}{k.area && ` · ${k.area}`}{k.authorized_roles.length > 0 && ` · yetkili: ${k.authorized_roles.join(", ")}`}</div></td>
                <td className="small">{k.loan ? <>{k.overdue ? <Badge tone="danger">İadesi gecikti</Badge> : <Badge tone="info">Dışarıda</Badge>} {k.loan.to_name}<div className="cell-sub">iade {formatDateTime(k.loan.due_at)}</div></> : <Badge tone="ok">Yerinde</Badge>}</td>
                <td className="right nowrap">{k.loan ? <ReturnKey id={k.loan.id} /> : <>{k.is_active && <GiveKey k={k} />} <ToggleKey k={k} /></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function ToggleKey({ k }: { k: KeyRow }) {
  const m = useSiteMutation<{ is_active: boolean }, KeyRow>("PATCH", `/keys/${k.id}`);
  return <button className="btn btn--ghost btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ is_active: !k.is_active })}>{k.is_active ? "Kullanım dışı" : "Kullanıma al"}</button>;
}

function GiveKey({ k }: { k: KeyRow }) {
  const [f, setF] = useState({ to_name: "", to_phone: "", due_at: plusHours(2), role: k.authorized_roles[0] ?? "" });
  const m = useSiteMutation<Record<string, unknown>, KeyLoan>("POST", `/keys/${k.id}/loans`);
  return (
    <ConfirmButton className="btn btn--sm" title={`${k.name} — teslim et`} confirmLabel="Teslim et"
      body={<div className="stack" style={{ gap: "var(--s-3)" }}>
        <div className="field"><label className="field__label" htmlFor={`kn-${k.id}`}>Teslim alan *</label><input id={`kn-${k.id}`} className="field__input" value={f.to_name} onChange={(e) => setF((x) => ({ ...x, to_name: e.target.value }))} /></div>
        <div className="field"><label className="field__label" htmlFor={`kp-${k.id}`}>Telefon</label><input id={`kp-${k.id}`} className="field__input" inputMode="tel" placeholder="0532 123 45 67" value={f.to_phone} onChange={(e) => setF((x) => ({ ...x, to_phone: e.target.value }))} /></div>
        {k.authorized_roles.length > 0 && <div className="field"><label className="field__label" htmlFor={`kr-${k.id}`}>Rolü</label><select id={`kr-${k.id}`} className="field__input" value={f.role} onChange={(e) => setF((x) => ({ ...x, role: e.target.value }))}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>}
        <div className="field"><label className="field__label" htmlFor={`kd-${k.id}`}>İade zamanı *</label><input id={`kd-${k.id}`} className="field__input" type="datetime-local" value={f.due_at} onChange={(e) => setF((x) => ({ ...x, due_at: e.target.value }))} /></div>
      </div>}
      onConfirm={() => m.mutateAsync({ to_name: f.to_name, to_phone: f.to_phone || null, role: f.role || null, due_at: new Date(f.due_at).toISOString() })}>Teslim et</ConfirmButton>
  );
}
function ReturnKey({ id }: { id: string }) {
  const m = useSiteMutation<Record<string, never>, KeyLoan>("POST", `/key-loans/${id}/return`);
  return <button className="btn btn--sm btn--primary" type="button" disabled={m.isPending} onClick={() => m.mutate({})}>İade alındı</button>;
}

function LoanHistory() {
  const q = useSiteGet<KeyLoan[]>("/key-loans");
  return (
    <div className="card"><div className="card__body card__body--flush">
      {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Teslim kaydı yok" /> : (
        <div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Teslim geçmişi (son 100)</caption>
          <thead><tr><th scope="col">Anahtar</th><th scope="col">Teslim alan</th><th scope="col">Verildi</th><th scope="col">İade</th></tr></thead>
          <tbody>{q.data.map((l) => (
            <tr key={l.id}>
              <td className="cell-main">{l.key_name ?? "—"}</td>
              <td className="small">{l.to_name}{l.role && <div className="cell-sub">{l.role}</div>}</td>
              <td className="small">{formatDateTime(l.given_at)}<div className="cell-sub">{l.given_by} · iade {formatDateTime(l.due_at)}</div></td>
              <td className="small">{l.returned_at ? <>{formatDateTime(l.returned_at)}<div className="cell-sub">{l.returned_to}</div></> : <Badge tone={l.due_at < new Date().toISOString() ? "danger" : "info"}>Dışarıda</Badge>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div></div>
  );
}

function Deposits() {
  const q = useSiteGet<DepKey[]>("/deposited-keys");
  return (
    <div className="card"><div className="card__body card__body--flush">
      {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Emanet anahtar yok">Sakin uygulamada "Emanet anahtar" bırakır; anahtarı getirdiğinde teslim alın.</Empty> : (
        <div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Emanet anahtarlar</caption>
          <thead><tr><th scope="col">Bölüm</th><th scope="col">Yetkili kişiler</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
          <tbody>{q.data.map((d) => (
            <tr key={d.id}>
              <td className="cell-main">{d.unit_name}<div className="cell-sub">{d.deposited_by} · {formatDate(d.valid_until)} tarihine kadar</div>{d.note && <div className="cell-sub">{d.note}</div>}</td>
              <td className="small">{d.authorized.map((a) => a.name).join(", ")}</td>
              <td><Badge tone={depositTone(d.status)}>{depositStatus(d.status)}</Badge>{d.received_by && d.status === "held" && <div className="cell-sub">teslim alan {d.received_by}, {formatDateTime(d.received_at)}</div>}{d.handed_to && <div className="cell-sub">{d.handed_to}, {formatDateTime(d.handed_at)}</div>}</td>
              <td className="right nowrap"><DepositActions d={d} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div></div>
  );
}
function DepositActions({ d }: { d: DepKey }) {
  const [name, setName] = useState(d.authorized[0]?.name ?? "");
  const [idc, setIdc] = useState(false);
  const recv = useSiteMutation<Record<string, never>, DepKey>("POST", `/deposited-keys/${d.id}/receive`);
  const hand = useSiteMutation<{ name: string; id_checked: boolean }, DepKey>("POST", `/deposited-keys/${d.id}/hand`);
  const ret = useSiteMutation<Record<string, never>, DepKey>("POST", `/deposited-keys/${d.id}/return`);
  if (d.status === "requested") return <button className="btn btn--sm btn--primary" type="button" disabled={recv.isPending} onClick={() => recv.mutate({})}>Anahtarı teslim aldım</button>;
  if (d.status === "held") return (
    <>
      <ConfirmButton className="btn btn--sm btn--primary" title={`${d.unit_name} emanet anahtarı — ver`} confirmLabel="Anahtarı ver"
        body={<div className="stack" style={{ gap: "var(--s-3)" }}>
          <div className="field"><label className="field__label" htmlFor={`hn-${d.id}`}>Gelen kişi</label><input id={`hn-${d.id}`} className="field__input" list={`hl-${d.id}`} value={name} onChange={(e) => setName(e.target.value)} /><datalist id={`hl-${d.id}`}>{d.authorized.map((a) => <option key={a.name} value={a.name} />)}</datalist><span className="field__hint">Yalnız sakinin yetkili listesindeki kişiye verilir.</span></div>
          <label className="check"><input type="checkbox" checked={idc} onChange={(e) => setIdc(e.target.checked)} /><span>Kimliğini kontrol ettim</span></label>
        </div>}
        onConfirm={() => hand.mutateAsync({ name, id_checked: idc })}>Yetkiliye ver</ConfirmButton>{" "}
      <button className="btn btn--ghost btn--sm" type="button" disabled={ret.isPending} onClick={() => ret.mutate({})}>Sahibine iade</button>
    </>
  );
  if (d.status === "expired") return <button className="btn btn--ghost btn--sm" type="button" disabled={ret.isPending} onClick={() => ret.mutate({})}>Sahibine iade</button>;
  return null;
}

// ===================================================================== 55 Denetim listeleri
/** Denetim listeleri (OPS-03): şablondan saha denetimi; olumsuz madde talep açar; skor. */
export function InspectionsPage() {
  const [s, set] = useUrlState({ sekme: "yeni" });
  return (
    <div className="stack">
      <PageHead title="Denetim listeleri" subtitle="Temizlik, havuz hijyeni, güvenlik turu, taşınma hasar kontrolü… Olumsuz madde otomatik talep açar." />
      {tabs([["yeni", "Denetim yap"], ["gecmis", "Geçmiş"], ["sablon", "Şablonlar"]], s.sekme, (k) => set({ sekme: k }), "Denetim")}
      {s.sekme === "gecmis" ? <InspectionHistory /> : s.sekme === "sablon" ? <ChkTemplates /> : <NewInspection />}
    </div>
  );
}

function NewInspection() {
  const tq = useSiteGet<ChkTemplate[]>("/checklist-templates");
  const [tid, setTid] = useState("");
  const [loc, setLoc] = useState("");
  const [ans, setAns] = useState<{ value: string; photo: string | null }[]>([]);
  const active = (tq.data ?? []).filter((x) => x.is_active);
  const t = active.find((x) => x.id === (tid || active[0]?.id));
  const m = useSiteMutation<Record<string, unknown>, Inspection>("POST", "/inspections", { onSuccess: () => { setAns([]); setLoc(""); } });
  if (tq.isPending) return <Loading />;
  if (tq.isError) return <ErrorState error={tq.error} />;
  const setA = (i: number, patch: Partial<{ value: string; photo: string | null }>) => setAns((a) => { const n = [...a]; n[i] = { value: "", photo: null, ...n[i], ...patch }; return n; });
  function submit(e: FormEvent) { e.preventDefault(); if (t) m.mutate({ template_id: t.id, location: loc.trim(), answers: t.items.map((_, i) => ans[i] ?? { value: "", photo: null }) }); }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__head"><span className="card__icon card__icon--accent"><ClipboardList aria-hidden="true" /></span><span className="card__title">Yeni denetim</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Şablon" error={fieldError(m.error, "template_id")}>{(p) => <select {...p} className="field__input" value={t?.id ?? ""} onChange={(e) => { setTid(e.target.value); setAns([]); }}>{active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
          <Field label="Konum" required error={fieldError(m.error, "location")}>{(p) => <input {...p} className="field__input" maxLength={80} placeholder="ör. A blok giriş" value={loc} onChange={(e) => setLoc(e.target.value)} />}</Field>
        </div>
        {t?.items.map((it, i) => (
          <div key={i} className="stack" style={{ gap: "var(--s-2)", borderTop: "1px solid var(--line)", paddingTop: "var(--s-3)" }}>
            <div className="strong small">{i + 1}. {it.text}{it.type === "number" && (it.min != null || it.max != null) && <span className="muted"> (uygun aralık {num(it.min)}–{num(it.max)})</span>}</div>
            {it.type === "yesno" ? (
              <div className="row" style={{ gap: "var(--s-3)" }}>{[["yes", "Evet"], ["no", "Hayır"]].map(([v, l]) => <label key={v} className="check"><input type="radio" name={`a-${i}`} checked={ans[i]?.value === v} onChange={() => setA(i, { value: v! })} /><span>{l}</span></label>)}</div>
            ) : it.type === "score" ? (
              <div className="row" style={{ gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`btn btn--sm${ans[i]?.value === String(n) ? " btn--primary" : ""}`} aria-pressed={ans[i]?.value === String(n)} onClick={() => setA(i, { value: String(n) })}>{n}</button>)}</div>
            ) : (
              <input className="field__input" style={{ maxWidth: "10rem" }} inputMode="decimal" aria-label={it.text} value={ans[i]?.value ?? ""} onChange={(e) => setA(i, { value: e.target.value.replace(",", ".") })} />
            )}
            {(it.photo_required || ans[i]?.value === "no") && <PhotoInput required={it.photo_required} value={ans[i]?.photo ?? null} onChange={(v) => setA(i, { photo: v })} />}
            {fieldError(m.error, `answers.${i}`) && <span className="field__error" role="alert">{fieldError(m.error, `answers.${i}`)}</span>}
          </div>
        ))}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!t}>Denetimi kaydet</SubmitButton><span className="small muted">Olumsuz maddeler için talep açılır (talep modülü açıksa).</span></div>
    </form>
  );
}

function InspectionHistory() {
  const q = useSiteGet<Inspection[]>("/inspections");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="card"><div className="card__body card__body--flush">
      {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Denetim yok" /> : (
        <div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Denetim geçmişi</caption>
          <thead><tr><th scope="col">Denetim</th><th scope="col" className="right">Skor</th><th scope="col">Olumsuz</th><th scope="col"><span className="visually-hidden">Ayrıntı</span></th></tr></thead>
          <tbody>{q.data.map((x) => (
            <Fragment key={x.id}>
              <tr>
                <td><div className="cell-main">{x.template_name}</div><div className="cell-sub">{x.location} · {x.by}, {formatDateTime(x.at)}</div></td>
                <td className="right"><Badge tone={x.score >= 90 ? "ok" : x.score >= 70 ? "warn" : "danger"}>%{x.score}</Badge></td>
                <td className="small">{x.failed ? `${x.failed} madde · ${x.opened_request_ids.length} talep` : "—"}</td>
                <td className="right"><button className="btn btn--ghost btn--sm" type="button" aria-expanded={open === x.id} onClick={() => setOpen((v) => (v === x.id ? null : x.id))}>Maddeler</button></td>
              </tr>
              {open === x.id && <tr><td colSpan={4}>{x.answers.map((a, i) => <div key={i} className="row small" style={{ gap: "var(--s-2)", alignItems: "center", padding: "2px 0" }}><Badge tone={a.ok ? "ok" : "danger"}>{a.ok ? "Uygun" : "Olumsuz"}</Badge> {a.text}: <strong>{a.value === "yes" ? "Evet" : a.value === "no" ? "Hayır" : a.value}</strong>{a.photo_id && <OpPhoto id={a.photo_id} alt={`${a.text} fotoğrafı`} />}</div>)}</td></tr>}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
    </div></div>
  );
}

const EMPTY_ITEM: ChkItemForm = { text: "", type: "yesno", photo_required: false, min: "", max: "" };
function ChkTemplates() {
  const q = useSiteGet<ChkTemplate[]>("/checklist-templates");
  const [f, setF] = useState<{ name: string; items: ChkItemForm[] }>({ name: "", items: [EMPTY_ITEM] });
  const [open, setOpen] = useState(false);
  const m = useSiteMutation<Record<string, unknown>, ChkTemplate>("POST", "/checklist-templates", { onSuccess: () => { setOpen(false); setF({ name: "", items: [EMPTY_ITEM] }); } });
  const upd = (i: number, p: Partial<ChkItemForm>) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));
  const body = () => ({ name: f.name, items: f.items.map((i) => ({ text: i.text, type: i.type, photo_required: i.photo_required, min: i.type === "number" && i.min.trim() ? i.min.replace(",", ".") : null, max: i.type === "number" && i.max.trim() ? i.max.replace(",", ".") : null })) });
  return (
    <>
      <div className="row"><button className="btn btn--primary" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Plus aria-hidden="true" /> Şablon ekle</button></div>
      {open && (
        <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(body()); }}>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={m.error} />
            <Field label="Şablon adı" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
            {f.items.map((it, i) => (
              <div key={i} className="stack" style={{ gap: "var(--s-1)" }}>
                <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div className="field" style={{ flex: "2 1 14rem" }}><label className="field__label" htmlFor={`ci-${i}`}>{i + 1}. madde</label><input id={`ci-${i}`} className="field__input" value={it.text} onChange={(e) => upd(i, { text: e.target.value })} /></div>
                  <div className="field" style={{ flex: "1 1 8rem" }}><label className="field__label" htmlFor={`ct-${i}`}>Tip</label><select id={`ct-${i}`} className="field__input" value={it.type} onChange={(e) => upd(i, { type: e.target.value as ChkItemForm["type"] })}>{["yesno", "number", "score"].map((k) => <option key={k} value={k}>{itemType(k)}</option>)}</select></div>
                  {it.type === "number" && <>
                    <div className="field" style={{ flex: "0 1 6rem" }}><label className="field__label" htmlFor={`cmin-${i}`}>En az</label><input id={`cmin-${i}`} className="field__input" inputMode="decimal" value={it.min} onChange={(e) => upd(i, { min: e.target.value })} /></div>
                    <div className="field" style={{ flex: "0 1 6rem" }}><label className="field__label" htmlFor={`cmax-${i}`}>En çok</label><input id={`cmax-${i}`} className="field__input" inputMode="decimal" value={it.max} onChange={(e) => upd(i, { max: e.target.value })} /></div>
                  </>}
                  <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={it.photo_required} onChange={(e) => upd(i, { photo_required: e.target.checked })} /><span>Fotoğraf zorunlu</span></label>
                  {f.items.length > 1 && <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={`${i + 1}. maddeyi kaldır`} onClick={() => setF((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}><Trash2 aria-hidden="true" /></button>}
                </div>
                {fieldError(m.error, `items.${i}`) && <span className="field__error" role="alert">{fieldError(m.error, `items.${i}`)}</span>}
              </div>
            ))}
            {fieldError(m.error, "items") && <span className="field__error">{fieldError(m.error, "items")}</span>}
            <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setF((x) => ({ ...x, items: [...x.items, EMPTY_ITEM] }))}><Plus aria-hidden="true" /> Madde</button></div>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Vazgeç</button></div>
        </form>
      )}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Denetim şablonları</caption>
            <thead><tr><th scope="col">Şablon</th><th scope="col" className="right">Madde</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id}><td><div className="cell-main">{t.name}{!t.is_active && <> <Badge>Pasif</Badge></>}</div><div className="cell-sub">{t.items.map((i) => i.text).join(" · ")}</div></td><td className="right num">{t.items.length}</td><td className="right"><ToggleTemplate t={t} /></td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}
function ToggleTemplate({ t }: { t: ChkTemplate }) {
  const m = useSiteMutation<{ is_active: boolean }, ChkTemplate>("PATCH", `/checklist-templates/${t.id}`);
  return <button className="btn btn--ghost btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ is_active: !t.is_active })}>{t.is_active ? "Pasifleştir" : "Etkinleştir"}</button>;
}

// ===================================================================== 56 Sigorta
/** Sigorta, poliçe ve hasar (OPS-04): poliçe bitişinden 60/30 gün önce uyarı; hasar dosyası, tazminat ve belgeler. */
export function InsurancePage() {
  const { can } = useSite();
  const canManage = can(P.expensesManage);
  const pq = useSiteGet<Policy[]>("/insurance-policies");
  const cq = useSiteGet<Claim[]>("/insurance-claims");
  const [adding, setAdding] = useState<"policy" | "claim" | null>(null);
  const warn = (pq.data ?? []).filter((p) => p.warning);
  return (
    <div className="stack">
      <PageHead title="Sigorta ve hasar" subtitle="Poliçelerin bitişini kaçırmayın; hasar dosyalarını, tazminatı ve belgeleri izleyin." actions={canManage && <><button className="btn" type="button" onClick={() => setAdding("claim")} disabled={!pq.data?.length}>Hasar dosyası aç</button><button className="btn btn--primary" type="button" onClick={() => setAdding("policy")}><Plus aria-hidden="true" /> Poliçe ekle</button></>} />
      {warn.length > 0 && <Alert tone="warn" title="Bitişi yaklaşan poliçe">{warn.map((p) => `${policyKind(p.kind)} (${p.insurer}) — ${p.days_left < 0 ? "süresi doldu" : `${p.days_left} gün kaldı`}`).join(" · ")}</Alert>}
      {adding === "policy" && <PolicyForm onDone={() => setAdding(null)} />}
      {adding === "claim" && <ClaimForm policies={pq.data ?? []} onDone={() => setAdding(null)} />}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><ShieldCheck aria-hidden="true" /></span><span className="card__title">Poliçeler</span></div>
        <div className="card__body card__body--flush">
          {pq.isPending ? <Loading /> : pq.isError ? <div className="card__body"><ErrorState error={pq.error} /></div> : pq.data.length === 0 ? <Empty title="Poliçe yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Poliçeler</caption>
              <thead><tr><th scope="col">Poliçe</th><th scope="col">Dönem</th><th scope="col" className="right">Prim</th><th scope="col">Durum</th><th scope="col">Belgeler</th></tr></thead>
              <tbody>{pq.data.map((p) => <tr key={p.id}><td><div className="cell-main">{policyKind(p.kind)}</div><div className="cell-sub">{p.insurer} · <span className="mono">{p.policy_no}</span>{p.area && ` · ${p.area}`}</div>{p.coverage && <div className="cell-sub">{p.coverage}</div>}</td><td className="small nowrap">{formatDate(p.start)} – {formatDate(p.end)}</td><td className="right"><Money value={p.premium} /></td><td>{p.days_left < 0 ? <Badge tone="danger">Süresi doldu</Badge> : p.warning ? <Badge tone="warn">{p.days_left} gün kaldı</Badge> : <Badge tone="ok">Geçerli</Badge>}</td><td><LinkedDocuments subjectType="insurance_policies" subjectId={p.id} docs={p.documents} canManage={canManage} compact /></td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Hasar dosyaları</span></div>
        <div className="card__body card__body--flush">
          {cq.isPending ? <Loading /> : cq.isError ? <div className="card__body"><ErrorState error={cq.error} /></div> : cq.data.length === 0 ? <Empty title="Hasar dosyası yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Hasar dosyaları</caption>
              <thead><tr><th scope="col">Hasar</th><th scope="col">Poliçe</th><th scope="col" className="right">Tazminat</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
              <tbody>{cq.data.map((c) => <tr key={c.id}><td><div className="cell-main">{c.description}</div><div className="cell-sub">{formatDate(c.incident_date)}{c.source && ` · ${c.source}`}</div><LinkedDocuments subjectType="insurance_claims" subjectId={c.id} docs={c.documents} canManage={canManage} compact /></td><td className="small">{c.policy_label}</td><td className="right">{c.paid ? <><Money value={c.paid} />{c.paid_on && <div className="cell-sub">{formatDate(c.paid_on)}</div>}</> : c.claimed ? <span className="small muted">talep <Money value={c.claimed} /></span> : "—"}</td><td><Badge tone={claimTone(c.status)}>{claimStatus(c.status)}</Badge></td><td className="right nowrap">{canManage && <ClaimActions c={c} />}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <p className="small muted">Ödenen tazminat muhasebe aktarımında gelir kaydı olarak yer alacak (Mod P). Belgeler belge arşivine "yalnız yönetim" olarak kaydedilir.</p>
    </div>
  );
}

function PolicyForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ kind: "building", insurer: "", policy_no: "", coverage: "", premium: "", start: todayIso(), end: "", area: "" });
  const m = useSiteMutation<Record<string, unknown>, Policy>("POST", "/insurance-policies", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, premium: parseMoneyInput(f.premium) ?? null, end: f.end || null, coverage: f.coverage || null, area: f.area || null }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Tip" required error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={up("kind")}>{["building", "liability", "elevator", "personnel", "glass", "other"].map((k) => <option key={k} value={k}>{policyKind(k)}</option>)}</select>}</Field>
          <Field label="Sigortacı" required error={fieldError(m.error, "insurer")}>{(p) => <input {...p} className="field__input" value={f.insurer} onChange={up("insurer")} />}</Field>
          <Field label="Poliçe no" required error={fieldError(m.error, "policy_no")}>{(p) => <input {...p} className="field__input mono" value={f.policy_no} onChange={up("policy_no")} />}</Field>
          <Field label="Prim (₺)" required error={fieldError(m.error, "premium")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.premium} onChange={up("premium")} />}</Field>
          <Field label="Başlangıç" required error={fieldError(m.error, "start")}>{(p) => <input {...p} className="field__input" type="date" value={f.start} onChange={up("start")} />}</Field>
          <Field label="Bitiş" required error={fieldError(m.error, "end")}>{(p) => <input {...p} className="field__input" type="date" min={f.start} value={f.end} onChange={up("end")} />}</Field>
          <Field label="Bağlı alan">{(p) => <input {...p} className="field__input" value={f.area} onChange={up("area")} />}</Field>
        </div>
        <Field label="Kapsam">{(p) => <input {...p} className="field__input" maxLength={200} value={f.coverage} onChange={up("coverage")} />}</Field>
        <p className="small muted mb-0">Poliçe belgesini kayıttan sonra satırdaki "Belge ekle" ile yükleyin.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ClaimForm({ policies, onDone }: { policies: Policy[]; onDone: () => void }) {
  const [f, setF] = useState({ policy_id: policies[0]?.id ?? "", description: "", incident_date: todayIso(), source: "", claimed: "" });
  const m = useSiteMutation<Record<string, unknown>, Claim>("POST", "/insurance-claims", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, source: f.source || null, claimed: parseMoneyInput(f.claimed) ?? null }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Poliçe" required error={fieldError(m.error, "policy_id")}>{(p) => <select {...p} className="field__input" value={f.policy_id} onChange={(e) => setF((x) => ({ ...x, policy_id: e.target.value }))}>{policies.map((x) => <option key={x.id} value={x.id}>{policyKind(x.kind)} · {x.insurer}</option>)}</select>}</Field>
          <Field label="Hasar tarihi" required error={fieldError(m.error, "incident_date")}>{(p) => <input {...p} className="field__input" type="date" max={todayIso()} value={f.incident_date} onChange={(e) => setF((x) => ({ ...x, incident_date: e.target.value }))} />}</Field>
          <Field label="Kaynak" hint="ör. talep #12, olay O-0003">{(p) => <input {...p} className="field__input" value={f.source} onChange={(e) => setF((x) => ({ ...x, source: e.target.value }))} />}</Field>
          <Field label="Talep edilen (₺)" error={fieldError(m.error, "claimed")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.claimed} onChange={(e) => setF((x) => ({ ...x, claimed: e.target.value }))} />}</Field>
        </div>
        <Field label="Hasar" required error={fieldError(m.error, "description")}>{(p) => <input {...p} className="field__input" maxLength={200} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Dosya aç</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ClaimActions({ c }: { c: Claim }) {
  const [paid, setPaid] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const m = useSiteMutation<Record<string, unknown>, Claim>("PATCH", `/insurance-claims/${c.id}`);
  const reject = <ConfirmButton className="btn btn--ghost btn--sm" title="Hasar dosyası reddedildi" confirmLabel="Reddedildi olarak kaydet" body="Dosya kapanır; sonra değiştirilemez." onConfirm={() => m.mutateAsync({ status: "rejected" })}>Reddedildi</ConfirmButton>;
  if (c.status === "open") return <><button className="btn btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ status: "submitted" })}>Sigortacıya iletildi</button>{" "}{reject}</>;
  if (c.status === "submitted") return <><ConfirmButton className="btn btn--sm btn--primary" title="Tazminat ödendi" confirmLabel="Kaydet" body={<div className="stack" style={{ gap: "var(--s-2)" }}><div className="field"><label className="field__label" htmlFor={`cp-${c.id}`}>Ödenen tazminat (₺) *</label><input id={`cp-${c.id}`} className="field__input" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} /></div><div className="field"><label className="field__label" htmlFor={`cd-${c.id}`}>Ödeme tarihi</label><input id={`cd-${c.id}`} className="field__input" type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div></div>} onConfirm={() => m.mutateAsync({ status: "paid", paid: parseMoneyInput(paid) ?? null, paid_on: paidOn || null })}>Ödendi</ConfirmButton>{" "}{reject}{" "}<button className="btn btn--ghost btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ status: "open" })}>Açığa al</button></>;
  return null;
}

// ===================================================================== 57 Sayaçlar
/** Sayaçlar ve okuma (OPS-05): dönem okuması (fotoğraflı), endeks kontrolü, sapma onayı, okunamadı nedeni, sayaç değişimi. */
export function MetersPage() {
  const [s, set] = useUrlState({ donem: todayIso().slice(0, 7) });
  const q = useSiteGet<MeterPeriod>("/meter-readings", { period: s.donem });
  const st = useSiteGet<OpSettings>("/operation-settings");
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const anomalies = (q.data?.rows ?? []).filter((r) => r.reading?.status === "anomaly").length;
  return (
    <div className="stack">
      <PageHead title="Sayaçlar ve okuma" subtitle={`Okumalar fotoğraf kanıtıyla; önceki endeksten küçük değer reddedilir, %${st.data?.meter_anomaly_percent ?? 50}'den fazla sapma onaya düşer.`} actions={<><button className="btn" type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}><Settings2 aria-hidden="true" /> Ayarlar</button><button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Sayaç ekle</button></>} />
      {settingsOpen && st.data && <MeterSettings value={st.data} onDone={() => setSettingsOpen(false)} />}
      {adding && <MeterForm onDone={() => setAdding(false)} />}
      <div className="filters"><div className="field"><label className="field__label" htmlFor="mt-p">Okuma dönemi</label><input id="mt-p" className="field__input" type="month" value={s.donem} onChange={(e) => set({ donem: e.target.value })} /></div></div>
      {q.data && <div className="grid grid--kpi"><Kpi label="Sayaç" value={q.data.rows.length} /><Kpi label="Okunmamış / okunamamış" value={q.data.missing} tone={q.data.missing ? "warn" : "ok"} /><Kpi label="Anormal" value={anomalies} tone={anomalies ? "warn" : undefined} /></div>}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.rows.length === 0 ? <Empty title="Sayaç yok" icon={<Gauge aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Sayaç okumaları</caption>
            <thead><tr><th scope="col">Sayaç</th><th scope="col" className="right">Önceki</th><th scope="col" className="right">Bu dönem</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.rows.map((r) => (
              <Fragment key={r.meter.id}>
                <tr>
                  <td><div className="cell-main">{r.meter.unit_name ?? r.meter.area}</div><div className="cell-sub">{meterKind(r.meter.kind)} · <span className="mono">{r.meter.serial}</span>{r.meter.multiplier !== "1" && ` · ×${num(r.meter.multiplier)}`}{r.meter.status !== "active" && ` · ${meterStatus(r.meter.status)}`}</div></td>
                  <td className="right num">{r.last?.value ? `${num(r.last.value)} ${r.meter.unit_label}` : "—"}</td>
                  <td className="right num">{r.reading?.value ? <>{num(r.reading.value)}{r.reading.consumption && <div className="cell-sub">tüketim {num(r.reading.consumption)}{r.reading.anomaly_percent != null && ` (%${r.reading.anomaly_percent})`}</div>}</> : "—"}{r.reading?.photo_id && <div><OpPhoto id={r.reading.photo_id} alt={`${r.meter.serial} sayaç fotoğrafı`} /></div>}</td>
                  <td>{r.reading ? <><Badge tone={readingTone(r.reading.status)}>{readingStatus(r.reading.status)}</Badge>{r.reading.reason && <div className="cell-sub">{r.reading.reason}</div>}</> : <Badge>Okunmadı</Badge>}</td>
                  <td className="right nowrap">{r.reading?.status === "anomaly" ? <AnomalyActions id={r.reading.id} /> : !r.reading && <button className="btn btn--sm" type="button" aria-expanded={reading === r.meter.id} onClick={() => setReading((v) => (v === r.meter.id ? null : r.meter.id))}>Oku</button>}</td>
                </tr>
                {reading === r.meter.id && <tr><td colSpan={5}><ReadForm meter={r.meter} period={s.donem} prev={r.last?.value ?? null} onDone={() => setReading(null)} /></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
      <p className="small muted">Okumalar şimdilik tahakkuka beslenmez — merkezi ısınma tüketimi pilot sonrası (K14). Excel ile okuma aktarımı sonraki adım.</p>
    </div>
  );
}

function MeterSettings({ value, onDone }: { value: OpSettings; onDone: () => void }) {
  const [pct, setPct] = useState(String(value.meter_anomaly_percent));
  const [photo, setPhoto] = useState(value.meter_photo_required);
  const m = useSiteMutation<Record<string, unknown>, OpSettings>("PUT", "/operation-settings", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ meter_anomaly_percent: Number(pct), meter_photo_required: photo }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="row" style={{ gap: "var(--s-4)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Sapma eşiği (%)" hint="Önceki döneme göre bu orandan fazla değişen tüketim onaya düşer." error={fieldError(m.error, "meter_anomaly_percent")}>{(p) => <input {...p} className="field__input" style={{ maxWidth: "8rem" }} inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, ""))} />}</Field>
          <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /><span>Okumada sayaç fotoğrafı zorunlu</span></label>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function MeterForm({ onDone }: { onDone: () => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ kind: "cold_water", serial: "", area: "", multiplier: "1", installed_on: "" });
  const m = useSiteMutation<Record<string, unknown>, Meter>("POST", "/meters", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ kind: f.kind, serial: f.serial, unit_id: f.kind === "common" ? null : unit?.id ?? null, area: f.kind === "common" || !unit ? f.area || null : null, multiplier: f.multiplier.replace(",", ".") || "1", installed_on: f.installed_on || null }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Tip" error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{["cold_water", "hot_water", "heat", "electric", "gas", "common"].map((k) => <option key={k} value={k}>{meterKind(k)}</option>)}</select>}</Field>
          <Field label="Seri no" required error={fieldError(m.error, "serial")}>{(p) => <input {...p} className="field__input mono" value={f.serial} onChange={(e) => setF((x) => ({ ...x, serial: e.target.value }))} />}</Field>
          {f.kind !== "common" ? <UnitPicker label="Bölüm" value={unit} onChange={setUnit} error={fieldError(m.error, "unit_id")} /> : <Field label="Ortak alan" required error={fieldError(m.error, "unit_id")}>{(p) => <input {...p} className="field__input" value={f.area} onChange={(e) => setF((x) => ({ ...x, area: e.target.value }))} />}</Field>}
          <Field label="Çarpan" error={fieldError(m.error, "multiplier")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.multiplier} onChange={(e) => setF((x) => ({ ...x, multiplier: e.target.value }))} />}</Field>
          <Field label="Kurulum tarihi">{(p) => <input {...p} className="field__input" type="date" max={todayIso()} value={f.installed_on} onChange={(e) => setF((x) => ({ ...x, installed_on: e.target.value }))} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Ekle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ReadForm({ meter, period, prev, onDone }: { meter: Meter; period: string; prev: string | null; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState("");
  const [replaced, setReplaced] = useState(false);
  const [rep, setRep] = useState({ old_final: "", new_serial: "", new_initial: "0" });
  const m = useSiteMutation<Record<string, unknown>, Schemas["MeterReadingOut"]>("POST", "/meter-readings", { onSuccess: onDone });
  const dot = (v: string) => v.replace(",", ".");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (unreadable) m.mutate({ meter_id: meter.id, period, unreadable_reason: unreadable });
    else m.mutate({ meter_id: meter.id, period, value: dot(value), photo, replacement: replaced ? { old_final: dot(rep.old_final), new_serial: rep.new_serial, new_initial: dot(rep.new_initial) } : null });
  }
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label={replaced ? `Yeni sayacın endeksi (${meter.unit_label})` : `Endeks (${meter.unit_label})`} hint={prev && !replaced ? `Önceki: ${num(prev)}` : undefined} error={fieldError(m.error, "value")}>{(p) => <input {...p} className="field__input" inputMode="decimal" style={{ maxWidth: "10rem" }} disabled={!!unreadable} value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
        <div><PhotoInput label="Sayaç fotoğrafı" value={photo} onChange={setPhoto} />{fieldError(m.error, "photo") && <span className="field__error" role="alert">{fieldError(m.error, "photo")}</span>}</div>
        <Field label="Okunamadı">{(p) => <select {...p} className="field__input" value={unreadable} onChange={(e) => setUnreadable(e.target.value)}><option value="">—</option><option value="Evde yok">Evde yok</option><option value="Sayaç erişilemez">Sayaç erişilemez</option><option value="Arızalı">Arızalı</option></select>}</Field>
      </div>
      {!unreadable && <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={replaced} onChange={(e) => setReplaced(e.target.checked)} /><span>Sayaç değişti</span></label>}
      {replaced && !unreadable && (
        <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Eski sayacın son endeksi" required hint={prev ? `Önceki okuma: ${num(prev)}` : undefined} error={fieldError(m.error, "replacement.old_final")}>{(p) => <input {...p} className="field__input" inputMode="decimal" style={{ maxWidth: "10rem" }} value={rep.old_final} onChange={(e) => setRep((x) => ({ ...x, old_final: e.target.value }))} />}</Field>
          <Field label="Yeni sayacın seri no" required error={fieldError(m.error, "replacement.new_serial")}>{(p) => <input {...p} className="field__input mono" value={rep.new_serial} onChange={(e) => setRep((x) => ({ ...x, new_serial: e.target.value }))} />}</Field>
          <Field label="Yeni sayacın ilk endeksi" required error={fieldError(m.error, "replacement.new_initial")}>{(p) => <input {...p} className="field__input" inputMode="decimal" style={{ maxWidth: "10rem" }} value={rep.new_initial} onChange={(e) => setRep((x) => ({ ...x, new_initial: e.target.value }))} />}</Field>
        </div>
      )}
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!value && !unreadable}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function AnomalyActions({ id }: { id: string }) {
  const ok = useSiteMutation<Record<string, never>, unknown>("POST", `/meter-readings/${id}/approve`);
  const re = useSiteMutation<Record<string, never>, unknown>("POST", `/meter-readings/${id}/reread`);
  return <><button className="btn btn--sm btn--primary" type="button" disabled={ok.isPending} onClick={() => ok.mutate({})}>Onayla</button>{" "}<button className="btn btn--ghost btn--sm" type="button" disabled={re.isPending} onClick={() => re.mutate({})}>Yeniden oku</button></>;
}

// ===================================================================== 58 Görevler
/** Görevli rutin görevleri (OPS-06, K29): şablondan günlük görev; fotoğraf zorunluysa fotoğrafsız tamamlanmaz; haftalık oran. */
export function TasksPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ sekme: "bugun", tarih: todayIso() });
  const items: [string, string][] = [["bugun", "Günün görevleri"], ["benim", "Görevlerim"], ["sablon", "Görev şablonları"], ["rapor", "Haftalık rapor"]];
  return (
    <div className="stack">
      <PageHead title="Rutin görevler" subtitle="Çöp, temizlik, havuz kontrolü gibi işler şablondan her gün üretilir; saat aralığı geçince 'gecikti'." />
      {tabs(items, s.sekme, (k) => set({ sekme: k }), "Görevler")}
      {s.sekme === "sablon" ? <TaskTemplates canManage={can(P.requestsAssign)} /> : s.sekme === "rapor" ? <TaskReportCard /> : <DayTasks mine={s.sekme === "benim"} date={s.tarih} setDate={(tarih) => set({ tarih })} />}
    </div>
  );
}

function DayTasks({ mine, date, setDate }: { mine: boolean; date: string; setDate: (d: string) => void }) {
  const base = mine ? "/me/tasks" : "/tasks";
  const q = useSiteGet<TaskRow[]>(base, { date }, { refetchInterval: 60000 });
  return (
    <>
      <div className="filters"><div className="field"><label className="field__label" htmlFor="tk-d">Gün</label><input id="tk-d" className="field__input" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty title={mine ? "Bu gün size atanmış görev yok" : "Bu gün görev yok"} icon={<ListTodo aria-hidden="true" />}>{mine ? "Görevler personel kartınıza atandığında burada görünür." : "Görev şablonu ekleyin."}</Empty> : (
        <div className="stack" style={{ gap: "var(--s-2)" }}>{q.data.map((t) => <TaskCard key={t.template.id} t={t} date={date} base={base} />)}</div>
      )}
    </>
  );
}

function TaskCard({ t, date, base }: { t: TaskRow; date: string; base: string }) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const m = useSiteMutation<Record<string, unknown>, Schemas["TaskCompletionOut"]>("POST", `${base}/${t.template.id}/complete`, { onSuccess: () => setOpen(false) });
  const closable = date <= todayIso();
  return (
    <div className="card"><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <div><span className="strong">{t.template.name}</span> <span className="small muted">{t.template.time_from}–{t.template.time_to}{t.template.location && ` · ${t.template.location}`} · {t.template.staff_name ?? t.template.assignee}</span>{t.template.description && <div className="small">{t.template.description}</div>}</div>
        <Badge tone={taskTone(t.status)}>{taskStatus(t.status)}</Badge>
      </div>
      {t.done && <div className="small muted row" style={{ gap: "var(--s-2)", alignItems: "center" }}><span>{t.done.by}, {formatDateTime(t.done.at)}{t.done.reason && ` · neden: ${t.done.reason}`}{t.done.note && ` · ${t.done.note}`}</span>{t.done.photo_id && <OpPhoto id={t.done.photo_id} alt={`${t.template.name} fotoğrafı`} />}</div>}
      {!t.done && closable && (open ? (
        <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ date, status: reason ? "failed" : "done", reason: reason || null, note: note || null, photo }); }}>
          <FormError error={m.error} />
          <PhotoInput required={t.template.photo_required} value={photo} onChange={setPhoto} error={fieldError(m.error, "photo")} />
          <div className="grid grid--2">
            <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <Field label="Tamamlanamadıysa nedeni" error={fieldError(m.error, "reason")}>{(p) => <select {...p} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">—</option><option>Malzeme yok</option><option>Alana erişilemedi</option><option>Başka acil iş</option><option>Hava koşulları</option></select>}</Field>
          </div>
          <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!reason && t.template.photo_required && !photo}>{reason ? "Tamamlanamadı olarak kaydet" : "Tamamlandı"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Vazgeç</button></div>
          {!reason && t.template.photo_required && !photo && <span className="xs muted">Bu görev fotoğrafsız tamamlanamaz.</span>}
        </form>
      ) : <div><button className="btn btn--sm btn--primary" type="button" onClick={() => setOpen(true)}>Kapat</button></div>)}
    </div></div>
  );
}

const TASK_EMPTY = { name: "", description: "", frequency: "daily", weekdays: [0, 1, 2, 3, 4] as number[], month_day: "1", time_from: "08:00", time_to: "10:00", location: "", assignee: "Görevli", staff_member_id: "", photo_required: false, checklist_template_id: "" };
function TaskTemplates({ canManage }: { canManage: boolean }) {
  const q = useSiteGet<TaskT[]>("/task-templates");
  const staff = useSiteGet<StaffMember[]>("/staff", { active: "true" }, { enabled: canManage });
  const chk = useSiteGet<ChkTemplate[]>("/checklist-templates", undefined, { enabled: canManage });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(TASK_EMPTY);
  const m = useSiteMutation<Record<string, unknown>, TaskT>("POST", "/task-templates", { onSuccess: () => { setOpen(false); setF(TASK_EMPTY); } });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const person = (staff.data ?? []).find((x) => x.id === f.staff_member_id);
    m.mutate({ ...f, month_day: Number(f.month_day), description: f.description || null, location: f.location || null, staff_member_id: f.staff_member_id || null, assignee: person && (!f.assignee || f.assignee === "Görevli") ? person.full_name : f.assignee, checklist_template_id: f.checklist_template_id || null });
  }
  return (
    <>
      {canManage && <div className="row"><button className="btn btn--primary" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Plus aria-hidden="true" /> Görev ekle</button></div>}
      {open && (
        <form className="card" noValidate onSubmit={submit}>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={m.error} />
            <div className="grid grid--kpi">
              <Field label="Görev" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. Çöplerin toplanması" value={f.name} onChange={up("name")} />}</Field>
              <Field label="Sıklık" error={fieldError(m.error, "frequency")}>{(p) => <select {...p} className="field__input" value={f.frequency} onChange={up("frequency")}>{["daily", "weekdays", "monthly"].map((k) => <option key={k} value={k}>{taskFrequency(k)}</option>)}</select>}</Field>
              {f.frequency === "monthly" && <Field label="Ayın günü" error={fieldError(m.error, "month_day")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.month_day} onChange={up("month_day")} />}</Field>}
              <Field label="Başlangıç">{(p) => <input {...p} className="field__input" type="time" value={f.time_from} onChange={up("time_from")} />}</Field>
              <Field label="Bitiş" error={fieldError(m.error, "time_to")}>{(p) => <input {...p} className="field__input" type="time" value={f.time_to} onChange={up("time_to")} />}</Field>
              <Field label="Konum">{(p) => <input {...p} className="field__input" value={f.location} onChange={up("location")} />}</Field>
              <Field label="Personel" hint="Seçilirse görev kişinin 'Görevlerim' listesine düşer (K29)." error={fieldError(m.error, "staff_member_id")}>{(p) => <select {...p} className="field__input" value={f.staff_member_id} onChange={up("staff_member_id")}><option value="">— rol / ekip —</option>{(staff.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name} · {x.position}</option>)}</select>}</Field>
              <Field label="Rol / kişi" required error={fieldError(m.error, "assignee")}>{(p) => <input {...p} className="field__input" value={f.assignee} onChange={up("assignee")} />}</Field>
              <Field label="Denetim listesi">{(p) => <select {...p} className="field__input" value={f.checklist_template_id} onChange={up("checklist_template_id")}><option value="">—</option>{(chk.data ?? []).filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
            </div>
            {f.frequency === "weekdays" && <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>{WEEKDAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={f.weekdays.includes(i)} onChange={(e) => setF((x) => ({ ...x, weekdays: e.target.checked ? [...x.weekdays, i].sort() : x.weekdays.filter((w) => w !== i) }))} /><span>{d}</span></label>)}{fieldError(m.error, "weekdays") && <span className="field__error" role="alert">{fieldError(m.error, "weekdays")}</span>}</div>}
            <Field label="Açıklama">{(p) => <input {...p} className="field__input" maxLength={200} value={f.description} onChange={up("description")} />}</Field>
            <label className="check"><input type="checkbox" checked={f.photo_required} onChange={(e) => setF((x) => ({ ...x, photo_required: e.target.checked }))} /><span>Fotoğraf zorunlu</span></label>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Vazgeç</button></div>
        </form>
      )}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Görev şablonu yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Görev şablonları</caption>
            <thead><tr><th scope="col">Görev</th><th scope="col">Sıklık</th><th scope="col">Saat</th><th scope="col">Atanan</th>{canManage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id}><td className="cell-main">{t.name}{!t.is_active && <> <Badge>Pasif</Badge></>}{t.photo_required && <div className="cell-sub">fotoğraf zorunlu</div>}</td><td className="small">{taskFrequency(t.frequency)}{t.frequency === "weekdays" && ` (${t.weekdays.map((d) => WEEKDAYS[d]).join(", ")})`}{t.frequency === "monthly" && ` (${t.month_day}.)`}</td><td className="small mono">{t.time_from}–{t.time_to}</td><td className="small">{t.staff_name ?? t.assignee}{t.staff_name && t.assignee !== t.staff_name && <div className="cell-sub">{t.assignee}</div>}</td>{canManage && <td className="right"><ToggleTask t={t} /></td>}</tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}
function ToggleTask({ t }: { t: TaskT }) {
  const m = useSiteMutation<{ is_active: boolean }, TaskT>("PATCH", `/task-templates/${t.id}`);
  return <button className="btn btn--ghost btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ is_active: !t.is_active })}>{t.is_active ? "Pasifleştir" : "Etkinleştir"}</button>;
}

function TaskReportCard() {
  const q = useSiteGet<TaskReport>("/tasks/report");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Son 7 gün</span><span className="card__meta ml-auto">{formatDate(q.data.from)} – {formatDate(q.data.to)} · genel %{q.data.rate ?? "—"}</span></div>
      <div className="card__body card__body--flush">
        {q.data.rows.length === 0 ? <Empty title="Görev yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Görev tamamlanma oranı</caption>
            <thead><tr><th scope="col">Görev</th><th scope="col">Atanan</th><th scope="col" className="right">Beklenen</th><th scope="col" className="right">Tamamlanan</th><th scope="col" className="right">Tamamlanamadı</th><th scope="col" className="right">Oran</th></tr></thead>
            <tbody>{q.data.rows.map((r) => <tr key={r.template_id}><td className="cell-main">{r.name}</td><td className="small">{r.assignee}</td><td className="right num">{r.expected}</td><td className="right num">{r.done}</td><td className="right num">{r.failed}</td><td className="right">{r.rate == null ? "—" : <Badge tone={r.rate >= 90 ? "ok" : r.rate >= 70 ? "warn" : "danger"}>%{r.rate}</Badge>}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
      <div className="card__foot small muted">Dış firma personeline atanan görevlerin oranı sözleşme KPI'ı olarak kullanılabilir (satın alma ve sözleşme paketiyle).</div>
    </div>
  );
}

// ===================================================================== 54 Stok sayımı
/** Stok sayımı (OPS-02): sayılan miktar girilir; fark düzeltme hareketi olarak yazılır — onay kuralı varsa onaydan sonra. */
export function StockCount() {
  const { can } = useSite();
  const items = useSiteGet<StockItem[]>("/stock-items");
  const hist = useSiteGet<StockCountRow[]>("/stock-counts");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const m = useSiteMutation<{ lines: { item_id: string; counted: string }[] }, StockCountRow>("POST", "/stock-counts", { onSuccess: () => setCounts({}) });
  const low = (items.data ?? []).filter((i) => i.is_low);
  const canManage = can(P.inventoryManage);
  return (
    <div className="stack">
      {low.length > 0 && <Alert tone="warn" title="Asgari seviyenin altında">{low.map((i) => `${i.name} (${num(i.quantity)} ${i.unit_label})`).join(", ")} — satın alma talebi önerilir (satın alma paketiyle).</Alert>}
      {canManage && (
        <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ lines: Object.entries(counts).filter(([, v]) => v !== "").map(([item_id, counted]) => ({ item_id, counted: counted.replace(",", ".") })) }); }}>
          <div className="card__head"><span className="card__title">Sayım</span><span className="card__meta ml-auto">yalnız saydığınız malzemeleri girin</span></div>
          <div className="card__body card__body--flush">
            <FormError error={m.error} />
            {items.isPending ? <Loading /> : items.isError ? <div className="card__body"><ErrorState error={items.error} /></div> : items.data.length === 0 ? <Empty title="Malzeme yok" /> : (
              <div className="table-wrap"><table className="data"><caption className="visually-hidden">Stok sayımı</caption>
                <thead><tr><th scope="col">Malzeme</th><th scope="col" className="right">Sistem</th><th scope="col" className="right">Sayılan</th><th scope="col" className="right">Fark</th></tr></thead>
                <tbody>{items.data.map((i) => { const c = counts[i.id] ?? ""; const d = c === "" ? null : Number(c.replace(",", ".")) - Number(i.quantity); const err = fieldError(m.error, `lines.${i.id}`); return (
                  <tr key={i.id}><td className="cell-main">{i.name}</td><td className="right num">{num(i.quantity)} {i.unit_label}</td>
                    <td className="right"><input className="field__input" style={{ width: "7rem", minHeight: 36, textAlign: "right" }} inputMode="decimal" aria-label={`${i.name} sayılan`} aria-invalid={err ? true : undefined} value={c} onChange={(e) => setCounts((x) => ({ ...x, [i.id]: e.target.value }))} />{err && <div className="field__error" role="alert">{err}</div>}</td>
                    <td className="right num">{d == null || Number.isNaN(d) ? "—" : Math.abs(d) < 0.0005 ? <Badge tone="ok">Yok</Badge> : <Badge tone="warn">{d > 0 ? "+" : ""}{d.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}</Badge>}</td></tr>
                ); })}</tbody>
              </table></div>
            )}
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}><SubmitButton busy={m.isPending} disabled={!Object.values(counts).some((v) => v !== "")}>Sayımı kaydet</SubmitButton><span className="small muted">Fark "Stok sayım farkı" onay kuralına bağlıysa düzeltme hareketi onaydan sonra yazılır; değilse hemen.</span></div>
        </form>
      )}
      {hist.isError && <ErrorState error={hist.error} />}
      {hist.data && hist.data.length > 0 && (
        <div className="card"><div className="card__head"><span className="card__title">Sayım geçmişi</span></div><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
          {hist.data.map((h) => { const diffs = h.lines.filter((l) => Number(l.diff) !== 0); return <div key={h.id} className="small row" style={{ gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}><Badge tone={stockCountTone(h.status)}>{stockCountStatus(h.status)}</Badge><span><strong>{formatDateTime(h.created_at)}</strong> · {h.created_by} · {h.lines.length} kalem{diffs.length > 0 ? ` · fark: ${diffs.map((l) => `${l.name} ${Number(l.diff) > 0 ? "+" : ""}${num(l.diff)}`).join(", ")}` : " · fark yok"}</span></div>; })}
        </div></div>
      )}
    </div>
  );
}
