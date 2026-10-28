import { Fragment, useState, type FormEvent } from "react";
import { AlertTriangle, BarChart3, CalendarClock, CheckCircle2, ClipboardList, FileWarning, Gauge, History, Hourglass, KeyRound, ListTodo, LogOut, Plus, ShieldCheck, Trash2, TriangleAlert, UserCheck, Wallet, Wrench } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { BarChart } from "../../components/charts";
import { PhotoInput } from "../../components/PhotoInput";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, formatMoneyShort, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { WEEKDAYS, claimStatus, claimTone, depositStatus, depositTone, itemType, keyKind, meterKind, policyKind, readingStatus, readingTone, taskFrequency, taskStatus, taskTone } from "../../lib/labels";

/** Servis isteği 53–58'deki şekiller. */
interface KeyRow { id: string; kind: string; code: string; name: string; area: string | null; authorized_roles: string[]; is_active: boolean; loan: { id: string; to_name: string; due_at: string; given_by: string; given_at: string } | null; overdue: boolean }
interface DepKey { id: string; unit_name: string; deposited_by: string; authorized: { name: string; phone: string | null }[]; valid_until: string; note: string | null; status: string; received_by: string | null; handed_to: string | null; handed_at: string | null; created_at: string }
interface ChkItem { text: string; type: "yesno" | "number" | "score"; photo_required: boolean; min?: number | null; max?: number | null }
interface ChkTemplate { id: string; name: string; items: ChkItem[]; is_active: boolean }
interface Inspection { id: string; template_name: string; location: string; answers: { text: string; value: string; ok: boolean; photo: string | null }[]; score: number; failed: number; opened_request_ids: string[]; by: string; at: string }
interface Policy { id: string; kind: string; insurer: string; policy_no: string; coverage: string; premium: string; start: string; end: string; area: string | null; days_left: number; warning: string | null }
interface Claim { id: string; policy_label: string; source: string | null; description: string; incident_date: string; status: string; claimed: string | null; paid: string | null; paid_on: string | null; created_at: string }
interface Meter { id: string; kind: string; serial: string; unit_id: string | null; unit_name: string | null; area: string | null; unit_label: string; multiplier: number; status: string }
interface Reading { id: string; value: string | null; consumption: string | null; prev_value: string | null; status: string; reason: string | null; photo: string | null; by: string; at: string; anomaly_percent: number | null; period: string }
interface ReadRow { meter: Meter; reading: Reading | null; last: Reading | null }
interface TaskT { id: string; name: string; description: string | null; frequency: string; weekdays: number[]; month_day: number | null; time_from: string; time_to: string; location: string | null; assignee: string; photo_required: boolean; is_active: boolean }
interface TaskRow { template: TaskT; done: { status: string; reason: string | null; note: string | null; photo: string | null; by: string; at: string } | null; status: string }

const plusHours = (h: number) => { const d = new Date(Date.now() + h * 3600e3); d.setMinutes(0, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`; };
const ROLES = ["Yönetici", "Teknik Personel", "Güvenlik", "Görevli", "Sakin"];
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="tabs" role="tablist" aria-label={label}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className="tabs__tab" onClick={() => set(k)}>{l}</button>)}</div>
);

// ===================================================================== 53 Anahtar ve emanet
/** Anahtar ve emanet (OPS-01): ortak alan anahtar/kart/kumanda teslim-iade; sakinin bıraktığı emanet anahtar. */
export function KeysPage() {
  const [s, set] = useUrlState({ sekme: "anahtar" });
  return (
    <div className="stack">
      <PageHead title="Anahtar ve emanet" eyebrow="Operasyon" subtitle="Ortak alan anahtarları kimde, ne zaman dönecek; sakinlerin bıraktığı emanet anahtarlar yalnız yetkili kişiye.">
        {tabs([["anahtar", "Anahtarlar"], ["emanet", "Emanet anahtarlar"]], s.sekme, (k) => set({ sekme: k }), "Anahtar")}
      </PageHead>
      {s.sekme === "emanet" ? <Deposits /> : <Keys />}
    </div>
  );
}

function Keys() {
  const q = useSiteGet<KeyRow[]>("/keys");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ kind: "key", code: "", name: "", area: "", authorized_roles: [] as string[] });
  const add = useSiteMutation<Record<string, unknown>, unknown>("POST", "/keys", { onSuccess: () => { setAdding(false); setF({ kind: "key", code: "", name: "", area: "", authorized_roles: [] }); } });
  const out = (q.data ?? []).filter((k) => k.loan).length, late = (q.data ?? []).filter((k) => k.overdue).length;
  return (
    <>
      <div className="grid grid--kpi rise"><Kpi label="Anahtar" icon={<KeyRound aria-hidden="true" />} value={q.data?.length ?? 0} note="kayıtlı anahtar, kart, kumanda" /><Kpi label="Dışarıda" icon={<LogOut aria-hidden="true" />} tone={out ? "accent" : undefined} value={out} note="teslim edilmiş, iade bekleniyor" /><Kpi label="İadesi gecikmiş" icon={<AlertTriangle aria-hidden="true" />} value={late} tone={late ? "danger" : undefined} note="iade zamanı geçti" /></div>
      <div className="row"><button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Anahtar ekle</button></div>
      {adding && (
        <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); add.mutate({ ...f, area: f.area.trim() || null }); }}>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={add.error} />
            <div className="grid grid--kpi">
              <Field label="Tip">{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{["key", "card", "remote"].map((k) => <option key={k} value={k}>{keyKind(k)}</option>)}</select>}</Field>
              <Field label="Kod" required error={fieldError(add.error, "code")}>{(p) => <input {...p} className="field__input mono" maxLength={20} placeholder="ör. ANH-01" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value }))} />}</Field>
              <Field label="Ad" required error={fieldError(add.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. Toplantı salonu" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
              <Field label="Alan / bölüm">{(p) => <input {...p} className="field__input" maxLength={60} value={f.area} onChange={(e) => setF((x) => ({ ...x, area: e.target.value }))} />}</Field>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Yetkili roller (boş: herkes)</legend><div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>{ROLES.map((r) => <label key={r} className="check"><input type="checkbox" checked={f.authorized_roles.includes(r)} onChange={(e) => setF((x) => ({ ...x, authorized_roles: e.target.checked ? [...x.authorized_roles, r] : x.authorized_roles.filter((y) => y !== r) }))} /><span>{r}</span></label>)}</div></fieldset>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={add.isPending}>Ekle</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setAdding(false)}>Vazgeç</button></div>
        </form>
      )}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><KeyRound aria-hidden="true" /></span><span className="card__title">Anahtarlar</span>{q.data && <span className="card__meta ml-auto">{q.data.length} kayıt</span>}</div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Anahtar kaydı yok" icon={<KeyRound aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Anahtarlar</caption>
            <thead><tr><th scope="col">Anahtar</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((k) => (
              <tr key={k.id}>
                <td><div className="cell-main">{k.name}</div><div className="cell-sub"><span className="mono">{k.code}</span> · {keyKind(k.kind)}{k.area && ` · ${k.area}`}{k.authorized_roles.length > 0 && ` · yetkili: ${k.authorized_roles.join(", ")}`}</div></td>
                <td className="small">{k.loan ? <>{k.overdue ? <Badge tone="danger">İadesi gecikti</Badge> : <Badge tone="info">Dışarıda</Badge>} {k.loan.to_name}<div className="cell-sub">iade {formatDateTime(k.loan.due_at)}</div></> : <Badge tone="ok">Yerinde</Badge>}</td>
                <td className="right nowrap">{k.loan ? <ReturnKey id={k.loan.id} /> : <GiveKey k={k} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function GiveKey({ k }: { k: KeyRow }) {
  const [f, setF] = useState({ to_name: "", to_phone: "", due_at: plusHours(2), role: k.authorized_roles[0] ?? "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/keys/${k.id}/loans`);
  return (
    <ConfirmButton className="btn btn--sm" title={`${k.name} — teslim et`} confirmLabel="Teslim et"
      body={<div className="stack" style={{ gap: "var(--s-3)" }}>
        <div className="field"><label className="field__label" htmlFor={`kn-${k.id}`}>Teslim alan *</label><input id={`kn-${k.id}`} className="field__input" value={f.to_name} onChange={(e) => setF((x) => ({ ...x, to_name: e.target.value }))} /></div>
        {k.authorized_roles.length > 0 && <div className="field"><label className="field__label" htmlFor={`kr-${k.id}`}>Rolü</label><select id={`kr-${k.id}`} className="field__input" value={f.role} onChange={(e) => setF((x) => ({ ...x, role: e.target.value }))}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>}
        <div className="field"><label className="field__label" htmlFor={`kd-${k.id}`}>İade zamanı *</label><input id={`kd-${k.id}`} className="field__input" type="datetime-local" value={f.due_at} onChange={(e) => setF((x) => ({ ...x, due_at: e.target.value }))} /></div>
      </div>}
      onConfirm={() => m.mutateAsync({ ...f, due_at: new Date(f.due_at).toISOString() })}>Teslim et</ConfirmButton>
  );
}
function ReturnKey({ id }: { id: string }) {
  const m = useSiteMutation<Record<string, never>, unknown>("POST", `/key-loans/${id}/return`);
  return <button className="btn btn--sm btn--primary" type="button" disabled={m.isPending} onClick={() => m.mutate({})}>İade alındı</button>;
}

function Deposits() {
  const q = useSiteGet<DepKey[]>("/deposited-keys");
  const n = (st: string) => (q.data ?? []).filter((d) => d.status === st).length;
  return (
    <>
    {q.data ? (
      <div className="grid grid--kpi rise">
        <Kpi label="Teslim bekleniyor" tone={n("requested") ? "warn" : undefined} icon={<Hourglass aria-hidden="true" />} value={n("requested")} note="sakin bildirdi, anahtar gelmedi" />
        <Kpi label="Emanette" tone="accent" icon={<KeyRound aria-hidden="true" />} value={n("held")} note="güvenlikte duran anahtar" />
        <Kpi label="Yetkiliye verilen" icon={<UserCheck aria-hidden="true" />} value={n("handed")} note="kimlik kontrolüyle teslim" />
      </div>
    ) : <div className="grid grid--kpi">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><KeyRound aria-hidden="true" /></span><span className="card__title">Emanet anahtarlar</span>{q.data && <span className="card__meta ml-auto">{q.data.length} kayıt</span>}</div>
      <div className="card__body card__body--flush">
      {q.isPending ? <Loading /> : !q.data || q.data.length === 0 ? <Empty title="Emanet anahtar yok" icon={<KeyRound aria-hidden="true" />}>Sakin uygulamada "Emanet anahtar" bırakır; anahtarı getirdiğinde teslim alın.</Empty> : (
        <div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Emanet anahtarlar</caption>
          <thead><tr><th scope="col">Bölüm</th><th scope="col">Yetkili kişiler</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
          <tbody>{q.data.map((d) => (
            <tr key={d.id}>
              <td className="cell-main">{d.unit_name}<div className="cell-sub">{d.deposited_by} · {formatDate(d.valid_until)} tarihine kadar</div>{d.note && <div className="cell-sub">{d.note}</div>}</td>
              <td className="small">{d.authorized.map((a) => a.name).join(", ")}</td>
              <td><Badge tone={depositTone(d.status)}>{depositStatus(d.status)}</Badge>{d.handed_to && <div className="cell-sub">{d.handed_to}, {formatDateTime(d.handed_at)}</div>}</td>
              <td className="right nowrap"><DepositActions d={d} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div></div>
    </>
  );
}
function DepositActions({ d }: { d: DepKey }) {
  const [name, setName] = useState(d.authorized[0]?.name ?? "");
  const [idc, setIdc] = useState(false);
  const recv = useSiteMutation<Record<string, never>, unknown>("POST", `/deposited-keys/${d.id}/receive`);
  const hand = useSiteMutation<{ name: string; id_checked: boolean }, unknown>("POST", `/deposited-keys/${d.id}/hand`);
  const ret = useSiteMutation<Record<string, never>, unknown>("POST", `/deposited-keys/${d.id}/return`);
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
  return null;
}

// ===================================================================== 55 Denetim listeleri
/** Denetim listeleri (OPS-03): şablondan saha denetimi; olumsuz madde talep açar; skor. */
export function InspectionsPage() {
  const [s, set] = useUrlState({ sekme: "yeni" });
  const iq = useSiteGet<Inspection[]>("/inspections");
  const tq = useSiteGet<ChkTemplate[]>("/checklist-templates");
  const list = iq.data ?? [];
  const avg = list.length ? Math.round(list.reduce((a, x) => a + x.score, 0) / list.length) : null;
  const failed = list.reduce((a, x) => a + x.failed, 0);
  const opened = list.reduce((a, x) => a + x.opened_request_ids.length, 0);
  return (
    <div className="stack">
      <PageHead title="Denetim listeleri" eyebrow="Operasyon" subtitle="Temizlik, havuz hijyeni, taşınma hasar kontrolü… Olumsuz madde otomatik talep açar.">
        {tabs([["yeni", "Denetim yap"], ["gecmis", "Geçmiş"], ["sablon", "Şablonlar"]], s.sekme, (k) => set({ sekme: k }), "Denetim")}
      </PageHead>
      {iq.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Yapılan denetim" icon={<ClipboardList aria-hidden="true" />} value={list.length} note={tq.data ? `${tq.data.filter((t) => t.is_active).length} etkin şablon` : undefined} />
          <Kpi label="Ortalama skor" tone={avg == null ? undefined : avg >= 90 ? "ok" : avg >= 70 ? "warn" : "danger"} icon={<Gauge aria-hidden="true" />} value={avg == null ? "—" : `%${avg}`} note="tüm denetimlerin ortalaması" />
          <Kpi label="Olumsuz madde" tone={failed ? "warn" : "ok"} icon={<TriangleAlert aria-hidden="true" />} value={failed} note="uygun bulunmayan madde" />
          <Kpi label="Açılan talep" icon={<Wrench aria-hidden="true" />} value={opened} note="olumsuz maddeden otomatik" />
        </div>
      ) : !iq.isError && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {s.sekme === "gecmis" ? <InspectionHistory /> : s.sekme === "sablon" ? <ChkTemplates /> : <NewInspection />}
    </div>
  );
}

function NewInspection() {
  const tq = useSiteGet<ChkTemplate[]>("/checklist-templates");
  const [tid, setTid] = useState("");
  const [loc, setLoc] = useState("");
  const [ans, setAns] = useState<{ value: string; photo: string | null }[]>([]);
  const t = (tq.data ?? []).find((x) => x.id === (tid || tq.data?.[0]?.id));
  const m = useSiteMutation<Record<string, unknown>, Inspection>("POST", "/inspections", { onSuccess: () => { setAns([]); setLoc(""); } });
  if (!tq.data) return <Loading />;
  const setA = (i: number, patch: Partial<{ value: string; photo: string | null }>) => setAns((a) => { const n = [...a]; n[i] = { value: "", photo: null, ...n[i], ...patch }; return n; });
  function submit(e: FormEvent) { e.preventDefault(); if (t) m.mutate({ template_id: t.id, location: loc.trim(), answers: t.items.map((_, i) => ans[i] ?? { value: "", photo: null }) }); }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__head"><span className="card__icon card__icon--accent"><ClipboardList aria-hidden="true" /></span><span className="card__title">Yeni denetim</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Şablon">{(p) => <select {...p} className="field__input" value={t?.id ?? ""} onChange={(e) => { setTid(e.target.value); setAns([]); }}>{tq.data.filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
          <Field label="Konum" required error={fieldError(m.error, "location")}>{(p) => <input {...p} className="field__input" maxLength={80} placeholder="ör. A blok giriş" value={loc} onChange={(e) => setLoc(e.target.value)} />}</Field>
        </div>
        {t?.items.map((it, i) => (
          <div key={i} className="stack" style={{ gap: "var(--s-2)", borderTop: "1px solid var(--line)", paddingTop: "var(--s-3)" }}>
            <div className="strong small">{i + 1}. {it.text}{it.type === "number" && (it.min != null || it.max != null) && <span className="muted"> (uygun aralık {it.min ?? "—"}–{it.max ?? "—"})</span>}</div>
            {it.type === "yesno" ? (
              <div className="row" style={{ gap: "var(--s-3)" }}>{[["yes", "Evet"], ["no", "Hayır"]].map(([v, l]) => <label key={v} className="check"><input type="radio" name={`a-${i}`} checked={ans[i]?.value === v} onChange={() => setA(i, { value: v! })} /><span>{l}</span></label>)}</div>
            ) : it.type === "score" ? (
              <div className="row" style={{ gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`btn btn--sm${ans[i]?.value === String(n) ? " btn--primary" : ""}`} aria-pressed={ans[i]?.value === String(n)} onClick={() => setA(i, { value: String(n) })}>{n}</button>)}</div>
            ) : (
              <input className="field__input" style={{ maxWidth: "10rem" }} inputMode="decimal" aria-label={it.text} value={ans[i]?.value ?? ""} onChange={(e) => setA(i, { value: e.target.value })} />
            )}
            {(it.photo_required || ans[i]?.value === "no") && <PhotoInput required={it.photo_required} value={ans[i]?.photo ?? null} onChange={(v) => setA(i, { photo: v })} />}
            {fieldError(m.error, `answers.${i}`) && <span className="field__error" role="alert">{fieldError(m.error, `answers.${i}`)}</span>}
          </div>
        ))}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!t}>Denetimi kaydet</SubmitButton><span className="small muted">Olumsuz maddeler için talep açılır.</span></div>
    </form>
  );
}

function InspectionHistory() {
  const q = useSiteGet<Inspection[]>("/inspections");
  const [open, setOpen] = useState<string | null>(null);
  // Son 8 denetimin skoru, eskiden yeniye (liste yeniden eskiye geliyor)
  const recent = (q.data ?? []).slice(0, 8).reverse();
  return (
    <>
    {recent.length > 1 && (
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span><span className="card__title">Son denetimlerin skoru</span><span className="card__meta ml-auto">son {recent.length} denetim</span></div>
        <div className="card__body ops-chart">
          <BarChart label="Son denetim skorları" data={recent.map((x) => ({ label: formatDate(x.at).slice(0, 5), value: x.score, sub: x.template_name }))} format={(v) => `%${Math.round(v)}`} highlight={recent.length - 1} compact />
        </div>
      </div>
    )}
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><ClipboardList aria-hidden="true" /></span><span className="card__title">Denetim geçmişi</span>{q.data && <span className="card__meta ml-auto">{q.data.length} denetim</span>}</div>
      <div className="card__body card__body--flush">
      {!q.data ? <Loading /> : q.data.length === 0 ? <Empty title="Denetim yok" icon={<ClipboardList aria-hidden="true" />} /> : (
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
              {open === x.id && <tr><td colSpan={4}>{x.answers.map((a, i) => <div key={i} className="row small" style={{ gap: "var(--s-2)", alignItems: "center", padding: "2px 0" }}><Badge tone={a.ok ? "ok" : "danger"}>{a.ok ? "Uygun" : "Olumsuz"}</Badge> {a.text}: <strong>{a.value === "yes" ? "Evet" : a.value === "no" ? "Hayır" : a.value}</strong>{a.photo && <img src={a.photo} alt={`${a.text} fotoğrafı`} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />}</div>)}</td></tr>}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
    </div></div>
    </>
  );
}

function ChkTemplates() {
  const q = useSiteGet<ChkTemplate[]>("/checklist-templates");
  const [f, setF] = useState<{ name: string; items: ChkItem[] }>({ name: "", items: [{ text: "", type: "yesno", photo_required: false }] });
  const [open, setOpen] = useState(false);
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/checklist-templates", { onSuccess: () => { setOpen(false); setF({ name: "", items: [{ text: "", type: "yesno", photo_required: false }] }); } });
  const upd = (i: number, p: Partial<ChkItem>) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));
  return (
    <>
      <div className="row"><button className="btn btn--primary" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Plus aria-hidden="true" /> Şablon ekle</button></div>
      {open && (
        <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f as unknown as Record<string, unknown>); }}>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={m.error} />
            <Field label="Şablon adı" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
            {f.items.map((it, i) => (
              <div key={i} className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="field" style={{ flex: "2 1 14rem" }}><label className="field__label" htmlFor={`ci-${i}`}>{i + 1}. madde</label><input id={`ci-${i}`} className="field__input" value={it.text} onChange={(e) => upd(i, { text: e.target.value })} /></div>
                <div className="field" style={{ flex: "1 1 8rem" }}><label className="field__label" htmlFor={`ct-${i}`}>Tip</label><select id={`ct-${i}`} className="field__input" value={it.type} onChange={(e) => upd(i, { type: e.target.value as ChkItem["type"] })}>{["yesno", "number", "score"].map((k) => <option key={k} value={k}>{itemType(k)}</option>)}</select></div>
                <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={it.photo_required} onChange={(e) => upd(i, { photo_required: e.target.checked })} /><span>Fotoğraf zorunlu</span></label>
                {f.items.length > 1 && <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={`${i + 1}. maddeyi kaldır`} onClick={() => setF((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}><Trash2 aria-hidden="true" /></button>}
              </div>
            ))}
            {fieldError(m.error, "items") && <span className="field__error">{fieldError(m.error, "items")}</span>}
            <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setF((x) => ({ ...x, items: [...x.items, { text: "", type: "yesno", photo_required: false }] }))}><Plus aria-hidden="true" /> Madde</button></div>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Vazgeç</button></div>
        </form>
      )}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><ListTodo aria-hidden="true" /></span><span className="card__title">Denetim şablonları</span>{q.data && <span className="card__meta ml-auto">{q.data.length} şablon</span>}</div>
        <div className="card__body card__body--flush">
        {!q.data ? <Loading /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Denetim şablonları</caption>
            <thead><tr><th scope="col">Şablon</th><th scope="col" className="right">Madde</th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id}><td><div className="cell-main">{t.name}</div><div className="cell-sub">{t.items.map((i) => i.text).join(" · ")}</div></td><td className="right num">{t.items.length}</td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

// ===================================================================== 56 Sigorta
/** Sigorta, poliçe ve hasar (OPS-04): poliçe bitişinden 60/30 gün önce uyarı; hasar dosyası ve tazminat. */
export function InsurancePage() {
  const pq = useSiteGet<Policy[]>("/insurance-policies");
  const cq = useSiteGet<Claim[]>("/insurance-claims");
  const [adding, setAdding] = useState<"policy" | "claim" | null>(null);
  const warn = (pq.data ?? []).filter((p) => p.warning);
  return (
    <div className="stack">
      <PageHead title="Sigorta ve hasar" eyebrow="Yönetim" subtitle="Poliçelerin bitişini kaçırmayın; hasar dosyalarını ve tazminatı izleyin." actions={<><button className="btn" type="button" onClick={() => setAdding("claim")} disabled={!pq.data?.length}>Hasar dosyası aç</button><button className="btn btn--primary" type="button" onClick={() => setAdding("policy")}><Plus aria-hidden="true" /> Poliçe ekle</button></>} />
      {pq.data && cq.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Geçerli poliçe" tone="ok" icon={<ShieldCheck aria-hidden="true" />} value={pq.data.filter((p) => p.days_left >= 0).length} note={`${pq.data.length} kayıtlı poliçe`} />
          <Kpi label="Bitişi yaklaşan" tone={warn.length ? "warn" : undefined} icon={<CalendarClock aria-hidden="true" />} value={warn.length} note="60 gün içinde ya da süresi doldu" />
          <Kpi label="Toplam prim" icon={<Wallet aria-hidden="true" />} value={formatMoneyShort(pq.data.reduce((a, p) => a + Number(p.premium), 0).toFixed(2))} note="kayıtlı poliçelerin primi" />
          <Kpi label="Açık hasar dosyası" tone={cq.data.some((c) => c.status === "open" || c.status === "submitted") ? "accent" : undefined} icon={<FileWarning aria-hidden="true" />} value={cq.data.filter((c) => c.status === "open" || c.status === "submitted").length} note={`${cq.data.length} dosyadan sonuçlanmamış`} />
        </div>
      ) : !pq.isError && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {warn.length > 0 && <Alert tone="warn" title="Bitişi yaklaşan poliçe">{warn.map((p) => `${policyKind(p.kind)} (${p.insurer}) — ${p.days_left < 0 ? "süresi doldu" : `${p.days_left} gün kaldı`}`).join(" · ")}</Alert>}
      {adding === "policy" && <PolicyForm onDone={() => setAdding(null)} />}
      {adding === "claim" && <ClaimForm policies={pq.data ?? []} onDone={() => setAdding(null)} />}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><ShieldCheck aria-hidden="true" /></span><span className="card__title">Poliçeler</span></div>
        <div className="card__body card__body--flush">
          {!pq.data ? <Loading /> : pq.data.length === 0 ? <Empty title="Poliçe yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Poliçeler</caption>
              <thead><tr><th scope="col">Poliçe</th><th scope="col">Dönem</th><th scope="col" className="right">Prim</th><th scope="col">Durum</th></tr></thead>
              <tbody>{pq.data.map((p) => <tr key={p.id}><td><div className="cell-main">{policyKind(p.kind)}</div><div className="cell-sub">{p.insurer} · <span className="mono">{p.policy_no}</span>{p.area && ` · ${p.area}`}</div>{p.coverage && <div className="cell-sub">{p.coverage}</div>}</td><td className="small nowrap">{formatDate(p.start)} – {formatDate(p.end)}</td><td className="right"><Money value={p.premium} /></td><td>{p.days_left < 0 ? <Badge tone="danger">Süresi doldu</Badge> : p.warning ? <Badge tone="warn">{p.days_left} gün kaldı</Badge> : <Badge tone="ok">Geçerli</Badge>}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--warn"><FileWarning aria-hidden="true" /></span><span className="card__title">Hasar dosyaları</span>{cq.data && <span className="card__meta ml-auto">{cq.data.length} dosya</span>}</div>
        <div className="card__body card__body--flush">
          {!cq.data || cq.data.length === 0 ? <Empty title="Hasar dosyası yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Hasar dosyaları</caption>
              <thead><tr><th scope="col">Hasar</th><th scope="col">Poliçe</th><th scope="col" className="right">Tazminat</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
              <tbody>{cq.data.map((c) => <tr key={c.id}><td><div className="cell-main">{c.description}</div><div className="cell-sub">{formatDate(c.incident_date)}{c.source && ` · ${c.source}`}</div></td><td className="small">{c.policy_label}</td><td className="right">{c.paid ? <Money value={c.paid} /> : c.claimed ? <span className="small muted">talep <Money value={c.claimed} /></span> : "—"}</td><td><Badge tone={claimTone(c.status)}>{claimStatus(c.status)}</Badge></td><td className="right nowrap"><ClaimActions c={c} /></td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}

function PolicyForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ kind: "building", insurer: "", policy_no: "", coverage: "", premium: "", start: todayIso(), end: "", area: "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/insurance-policies", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, premium: parseMoneyInput(f.premium) ?? "0" }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Tip" required>{(p) => <select {...p} className="field__input" value={f.kind} onChange={up("kind")}>{["building", "liability", "elevator", "personnel", "glass", "other"].map((k) => <option key={k} value={k}>{policyKind(k)}</option>)}</select>}</Field>
          <Field label="Sigortacı" required error={fieldError(m.error, "insurer")}>{(p) => <input {...p} className="field__input" value={f.insurer} onChange={up("insurer")} />}</Field>
          <Field label="Poliçe no" required error={fieldError(m.error, "policy_no")}>{(p) => <input {...p} className="field__input mono" value={f.policy_no} onChange={up("policy_no")} />}</Field>
          <Field label="Prim (₺)" error={fieldError(m.error, "premium")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.premium} onChange={up("premium")} />}</Field>
          <Field label="Başlangıç" required error={fieldError(m.error, "start")}>{(p) => <input {...p} className="field__input" type="date" value={f.start} onChange={up("start")} />}</Field>
          <Field label="Bitiş" required error={fieldError(m.error, "end")}>{(p) => <input {...p} className="field__input" type="date" min={f.start} value={f.end} onChange={up("end")} />}</Field>
          <Field label="Bağlı alan">{(p) => <input {...p} className="field__input" value={f.area} onChange={up("area")} />}</Field>
        </div>
        <Field label="Kapsam">{(p) => <input {...p} className="field__input" maxLength={200} value={f.coverage} onChange={up("coverage")} />}</Field>
        <p className="small muted mb-0">Poliçe belgesi belge modülüyle eklenecek.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ClaimForm({ policies, onDone }: { policies: Policy[]; onDone: () => void }) {
  const [f, setF] = useState({ policy_id: policies[0]?.id ?? "", description: "", incident_date: todayIso(), source: "", claimed: "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/insurance-claims", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, claimed: parseMoneyInput(f.claimed) }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Poliçe" required error={fieldError(m.error, "policy_id")}>{(p) => <select {...p} className="field__input" value={f.policy_id} onChange={(e) => setF((x) => ({ ...x, policy_id: e.target.value }))}>{policies.map((x) => <option key={x.id} value={x.id}>{policyKind(x.kind)} · {x.insurer}</option>)}</select>}</Field>
          <Field label="Hasar tarihi" required error={fieldError(m.error, "incident_date")}>{(p) => <input {...p} className="field__input" type="date" max={todayIso()} value={f.incident_date} onChange={(e) => setF((x) => ({ ...x, incident_date: e.target.value }))} />}</Field>
          <Field label="Kaynak" hint="ör. talep #12, olay O-0003">{(p) => <input {...p} className="field__input" value={f.source} onChange={(e) => setF((x) => ({ ...x, source: e.target.value }))} />}</Field>
          <Field label="Talep edilen (₺)">{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.claimed} onChange={(e) => setF((x) => ({ ...x, claimed: e.target.value }))} />}</Field>
        </div>
        <Field label="Hasar" required error={fieldError(m.error, "description")}>{(p) => <input {...p} className="field__input" maxLength={200} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Dosya aç</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function ClaimActions({ c }: { c: Claim }) {
  const [paid, setPaid] = useState("");
  const m = useSiteMutation<Record<string, unknown>, unknown>("PATCH", `/insurance-claims/${c.id}`);
  if (c.status === "open") return <button className="btn btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ status: "submitted" })}>Sigortacıya iletildi</button>;
  if (c.status === "submitted") return <><ConfirmButton className="btn btn--sm btn--primary" title="Tazminat ödendi" confirmLabel="Kaydet" body={<div className="field"><label className="field__label" htmlFor={`cp-${c.id}`}>Ödenen tazminat (₺)</label><input id={`cp-${c.id}`} className="field__input" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>} onConfirm={() => m.mutateAsync({ status: "paid", paid: parseMoneyInput(paid) })}>Ödendi</ConfirmButton>{" "}<button className="btn btn--ghost btn--sm" type="button" onClick={() => m.mutate({ status: "rejected" })}>Reddedildi</button></>;
  return null;
}

// ===================================================================== 57 Sayaçlar
/** Sayaçlar ve okuma (OPS-05): dönem okuması (fotoğraflı), endeks kontrolü, %50 sapma onayı, okunamadı nedeni. */
export function MetersPage() {
  const [s, set] = useUrlState({ donem: todayIso().slice(0, 7) });
  const q = useSiteGet<{ period: string; rows: ReadRow[]; missing: number }>("/meter-readings", { period: s.donem });
  const [adding, setAdding] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const anomalies = (q.data?.rows ?? []).filter((r) => r.reading?.status === "anomaly").length;
  return (
    <div className="stack">
      <PageHead title="Sayaçlar ve okuma" eyebrow="Operasyon" subtitle="Okumalar fotoğraf kanıtıyla; önceki endeksten küçük değer reddedilir, %50'den fazla sapma onaya düşer." actions={<button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Sayaç ekle</button>} />
      {q.data && <div className="grid grid--kpi rise"><Kpi label="Sayaç" icon={<Gauge aria-hidden="true" />} value={q.data.rows.length} note="kayıtlı sayaç" /><Kpi label="Okunmamış" icon={<ClipboardList aria-hidden="true" />} value={q.data.missing} tone={q.data.missing ? "warn" : "ok"} note="bu dönem okuması girilmedi" /><Kpi label="Anormal" icon={<TriangleAlert aria-hidden="true" />} value={anomalies} tone={anomalies ? "warn" : undefined} note="%50'den fazla sapma, onay bekliyor" /></div>}
      {!q.data && !q.isError && <div className="grid grid--kpi">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {adding && <MeterForm onDone={() => setAdding(false)} />}
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><Gauge aria-hidden="true" /></span>
          <div><div className="card__title">Dönem okumaları</div>{q.data && <div className="card__meta">{q.data.rows.length - q.data.missing} / {q.data.rows.length} okundu</div>}</div>
          <div className="card__tools"><div className="field"><label className="field__label" htmlFor="mt-p">Okuma dönemi</label><input id="mt-p" className="field__input" type="month" value={s.donem} onChange={(e) => set({ donem: e.target.value })} /></div></div>
        </div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.rows.length === 0 ? <Empty title="Sayaç yok" icon={<Gauge aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Sayaç okumaları</caption>
            <thead><tr><th scope="col">Sayaç</th><th scope="col" className="right">Önceki</th><th scope="col" className="right">Bu dönem</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.rows.map((r) => (
              <Fragment key={r.meter.id}>
                <tr>
                  <td><div className="cell-main">{r.meter.unit_name ?? r.meter.area}</div><div className="cell-sub">{meterKind(r.meter.kind)} · <span className="mono">{r.meter.serial}</span></div></td>
                  <td className="right num">{r.last?.value ? `${Number(r.last.value).toLocaleString("tr-TR")} ${r.meter.unit_label}` : "—"}</td>
                  <td className="right num">{r.reading?.value ? <>{Number(r.reading.value).toLocaleString("tr-TR")}{r.reading.consumption && <div className="cell-sub">tüketim {Number(r.reading.consumption).toLocaleString("tr-TR")}{r.reading.anomaly_percent != null && ` (%${r.reading.anomaly_percent})`}</div>}</> : "—"}</td>
                  <td>{r.reading ? <><Badge tone={readingTone(r.reading.status)}>{readingStatus(r.reading.status)}</Badge>{r.reading.reason && <div className="cell-sub">{r.reading.reason}</div>}</> : <Badge>Okunmadı</Badge>}</td>
                  <td className="right nowrap">{r.reading?.status === "anomaly" ? <AnomalyActions id={r.reading.id} /> : (!r.reading || r.reading.status === "reread") && <button className="btn btn--sm" type="button" aria-expanded={reading === r.meter.id} onClick={() => setReading((v) => (v === r.meter.id ? null : r.meter.id))}>Oku</button>}</td>
                </tr>
                {reading === r.meter.id && <tr><td colSpan={5}><ReadForm meter={r.meter} period={s.donem} prev={r.last?.value ?? null} onDone={() => setReading(null)} /></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
      <p className="small muted">Excel ile okuma (pay ölçer firması dosyası) aktarım ekranından gelecek; okumalar tüketim bazlı tahakkukta kullanılacak (K14/K23).</p>
    </div>
  );
}

function MeterForm({ onDone }: { onDone: () => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ kind: "cold_water", serial: "", area: "", multiplier: "1" });
  const m = useSiteMutation<Record<string, unknown>, Meter>("POST", "/meters", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, unit_id: f.kind === "common" ? null : unit?.id ?? null, area: f.kind === "common" || !unit ? f.area : null, multiplier: Number(f.multiplier) || 1 }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Tip">{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{["cold_water", "hot_water", "heat", "electric", "gas", "common"].map((k) => <option key={k} value={k}>{meterKind(k)}</option>)}</select>}</Field>
          <Field label="Seri no" required error={fieldError(m.error, "serial")}>{(p) => <input {...p} className="field__input mono" value={f.serial} onChange={(e) => setF((x) => ({ ...x, serial: e.target.value }))} />}</Field>
          {f.kind !== "common" ? <UnitPicker label="Bölüm" value={unit} onChange={setUnit} error={fieldError(m.error, "unit_id")} /> : <Field label="Ortak alan" required error={fieldError(m.error, "unit_id")}>{(p) => <input {...p} className="field__input" value={f.area} onChange={(e) => setF((x) => ({ ...x, area: e.target.value }))} />}</Field>}
          <Field label="Çarpan">{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.multiplier} onChange={(e) => setF((x) => ({ ...x, multiplier: e.target.value }))} />}</Field>
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
  const m = useSiteMutation<Record<string, unknown>, Reading>("POST", "/meter-readings", { onSuccess: onDone });
  return (
    <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(unreadable ? { meter_id: meter.id, period, unreadable_reason: unreadable } : { meter_id: meter.id, period, value: value.replace(",", "."), photo }); }}>
      <FormError error={m.error} />
      <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label={`Endeks (${meter.unit_label})`} hint={prev ? `Önceki: ${Number(prev).toLocaleString("tr-TR")}` : undefined} error={fieldError(m.error, "value")}>{(p) => <input {...p} className="field__input" inputMode="decimal" style={{ maxWidth: "10rem" }} disabled={!!unreadable} value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
        <PhotoInput label="Sayaç fotoğrafı" value={photo} onChange={setPhoto} />
        <Field label="Okunamadı">{(p) => <select {...p} className="field__input" value={unreadable} onChange={(e) => setUnreadable(e.target.value)}><option value="">—</option><option value="Evde yok">Evde yok</option><option value="Sayaç erişilemez">Sayaç erişilemez</option><option value="Arızalı">Arızalı</option></select>}</Field>
      </div>
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
/** Görevli rutin görevleri (OPS-06): şablondan günlük görev; fotoğraf zorunluysa fotoğrafsız tamamlanmaz; haftalık oran. */
export function TasksPage() {
  const [s, set] = useUrlState({ sekme: "bugun", tarih: todayIso() });
  // Göstergeler her zaman bugünü anlatır (gün seçimi yalnız listeyi değiştirir)
  const today = useSiteGet<TaskRow[]>("/tasks", { date: todayIso() }, { refetchInterval: 60000 });
  const rep = useSiteGet<{ rate: number | null }>("/tasks/report");
  const t = today.data ?? [];
  const cnt = (st: string) => t.filter((x) => x.status === st).length;
  return (
    <div className="stack">
      <PageHead title="Rutin görevler" eyebrow="Operasyon" subtitle="Çöp, temizlik, havuz kontrolü gibi işler şablondan her gün üretilir; saat aralığı geçince 'gecikti'.">
        {tabs([["bugun", "Günün görevleri"], ["sablon", "Görev şablonları"], ["rapor", "Haftalık rapor"]], s.sekme, (k) => set({ sekme: k }), "Görevler")}
      </PageHead>
      {today.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Bugünkü görev" icon={<ListTodo aria-hidden="true" />} value={t.length} note={`${cnt("upcoming") + cnt("due")} tanesi sırada ya da şimdi`} />
          <Kpi label="Tamamlanan" tone="ok" icon={<CheckCircle2 aria-hidden="true" />} value={cnt("done")} note={cnt("failed") ? `${cnt("failed")} tamamlanamadı` : "bugün kapatılan"} />
          <Kpi label="Geciken" tone={cnt("late") ? "danger" : undefined} icon={<AlertTriangle aria-hidden="true" />} value={cnt("late")} note="saat aralığı geçti" />
          <Kpi label="Haftalık oran" tone={rep.data?.rate == null ? undefined : rep.data.rate >= 90 ? "ok" : rep.data.rate >= 70 ? "warn" : "danger"} icon={<Gauge aria-hidden="true" />} value={rep.data ? (rep.data.rate == null ? "—" : `%${rep.data.rate}`) : "…"} note="son 7 günde tamamlanma" />
        </div>
      ) : !today.isError && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {s.sekme === "sablon" ? <TaskTemplates /> : s.sekme === "rapor" ? <TaskReport /> : <DayTasks date={s.tarih} setDate={(tarih) => set({ tarih })} />}
    </div>
  );
}

function DayTasks({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const q = useSiteGet<TaskRow[]>("/tasks", { date }, { refetchInterval: 60000 });
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--accent"><ListTodo aria-hidden="true" /></span>
        <div><div className="card__title">Günün görevleri</div>{q.data && <div className="card__meta">{formatDate(date)} · {q.data.length} görev</div>}</div>
        <div className="card__tools"><div className="field"><label className="field__label" htmlFor="tk-d">Gün</label><input id="tk-d" className="field__input" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
      </div>
      {q.isPending ? <Loading /> : !q.data || q.data.length === 0 ? <Empty title="Bu gün görev yok" icon={<ListTodo aria-hidden="true" />}>Görev şablonu ekleyin.</Empty> : (
        <div className="task-list">{q.data.map((t) => <TaskCard key={t.template.id} t={t} date={date} />)}</div>
      )}
    </div>
  );
}

function TaskCard({ t, date }: { t: TaskRow; date: string }) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/tasks/${t.template.id}/complete`, { onSuccess: () => setOpen(false) });
  return (
    <div className="task-row"><div className="stack" style={{ gap: "var(--s-2)" }}>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <div><span className="strong">{t.template.name}</span> <span className="small muted">{t.template.time_from}–{t.template.time_to}{t.template.location && ` · ${t.template.location}`} · {t.template.assignee}</span>{t.template.description && <div className="small">{t.template.description}</div>}</div>
        <Badge tone={taskTone(t.status)}>{taskStatus(t.status)}</Badge>
      </div>
      {t.done && <div className="small muted">{t.done.by}, {formatDateTime(t.done.at)}{t.done.reason && ` · neden: ${t.done.reason}`}{t.done.note && ` · ${t.done.note}`}{t.done.photo && <img src={t.done.photo} alt={`${t.template.name} fotoğrafı`} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, marginLeft: 8, verticalAlign: "middle" }} />}</div>}
      {!t.done && (open ? (
        <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ date, status: reason ? "failed" : "done", reason: reason || null, note: note || null, photo }); }}>
          <FormError error={m.error} />
          <PhotoInput required={t.template.photo_required} value={photo} onChange={setPhoto} error={fieldError(m.error, "photo")} />
          <div className="grid grid--2">
            <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <Field label="Tamamlanamadıysa nedeni">{(p) => <select {...p} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">—</option><option>Malzeme yok</option><option>Alana erişilemedi</option><option>Başka acil iş</option><option>Hava koşulları</option></select>}</Field>
          </div>
          <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!reason && t.template.photo_required && !photo}>{reason ? "Tamamlanamadı olarak kaydet" : "Tamamlandı"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Vazgeç</button></div>
          {!reason && t.template.photo_required && !photo && <span className="xs muted">Bu görev fotoğrafsız tamamlanamaz.</span>}
        </form>
      ) : <div><button className="btn btn--sm btn--primary" type="button" onClick={() => setOpen(true)}>Kapat</button></div>)}
    </div></div>
  );
}

function TaskTemplates() {
  const q = useSiteGet<TaskT[]>("/task-templates");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", description: "", frequency: "daily", weekdays: [0, 1, 2, 3, 4] as number[], month_day: "1", time_from: "08:00", time_to: "10:00", location: "", assignee: "Görevli", photo_required: false });
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/task-templates", { onSuccess: () => setOpen(false) });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <div className="row"><button className="btn btn--primary" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Plus aria-hidden="true" /> Görev ekle</button></div>
      {open && (
        <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, month_day: Number(f.month_day), description: f.description || null, location: f.location || null }); }}>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={m.error} />
            <div className="grid grid--kpi">
              <Field label="Görev" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. Çöplerin toplanması" value={f.name} onChange={up("name")} />}</Field>
              <Field label="Sıklık">{(p) => <select {...p} className="field__input" value={f.frequency} onChange={up("frequency")}>{["daily", "weekdays", "monthly"].map((k) => <option key={k} value={k}>{taskFrequency(k)}</option>)}</select>}</Field>
              {f.frequency === "monthly" && <Field label="Ayın günü" error={fieldError(m.error, "month_day")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.month_day} onChange={up("month_day")} />}</Field>}
              <Field label="Başlangıç">{(p) => <input {...p} className="field__input" type="time" value={f.time_from} onChange={up("time_from")} />}</Field>
              <Field label="Bitiş" error={fieldError(m.error, "time_to")}>{(p) => <input {...p} className="field__input" type="time" value={f.time_to} onChange={up("time_to")} />}</Field>
              <Field label="Konum">{(p) => <input {...p} className="field__input" value={f.location} onChange={up("location")} />}</Field>
              <Field label="Rol / kişi" required error={fieldError(m.error, "assignee")}>{(p) => <input {...p} className="field__input" value={f.assignee} onChange={up("assignee")} />}</Field>
            </div>
            {f.frequency === "weekdays" && <div className="row" style={{ gap: "var(--s-2)" }}>{WEEKDAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={f.weekdays.includes(i)} onChange={(e) => setF((x) => ({ ...x, weekdays: e.target.checked ? [...x.weekdays, i].sort() : x.weekdays.filter((w) => w !== i) }))} /><span>{d}</span></label>)}</div>}
            <Field label="Açıklama">{(p) => <input {...p} className="field__input" maxLength={200} value={f.description} onChange={up("description")} />}</Field>
            <label className="check"><input type="checkbox" checked={f.photo_required} onChange={(e) => setF((x) => ({ ...x, photo_required: e.target.checked }))} /><span>Fotoğraf zorunlu</span></label>
          </div>
          <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Vazgeç</button></div>
        </form>
      )}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><ListTodo aria-hidden="true" /></span><span className="card__title">Görev şablonları</span>{q.data && <span className="card__meta ml-auto">{q.data.length} şablon</span>}</div>
        <div className="card__body card__body--flush">
        {!q.data || q.data.length === 0 ? <Empty title="Görev şablonu yok" icon={<ListTodo aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Görev şablonları</caption>
            <thead><tr><th scope="col">Görev</th><th scope="col">Sıklık</th><th scope="col">Saat</th><th scope="col">Atanan</th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id}><td className="cell-main">{t.name}{t.photo_required && <div className="cell-sub">fotoğraf zorunlu</div>}</td><td className="small">{taskFrequency(t.frequency)}{t.frequency === "weekdays" && ` (${t.weekdays.map((d) => WEEKDAYS[d]).join(", ")})`}{t.frequency === "monthly" && ` (${t.month_day}.)`}</td><td className="small mono">{t.time_from}–{t.time_to}</td><td className="small">{t.assignee}</td></tr>)}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function TaskReport() {
  const q = useSiteGet<{ from: string; to: string; rows: { template_id: string; name: string; assignee: string; expected: number; done: number; rate: number | null }[]; rate: number | null }>("/tasks/report");
  if (!q.data) return <Loading />;
  const rated = q.data.rows.filter((r) => r.rate != null);
  return (
    <>
    {rated.length > 0 && (
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span><span className="card__title">Görev bazında tamamlanma</span><span className="card__meta ml-auto">son 7 gün</span></div>
        <div className="card__body ops-chart">
          <BarChart label="Görev bazında tamamlanma oranı" data={rated.map((r) => ({ label: r.name, value: r.rate ?? 0, sub: `${r.done}/${r.expected}` }))} format={(v) => `%${Math.round(v)}`} highlight={rated.reduce((bi, r, i, a) => ((r.rate ?? 0) < (a[bi]?.rate ?? 0) ? i : bi), 0)} compact />
        </div>
      </div>
    )}
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><ListTodo aria-hidden="true" /></span><span className="card__title">Son 7 gün</span><span className="card__meta ml-auto">{formatDate(q.data.from)} – {formatDate(q.data.to)} · genel %{q.data.rate ?? "—"}</span></div>
      <div className="card__body card__body--flush">
        {q.data.rows.length === 0 ? <Empty title="Görev yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Görev tamamlanma oranı</caption>
            <thead><tr><th scope="col">Görev</th><th scope="col">Atanan</th><th scope="col" className="right">Beklenen</th><th scope="col" className="right">Tamamlanan</th><th scope="col" className="right">Oran</th></tr></thead>
            <tbody>{q.data.rows.map((r) => <tr key={r.template_id}><td className="cell-main">{r.name}</td><td className="small">{r.assignee}</td><td className="right num">{r.expected}</td><td className="right num">{r.done}</td><td className="right">{r.rate == null ? "—" : <Badge tone={r.rate >= 90 ? "ok" : r.rate >= 70 ? "warn" : "danger"}>%{r.rate}</Badge>}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
      <div className="card__foot small muted">Dış firma personeline atanan görevlerin oranı sözleşme KPI'ı olarak kullanılabilir (satın alma ve sözleşme paketiyle).</div>
    </div>
    </>
  );
}

// ===================================================================== 54 Stok sayımı
interface StockItem { id: string; name: string; unit_label: string; quantity: string; min_quantity: string | null; is_low: boolean }
interface StockCountRow { id: string; lines: { item_id: string; name: string; system: string; counted: string; diff: string }[]; created_by: string; created_at: string }
/** Stok sayımı (OPS-02): sayılan miktar girilir; fark düzeltme hareketi olarak yazılır (onay kuralı K21). */
export function StockCount() {
  const items = useSiteGet<StockItem[]>("/stock-items");
  const hist = useSiteGet<StockCountRow[]>("/stock-counts");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const m = useSiteMutation<{ lines: { item_id: string; counted: string }[] }, StockCountRow>("POST", "/stock-counts", { onSuccess: () => setCounts({}) });
  const low = (items.data ?? []).filter((i) => i.is_low);
  const num = (v: string) => Number(v.replace(",", "."));
  return (
    <div className="stack">
      {low.length > 0 && <Alert tone="warn" title="Asgari seviyenin altında">{low.map((i) => `${i.name} (${Number(i.quantity).toLocaleString("tr-TR")} ${i.unit_label})`).join(", ")} — satın alma talebi önerilir (satın alma paketiyle).</Alert>}
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ lines: Object.entries(counts).filter(([, v]) => v !== "").map(([item_id, counted]) => ({ item_id, counted: counted.replace(",", ".") })) }); }}>
        <div className="card__head"><span className="card__icon card__icon--accent"><ClipboardList aria-hidden="true" /></span><span className="card__title">Sayım</span><span className="card__meta ml-auto">yalnız saydığınız malzemeleri girin</span></div>
        <div className="card__body card__body--flush">
          <FormError error={m.error} />
          {!items.data ? <Loading /> : items.data.length === 0 ? <Empty title="Malzeme yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Stok sayımı</caption>
              <thead><tr><th scope="col">Malzeme</th><th scope="col" className="right">Sistem</th><th scope="col" className="right">Sayılan</th><th scope="col" className="right">Fark</th></tr></thead>
              <tbody>{items.data.map((i) => { const c = counts[i.id] ?? ""; const d = c === "" ? null : num(c) - Number(i.quantity); return (
                <tr key={i.id}><td className="cell-main">{i.name}</td><td className="right num">{Number(i.quantity).toLocaleString("tr-TR")} {i.unit_label}</td>
                  <td className="right"><input className="field__input" style={{ width: "7rem", minHeight: 36, textAlign: "right" }} inputMode="decimal" aria-label={`${i.name} sayılan`} value={c} onChange={(e) => setCounts((x) => ({ ...x, [i.id]: e.target.value }))} /></td>
                  <td className="right num">{d == null || Number.isNaN(d) ? "—" : d === 0 ? <Badge tone="ok">Yok</Badge> : <Badge tone="warn">{d > 0 ? "+" : ""}{d.toLocaleString("tr-TR")}</Badge>}</td></tr>
              ); })}</tbody>
            </table></div>
          )}
        </div>
        <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!Object.values(counts).some((v) => v !== "")}>Sayımı kaydet</SubmitButton><span className="small muted">Farkın onaya bağlanması K21 kararına bağlı; şimdilik doğrudan düzeltme hareketi yazılır.</span></div>
      </form>
      {hist.data && hist.data.length > 0 && (
        <div className="card"><div className="card__head"><span className="card__icon card__icon--accent"><History aria-hidden="true" /></span><span className="card__title">Sayım geçmişi</span></div><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
          {hist.data.map((h) => { const diffs = h.lines.filter((l) => Number(l.diff) !== 0); return <div key={h.id} className="small"><strong>{formatDateTime(h.created_at)}</strong> · {h.created_by} · {h.lines.length} kalem{diffs.length > 0 && ` · fark: ${diffs.map((l) => `${l.name} ${Number(l.diff) > 0 ? "+" : ""}${Number(l.diff).toLocaleString("tr-TR")}`).join(", ")}`}</div>; })}
        </div></div>
      )}
    </div>
  );
}
