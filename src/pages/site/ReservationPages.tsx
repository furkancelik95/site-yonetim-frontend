import { useState, type FormEvent } from "react";
import { BarChart3, CalendarCheck, ClipboardCheck, Hourglass, PieChart, Settings2, UserCheck, Wallet } from "lucide-react";
import { Link } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { BarChart, Donut } from "../../components/charts";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { feeType, resChannel, resStatus, resTone, verifyMethod } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 59–61'deki şekiller. */
export interface ResRules {
  enabled: boolean; open_from: string; open_to: string; slot_minutes: number; capacity: number; max_people: number; max_guests: number;
  weekly_limit: number; cancel_hours: number; late_cancel_refund: boolean; fee_type: string; fee_amount: string;
  channel: string; approval: string; verify: string; waitlist: boolean; waitlist_minutes: number;
  noshow: { enabled: boolean; months: number; count: number; block_days: number };
}
export interface ResArea { id: string; name: string; kind: string; block_name: string | null; rules: ResRules }
export interface Slot { start: string; end: string; capacity: number; taken: number; past: boolean; mine: boolean; waiting: number }
interface Res { id: string; area_id: string; area_name: string; date: string; start: string; end: string; unit_name: string; person_name: string; people: number; guests: number; status: string; code: string; channel: string; created_by: string; fee: string; reject_reason: string | null; cancel_reason: string | null; checked_in_at: string | null; checked_in_by: string | null }
interface Wait { id: string; area_name: string; date: string; start: string; unit_name: string; person_name: string; status: string; offered_until: string | null }
interface Report { from: string; to: string; rows: { area_id: string; area_name: string; total: number; cancelled: number; checked_in: number; no_show: number; no_show_rate: number | null; occupancy: number; revenue: string }[] }

const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="tabs" role="tablist" aria-label={label}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className="tabs__tab" onClick={() => set(k)}>{l}</button>)}</div>
);

// ===================================================================== 60 Rezervasyon (yönetim, güvenlik)
/** Rezervasyon (REZ-02/03): günlük liste ve kullanım doğrulama, onay, sakin adına rezervasyon, kullanım raporu. */
export function ReservationsPage() {
  const { can, site } = useSite();
  const base = `/s/${site.slug}`;
  const manage = can(P.requestsAssign);
  const [s, set] = useUrlState({ sekme: "gun", tarih: todayIso(), alan: "" });
  const pending = useSiteGet<Res[]>("/reservations", { status: "pending" }, { enabled: manage });
  const items: [string, string][] = [["gun", "Günlük liste"], ...(manage ? ([["onay", `Onay bekleyen${pending.data?.length ? ` (${pending.data.length})` : ""}`], ["yeni", "Sakin adına"], ["rapor", "Kullanım raporu"]] as [string, string][]) : [])];
  return (
    <div className="stack">
      <PageHead title="Rezervasyon" eyebrow="Operasyon" subtitle="Ortak alan takvimi, kapıda kullanım doğrulama, onay ve bekleme listesi."
        actions={can(P.modulesManage) && <Link className="btn" to={`${base}/rezervasyon/alanlar`}><Settings2 aria-hidden="true" /> Alanlar ve kurallar</Link>}>
        {tabs(items, s.sekme, (k) => set({ sekme: k }), "Rezervasyon")}
      </PageHead>
      <ResKpis date={s.tarih} area={s.alan} pending={manage ? pending.data?.length : undefined} />
      {s.sekme === "onay" && manage ? <PendingList /> : s.sekme === "yeni" && manage ? <OnBehalf /> : s.sekme === "rapor" && manage ? <UsageReport /> : <DayList date={s.tarih} area={s.alan} onChange={(v) => set(v)} manage={manage} />}
    </div>
  );
}

/** Bandın altındaki göstergeler: seçili günün rezervasyonları (günlük listeyle aynı sorgu, önbellekten). */
function ResKpis({ date, area, pending }: { date: string; area: string; pending: number | undefined }) {
  const q = useSiteGet<Res[]>("/reservations", { date, area_id: area || undefined }, { refetchInterval: 30000 });
  const wl = useSiteGet<Wait[]>("/waitlist");
  if (!q.data) return q.isError ? null : <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>;
  const live = q.data.filter((r) => ["approved", "checked_in", "pending"].includes(r.status));
  const came = live.filter((r) => r.status === "checked_in").length;
  const waits = (wl.data ?? []).filter((w) => w.date === date);
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Rezervasyon" icon={<CalendarCheck aria-hidden="true" />} value={live.length} note={formatDate(date)} />
      <Kpi label="Geldi" icon={<UserCheck aria-hidden="true" />} value={came} tone={came ? "ok" : undefined} note="girişi doğrulanan" />
      <Kpi label="Bekleme listesi" icon={<Hourglass aria-hidden="true" />} value={waits.length} tone={waits.length ? "warn" : undefined} note="sırada bekleyen bölüm" />
      {pending !== undefined && <Kpi label="Onay bekleyen" icon={<ClipboardCheck aria-hidden="true" />} value={pending} tone={pending ? "warn" : undefined} note="tüm günler, yönetici kararı" />}
    </div>
  );
}

function DayList({ date, area, onChange, manage }: { date: string; area: string; onChange: (v: { tarih?: string; alan?: string }) => void; manage: boolean }) {
  const areas = useSiteGet<ResArea[]>("/reservable-areas");
  const q = useSiteGet<Res[]>("/reservations", { date, area_id: area || undefined }, { refetchInterval: 30000 });
  const wl = useSiteGet<Wait[]>("/waitlist");
  const waits = (wl.data ?? []).filter((w) => w.date === date);
  return (
    <>
      {date === todayIso() && <CodeCheck />}
      {areas.data && areas.data.length === 0 && <Empty title="Rezerve edilebilir alan yok" icon={<CalendarCheck aria-hidden="true" />}>Yapı → Ortak alanlar'da alanı "rezerve edilebilir" işaretleyin.</Empty>}
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><CalendarCheck aria-hidden="true" /></span>
          <div><div className="card__title">Günlük liste</div>{q.data && <div className="card__meta">{formatDate(date)} · {q.data.length} kayıt</div>}</div>
          <div className="card__tools">
            <div className="field"><label className="field__label" htmlFor="rz-d">Tarih</label><input id="rz-d" className="field__input" type="date" value={date} onChange={(e) => onChange({ tarih: e.target.value })} /></div>
            <div className="field"><label className="field__label" htmlFor="rz-a">Alan</label><select id="rz-a" className="field__input" value={area} onChange={(e) => onChange({ alan: e.target.value })}><option value="">Tümü</option>{(areas.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          </div>
        </div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title={`${formatDate(date)} için rezervasyon yok`} icon={<CalendarCheck aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Günlük rezervasyon listesi</caption>
            <thead><tr><th scope="col">Saat</th><th scope="col">Alan</th><th scope="col">Bölüm / kişi</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((r) => (
              <tr key={r.id}>
                <td className="nowrap num strong">{r.start}–{r.end}</td>
                <td>{r.area_name}</td>
                <td><div className="cell-main">{r.unit_name} · {r.person_name}</div><div className="cell-sub">{r.people} kişi{r.guests > 0 && ` + ${r.guests} misafir`}{r.channel === "staff" && ` · ${r.created_by} açtı`}{Number(r.fee) > 0 && <> · <Money value={r.fee} /></>}</div></td>
                <td><Badge tone={resTone(r.status)}>{resStatus(r.status)}</Badge>{r.checked_in_at && <div className="cell-sub">{r.checked_in_by}</div>}{(r.reject_reason || r.cancel_reason) && <div className="cell-sub">{r.reject_reason ?? r.cancel_reason}</div>}</td>
                <td className="right nowrap"><RowActions r={r} manage={manage} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
      {waits.length > 0 && <div className="card"><div className="card__head"><span className="card__icon card__icon--warn"><Hourglass aria-hidden="true" /></span><span className="card__title">Bekleme listesi</span></div><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
        {waits.map((w) => <div key={w.id} className="small">{w.start} · {w.area_name} · {w.unit_name} ({w.person_name}) — {w.status === "offered" ? <Badge tone="info">Teklif gitti</Badge> : <Badge tone="muted">Sırada</Badge>}</div>)}
      </div></div>}
    </>
  );
}

function RowActions({ r, manage }: { r: Res; manage: boolean }) {
  const ci = useSiteMutation<Record<string, never>, Res>("POST", `/reservations/${r.id}/check-in`);
  const [reason, setReason] = useState("");
  const cancel = useSiteMutation<{ reason: string }, Res>("POST", `/reservations/${r.id}/cancel`);
  return (
    <div className="row" style={{ gap: "var(--s-2)", justifyContent: "flex-end" }}>
      {r.status === "approved" && r.date === todayIso() && <button className="btn btn--sm btn--primary" type="button" disabled={ci.isPending} onClick={() => ci.mutate({})}>Geldi</button>}
      {manage && ["pending", "approved"].includes(r.status) && (
        <ConfirmButton className="btn btn--sm btn--ghost" title={`${r.area_name} ${r.start} — iptal`} confirmLabel="İptal et" danger
          body={<Field label="Gerekçe" hint="Sakine bildirilir">{(p) => <input {...p} className="field__input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
          onConfirm={() => cancel.mutateAsync({ reason })}>İptal</ConfirmButton>
      )}
    </div>
  );
}

/** Kapıda doğrulama: sakinin söylediği ya da QR'dan okunan 6 haneli kod. */
function CodeCheck() {
  const [code, setCode] = useState("");
  const m = useSiteMutation<{ code: string }, Res>("POST", "/reservations/check-in-code", { onSuccess: () => setCode("") });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ code: code.replace(/\D/g, "") }); }}>
      <div className="card__body row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Rezervasyon kodu" hint="Sakinin söylediği ya da QR'daki 6 hane" error={fieldError(m.error, "code")}>{(p) => <input {...p} className="field__input mono" inputMode="numeric" autoComplete="off" maxLength={20} style={{ maxWidth: "12rem", fontSize: "1.25rem", letterSpacing: "0.15em" }} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
        <SubmitButton busy={m.isPending} disabled={code.replace(/\D/g, "").length !== 6}>Doğrula ve giriş kaydet</SubmitButton>
      </div>
      {m.error != null && <div className="card__body" style={{ paddingTop: 0 }}><FormError error={m.error} /></div>}
    </form>
  );
}

function PendingList() {
  const q = useSiteGet<Res[]>("/reservations", { status: "pending" });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty title="Onay bekleyen rezervasyon yok" icon={<CalendarCheck aria-hidden="true" />} />;
  return <div className="stack">{q.data.map((r) => <PendingCard key={r.id} r={r} />)}</div>;
}
function PendingCard({ r }: { r: Res }) {
  const ok = useSiteMutation<Record<string, never>, Res>("POST", `/reservations/${r.id}/approve`);
  const [reason, setReason] = useState("");
  const rej = useSiteMutation<{ reason: string }, Res>("POST", `/reservations/${r.id}/reject`);
  return (
    <div className="card"><div className="card__body row row--between" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
      <div><div className="strong">{r.area_name} · {formatDate(r.date)} {r.start}–{r.end}</div><div className="small muted">{r.unit_name} · {r.person_name} · {r.people} kişi{r.guests > 0 && ` + ${r.guests} misafir`}{Number(r.fee) > 0 && <> · <Money value={r.fee} /></>}</div></div>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <button className="btn btn--sm btn--primary" type="button" disabled={ok.isPending} onClick={() => ok.mutate({})}>Onayla</button>
        <ConfirmButton className="btn btn--sm" title="Rezervasyonu reddet" confirmLabel="Reddet" danger
          body={<Field label="Ret gerekçesi" required>{(p) => <textarea {...p} className="field__input" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
          onConfirm={() => rej.mutateAsync({ reason })}>Reddet</ConfirmButton>
      </div>
    </div></div>
  );
}

/** Telefonla arayan sakin adına rezervasyon (REZ-02, kanal: yönetim). */
function OnBehalf() {
  const areas = useSiteGet<ResArea[]>("/reservable-areas");
  const list = (areas.data ?? []).filter((a) => a.rules.enabled && a.rules.channel !== "resident");
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ area_id: "", date: todayIso(), start: "", people: "2", guests: "0", person_name: "" });
  const area = list.find((a) => a.id === f.area_id) ?? list[0];
  const slots = useSiteGet<Slot[]>(`/reservable-areas/${area?.id}/availability`, { date: f.date }, { enabled: !!area });
  const m = useSiteMutation<Record<string, unknown>, Res>("POST", "/reservations", { onSuccess: () => setF((x) => ({ ...x, start: "", person_name: "" })) });
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ area_id: area?.id, unit_id: unit?.id, person_name: f.person_name.trim() || null, date: f.date, start: f.start, people: Number(f.people), guests: Number(f.guests) }); }
  if (areas.isPending) return <Loading />;
  if (list.length === 0) return <Empty title="Yönetimin açabileceği alan yok">Alan kurallarında kanal "Yönetim sakin adına açar" ya da "İkisi de" olmalı.</Empty>;
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <UnitPicker label="Bölüm" value={unit} onChange={setUnit} error={fieldError(m.error, "unit_id")} />
          <Field label="Rezervasyonu yapan" hint="Boşsa hesap sahibi">{(p) => <input {...p} className="field__input" maxLength={60} value={f.person_name} onChange={(e) => setF((x) => ({ ...x, person_name: e.target.value }))} />}</Field>
          <Field label="Alan">{(p) => <select {...p} className="field__input" value={area?.id ?? ""} onChange={(e) => setF((x) => ({ ...x, area_id: e.target.value, start: "" }))}>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
          <Field label="Tarih" error={fieldError(m.error, "date")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value, start: "" }))} />}</Field>
          <Field label="Kişi" error={fieldError(m.error, "people")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.people} onChange={(e) => setF((x) => ({ ...x, people: e.target.value }))} />}</Field>
          <Field label="Misafir" error={fieldError(m.error, "guests")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.guests} onChange={(e) => setF((x) => ({ ...x, guests: e.target.value }))} />}</Field>
        </div>
        <SlotPicker slots={slots.data} value={f.start} onChange={(v) => setF((x) => ({ ...x, start: v }))} error={fieldError(m.error, "start")} />
        {area && <RulesSummary r={area.rules} />}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!unit || !f.start}>Rezervasyonu oluştur</SubmitButton><span className="small muted">Kanal "yönetim" olarak ve sizin adınızla kaydedilir; sakine bildirim gider (K5).</span></div>
    </form>
  );
}

/** Saat seçimi: dolu/geçmiş saatler pasif; doluluk metinle de yazılır (yalnız renge dayanmaz). */
export function SlotPicker({ slots, value, onChange, error, allowFull }: { slots: Slot[] | undefined; value: string; onChange: (v: string) => void; error?: string; allowFull?: boolean }) {
  if (!slots) return <Loading />;
  if (slots.length === 0) return <p className="small muted">Bu alan için saat tanımı yok.</p>;
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field__label">Saat</legend>
      <div className="slot-grid">
        {slots.map((s) => {
          const full = s.taken >= s.capacity;
          const disabled = s.past || s.mine || (full && !allowFull);
          return (
            <button key={s.start} type="button" className={`slot${value === s.start ? " slot--on" : ""}${full ? " slot--full" : ""}`} aria-pressed={value === s.start} disabled={disabled} onClick={() => onChange(s.start)}>
              <span className="slot__time">{s.start}</span>
              <span className="slot__meta">{s.mine ? "sizin" : s.past ? "geçti" : full ? (s.waiting ? `dolu · ${s.waiting} sırada` : "dolu") : s.capacity > 1 ? `${s.capacity - s.taken} yer` : "boş"}</span>
            </button>
          );
        })}
      </div>
      {error && <span className="field__error" role="alert">{error}</span>}
    </fieldset>
  );
}

export function RulesSummary({ r }: { r: ResRules }) {
  return (
    <ul className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
      <li>{r.open_from}–{r.open_to}, {r.slot_minutes} dakikalık saatler{r.capacity > 1 && `, saat başı ${r.capacity} rezervasyon`}</li>
      <li>En fazla {r.max_people} kişi, {r.max_guests} misafir{r.weekly_limit > 0 && `; bölüm başına haftada ${r.weekly_limit} rezervasyon`}</li>
      <li>{r.fee_type === "free" ? "Ücretsiz" : `${feeType(r.fee_type)}: ${Number(r.fee_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ (borca yansır)`}{r.approval === "manual" && " · yönetici onayı gerekir"}</li>
      <li>İptal: başlangıçtan {r.cancel_hours} saat öncesine kadar{r.fee_type !== "free" && (r.late_cancel_refund ? " (sonrasında da ücret iade edilir)" : "; sonrasında ücret iade edilmez")}</li>
      {r.verify !== "none" && <li>Girişte doğrulama: {verifyMethod(r.verify)}{r.noshow.enabled && ` · ${r.noshow.months} ayda ${r.noshow.count} kez gelinmezse ${r.noshow.block_days} gün rezervasyon yapılamaz`}</li>}
    </ul>
  );
}

function UsageReport() {
  const [to, setTo] = useState(todayIso());
  const q = useSiteGet<Report>("/reservations/report", { to });
  const rows = q.data?.rows ?? [];
  return (
    <>
    {rows.length > 0 && (
      <div className="ops-charts">
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span><span className="card__title">Alan doluluğu</span><span className="card__meta ml-auto">son 30 gün</span></div>
          <div className="card__body ops-chart">
            <BarChart label="Alan doluluk oranı" data={rows.map((r) => ({ label: r.area_name, value: r.occupancy, sub: `${r.total} rezervasyon` }))} format={(v) => `%${Math.round(v)}`} compact />
          </div>
        </div>
        <div className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><PieChart aria-hidden="true" /></span><span className="card__title">Rezervasyon sonucu</span><span className="card__meta ml-auto">tüm alanlar</span></div>
          <div className="card__body ops-pie">
            <Donut label="Rezervasyon sonuçları" centerSub="rezervasyon" segments={[
              { label: "Geldi", value: rows.reduce((a, r) => a + r.checked_in, 0), tone: "ok" },
              { label: "Gelmedi", value: rows.reduce((a, r) => a + r.no_show, 0), tone: "danger" },
              { label: "İptal", value: rows.reduce((a, r) => a + r.cancelled, 0), tone: "muted" },
              { label: "Diğer", value: rows.reduce((a, r) => a + Math.max(0, r.total - r.checked_in - r.no_show - r.cancelled), 0), tone: "info" },
            ]} />
          </div>
        </div>
      </div>
    )}
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--accent"><CalendarCheck aria-hidden="true" /></span>
        <div><div className="card__title">Kullanım raporu</div><div className="card__meta">{q.data ? `${formatDate(q.data.from)} – ${formatDate(q.data.to)}` : ""}</div></div>
        <div className="card__tools"><div className="field"><label className="field__label" htmlFor="rr-to">Bitiş (son 30 gün)</label><input id="rr-to" className="field__input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
      </div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.rows.length === 0 ? <Empty title="Alan yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Alan kullanım raporu</caption>
            <thead><tr><th scope="col">Alan</th><th scope="col" className="right">Rezervasyon</th><th scope="col" className="right">İptal</th><th scope="col" className="right">Gelmedi</th><th scope="col" className="right">Doluluk</th><th scope="col" className="right">Borca yansıyan</th></tr></thead>
            <tbody>{q.data.rows.map((r) => <tr key={r.area_id}><td className="cell-main">{r.area_name}</td><td className="right num">{r.total}</td><td className="right num">{r.cancelled}</td><td className="right num">{r.no_show}{r.no_show_rate != null && <span className="cell-sub"> %{r.no_show_rate}</span>}</td><td className="right num">%{r.occupancy.toLocaleString("tr-TR")}</td><td className="right"><Money value={r.revenue} /></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
      <div className="card__foot small muted">Doluluk = kullanılan saat / açık saat × kapasite. "Gelmedi" yalnız girişte doğrulama yapılan alanlarda sayılır.</div>
    </div>
    </>
  );
}

// ===================================================================== 59 Alanlar ve kurallar
/** Rezerve edilebilir alanlar ve kuralları (REZ-01). Alan listesi Yapı → Ortak alanlar'dan gelir. */
export function ReservationAreasPage() {
  const { site } = useSite();
  const base = `/s/${site.slug}`;
  const q = useSiteGet<ResArea[]>("/reservable-areas");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHead title="Rezervasyon alanları ve kuralları" eyebrow="Operasyon · Ayarlar" subtitle={<>Alanları <Link to={`${base}/yapi?sekme=ortak`}>Yapı → Ortak alanlar</Link>'da "rezerve edilebilir" işaretleyin; burada saat, kapasite, ücret, onay ve doğrulama kurallarını belirleyin.</>} />
      {q.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Alan" icon={<CalendarCheck aria-hidden="true" />} value={q.data.length} note="rezerve edilebilir işaretli" />
          <Kpi label="Rezervasyona açık" tone="ok" icon={<UserCheck aria-hidden="true" />} value={q.data.filter((a) => a.rules.enabled).length} note="sakin ya da yönetim açabilir" />
          <Kpi label="Ücretli" icon={<Wallet aria-hidden="true" />} value={q.data.filter((a) => a.rules.fee_type !== "free").length} note="ücret borca yansır" />
          <Kpi label="Onaylı" icon={<ClipboardCheck aria-hidden="true" />} value={q.data.filter((a) => a.rules.approval === "manual").length} note="yönetici onayı gerektiren" />
        </div>
      ) : !q.isError && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>}
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty title="Rezerve edilebilir alan yok" icon={<CalendarCheck aria-hidden="true" />} /> : q.data.map((a) => (
        <div key={a.id} className="card">
          <div className="card__head"><span className="card__icon card__icon--accent"><CalendarCheck aria-hidden="true" /></span><span className="card__title">{a.name}</span>{a.block_name && <span className="card__meta">{a.block_name}</span>}<span className="ml-auto">{a.rules.enabled ? <Badge tone="ok">Açık</Badge> : <Badge tone="muted">Kapalı</Badge>}</span></div>
          {open === a.id ? <RulesForm a={a} onDone={() => setOpen(null)} /> : (
            <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
              <RulesSummary r={a.rules} />
              <div className="small">Kanal: {resChannel(a.rules.channel)} · Onay: {a.rules.approval === "auto" ? "otomatik" : "yönetici"} · Bekleme listesi: {a.rules.waitlist ? `açık (${a.rules.waitlist_minutes} dk)` : "kapalı"}</div>
              <div><button className="btn btn--sm" type="button" onClick={() => setOpen(a.id)}>Kuralları düzenle</button></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RulesForm({ a, onDone }: { a: ResArea; onDone: () => void }) {
  const [r, setR] = useState<ResRules>({ ...a.rules, noshow: { ...a.rules.noshow } });
  const m = useSiteMutation<ResRules, ResArea>("PUT", `/reservable-areas/${a.id}/rules`, { onSuccess: onDone });
  const up = <K extends keyof ResRules>(k: K, v: ResRules[K]) => setR((x) => ({ ...x, [k]: v }));
  const num = (k: "slot_minutes" | "capacity" | "max_people" | "max_guests" | "weekly_limit" | "cancel_hours" | "waitlist_minutes") => (e: { target: { value: string } }) => up(k, Number(e.target.value.replace(/\D/g, "")) as never);
  const ns = (k: keyof ResRules["noshow"], v: number | boolean) => setR((x) => ({ ...x, noshow: { ...x.noshow, [k]: v } }));
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(r); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <label className="check"><input type="checkbox" checked={r.enabled} onChange={(e) => up("enabled", e.target.checked)} /><span>Rezervasyona açık</span></label>
        <div className="grid grid--kpi">
          <Field label="Açılış">{(p) => <input {...p} className="field__input" type="time" value={r.open_from} onChange={(e) => up("open_from", e.target.value)} />}</Field>
          <Field label="Kapanış" error={fieldError(m.error, "open_to")}>{(p) => <input {...p} className="field__input" type="time" value={r.open_to} onChange={(e) => up("open_to", e.target.value)} />}</Field>
          <Field label="Süre (dk)" error={fieldError(m.error, "slot_minutes")}>{(p) => <select {...p} className="field__input" value={r.slot_minutes} onChange={num("slot_minutes")}>{[30, 60, 90, 120, 180, 240].map((n) => <option key={n} value={n}>{n}</option>)}</select>}</Field>
          <Field label="Kapasite" hint="Aynı saatte kaç rezervasyon" error={fieldError(m.error, "capacity")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={r.capacity} onChange={num("capacity")} />}</Field>
          <Field label="En fazla kişi" error={fieldError(m.error, "max_people")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={r.max_people} onChange={num("max_people")} />}</Field>
          <Field label="En fazla misafir" error={fieldError(m.error, "max_guests")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={r.max_guests} onChange={num("max_guests")} />}</Field>
          <Field label="Haftalık sınır" hint="Bölüm başına, 0 = sınırsız" error={fieldError(m.error, "weekly_limit")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={r.weekly_limit} onChange={num("weekly_limit")} />}</Field>
          <Field label="Son iptal (saat önce)" error={fieldError(m.error, "cancel_hours")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={r.cancel_hours} onChange={num("cancel_hours")} />}</Field>
        </div>
        <div className="grid grid--kpi">
          <Field label="Ücret">{(p) => <select {...p} className="field__input" value={r.fee_type} onChange={(e) => up("fee_type", e.target.value)}>{["free", "fixed", "hourly", "per_guest"].map((k) => <option key={k} value={k}>{feeType(k)}</option>)}</select>}</Field>
          {r.fee_type !== "free" && <Field label="Tutar (₺)" error={fieldError(m.error, "fee_amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={r.fee_amount} onChange={(e) => up("fee_amount", e.target.value.replace(",", "."))} />}</Field>}
          <Field label="Kanal">{(p) => <select {...p} className="field__input" value={r.channel} onChange={(e) => up("channel", e.target.value)}>{["both", "resident", "staff"].map((k) => <option key={k} value={k}>{resChannel(k)}</option>)}</select>}</Field>
          <Field label="Onay">{(p) => <select {...p} className="field__input" value={r.approval} onChange={(e) => up("approval", e.target.value)}><option value="auto">Otomatik</option><option value="manual">Yönetici onayı</option></select>}</Field>
          <Field label="Girişte doğrulama">{(p) => <select {...p} className="field__input" value={r.verify} onChange={(e) => up("verify", e.target.value)}>{["none", "code", "qr", "staff"].map((k) => <option key={k} value={k}>{verifyMethod(k)}</option>)}</select>}</Field>
        </div>
        {r.fee_type !== "free" && <label className="check"><input type="checkbox" checked={r.late_cancel_refund} onChange={(e) => up("late_cancel_refund", e.target.checked)} /><span>Son iptal süresinden sonra da ücret iade edilsin</span></label>}
        <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="check"><input type="checkbox" checked={r.waitlist} onChange={(e) => up("waitlist", e.target.checked)} /><span>Bekleme listesi</span></label>
          {r.waitlist && <Field label="Teklif süresi (dk)" error={fieldError(m.error, "waitlist_minutes")}>{(p) => <input {...p} className="field__input" style={{ maxWidth: "8rem" }} inputMode="numeric" value={r.waitlist_minutes} onChange={num("waitlist_minutes")} />}</Field>}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <label className="check"><input type="checkbox" checked={r.noshow.enabled} onChange={(e) => ns("enabled", e.target.checked)} /><span>Gelinmeyen rezervasyon (no-show) kuralı</span></label>
          {r.noshow.enabled && (
            <div className="row" style={{ gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
              <input className="field__input" style={{ width: "4.5rem" }} inputMode="numeric" aria-label="Ay" value={r.noshow.months} onChange={(e) => ns("months", Number(e.target.value.replace(/\D/g, "")))} /><span className="small">ayda</span>
              <input className="field__input" style={{ width: "4.5rem" }} inputMode="numeric" aria-label="Gelinmeyen sayısı" value={r.noshow.count} onChange={(e) => ns("count", Number(e.target.value.replace(/\D/g, "")))} /><span className="small">kez gelinmezse</span>
              <input className="field__input" style={{ width: "4.5rem" }} inputMode="numeric" aria-label="Kısıt günü" value={r.noshow.block_days} onChange={(e) => ns("block_days", Number(e.target.value.replace(/\D/g, "")))} /><span className="small">gün rezervasyon yapılamaz</span>
            </div>
          )}
          {fieldError(m.error, "noshow") && <span className="field__error" role="alert">{fieldError(m.error, "noshow")}</span>}
        </fieldset>
        {r.approval === "manual" && <p className="xs muted mb-0">Yönetici onayı şimdilik bu ekrandan verilir; onay kuralları modülüne ("Rezervasyon" kuralı) bağlanması K21 kararına bağlı.</p>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
