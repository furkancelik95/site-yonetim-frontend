import { Fragment, useState, type FormEvent } from "react";
import { Download, Lock } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { downloadCsv } from "../../lib/csv";
import { useUrlState } from "../../lib/hooks";
import { leaveType, timesheetStatus } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 38 ve 39'daki şekiller. */
interface Row {
  id: string; staff_id: string; staff_name: string; position: string | null; payroll_no: string | null; template: string; planned_minutes: number; night_minutes: number;
  status: "worked" | "absent" | "leave"; leave_type: string | null; late_minutes: number; early_leave_minutes: number; overtime_minutes: number; worked_minutes: number; reason: string | null; fixed_by: string | null; is_exception: boolean;
}
interface Day { date: string; is_final: boolean; finalized_by: string | null; finalized_at: string | null; rows: Row[] }
interface ExportPreview { month: string; rows: Record<string, string | number>[]; missing_days: string[]; missing_payroll: string[]; exported: { id: string; created_by: string; created_at: string } | null }
interface Export { id: string; month: string; rows: Record<string, string | number>[]; created_by: string; created_at: string; file_name: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7); };
const hm = (m: number) => `${Math.floor(m / 60)} sa${m % 60 ? ` ${m % 60} dk` : ""}`;
const COLS: [string, string][] = [["payroll_no", "Bordro sicil no"], ["name", "Ad soyad"], ["worked_days", "Çalışılan gün"], ["worked_hours", "Çalışma saati"], ["overtime_hours", "Fazla mesai saati"], ["night_hours", "Gece çalışması saati"], ["absent_days", "Devamsız gün"], ["leave_annual", "Yıllık izin"], ["leave_excuse", "Mazeret izni"], ["leave_sick", "Raporlu"], ["leave_unpaid", "Ücretsiz izin"], ["holiday_hours", "Resmî tatil çalışması"]];
const fileRows = (month: string, rows: Record<string, string | number>[]) => [["Dönem", ...COLS.map(([, l]) => l)], ...rows.map((r) => [month, ...COLS.map(([k]) => (typeof r[k] === "number" ? String(r[k]).replace(".", ",") : String(r[k] ?? "")))])];

/**
 * Puantaj (IK-04/05): günlük puantaj vardiya planı ve onaylı izinlerden üretilir; yalnız istisnalar (geç gelme, erken
 * çıkma, gelmedi, fazla mesai) gerekçeyle düzeltilir; gün kesinleşir. Ay sonunda bordro sicil no ile dosyaya aktarılır.
 * QR/konumlu giriş-çıkış personel hesabına (K29) bağlı.
 */
export function TimesheetPage() {
  const [s, set] = useUrlState({ sekme: "gun", tarih: yesterday(), ay: lastMonth() });
  return (
    <div className="stack">
      <PageHead title="Puantaj" subtitle="Vardiya planından otomatik; yalnız istisnaları düzeltin ve günü kesinleştirin. Ay sonunda bordroya aktarın." />
      <div className="row" role="tablist" aria-label="Puantaj" style={{ gap: "var(--s-2)" }}>
        {[["gun", "Günlük puantaj"], ["aktarim", "Aylık aktarım"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k! })}>{l}</button>)}
      </div>
      {s.sekme === "aktarim" ? <MonthExport month={s.ay} setMonth={(ay) => set({ ay })} /> : <DayView date={s.tarih} setDate={(tarih) => set({ tarih })} />}
    </div>
  );
}

function DayView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const { can } = useSite();
  const manage = can(P.staffManage);
  const q = useSiteGet<Day>("/timesheets", { date });
  const fin = useSiteMutation<{ date: string }, unknown>("POST", "/timesheets/finalize");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <div className="filters"><div className="field"><label className="field__label" htmlFor="ts-date">Gün</label><input id="ts-date" className="field__input" type="date" max={yesterday()} value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="card">
          <div className="card__head"><span className="card__title">{formatDate(q.data.date)}</span><span className="ml-auto">{q.data.is_final ? <Badge tone="ok">Kesin</Badge> : <Badge tone="warn">Taslak</Badge>}</span></div>
          <div className="card__body card__body--flush">
            {q.data.rows.length === 0 ? <Empty title="Bu gün vardiya yok">Vardiya planında atama yapılınca puantaj buradan üretilir.</Empty> : (
              <div className="table-wrap"><table className="data">
                <caption className="visually-hidden">Günlük puantaj</caption>
                <thead><tr><th scope="col">Personel</th><th scope="col">Vardiya</th><th scope="col">Durum</th><th scope="col" className="right">Çalışma</th><th scope="col">İstisna</th>{manage && !q.data.is_final && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
                <tbody>{q.data.rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="cell-main">{r.staff_name}<div className="cell-sub">{r.position ?? ""}{!r.payroll_no && " · sicil no yok"}</div></td>
                      <td className="small nowrap">{r.template}</td>
                      <td><Badge tone={r.status === "worked" ? "ok" : r.status === "absent" ? "danger" : "info"}>{r.status === "leave" && r.leave_type ? leaveType(r.leave_type) : timesheetStatus(r.status)}</Badge></td>
                      <td className="right small nowrap">{r.status === "worked" ? hm(r.worked_minutes) : "—"}{r.night_minutes > 0 && <div className="cell-sub">gece {hm(r.night_minutes)}</div>}</td>
                      <td className="small">{[r.late_minutes && `geç ${r.late_minutes} dk`, r.early_leave_minutes && `erken çıkış ${r.early_leave_minutes} dk`, r.overtime_minutes && `fazla mesai ${r.overtime_minutes} dk`].filter(Boolean).join(", ") || "—"}{r.reason && <div className="cell-sub">{r.reason} · {r.fixed_by}</div>}</td>
                      {manage && !q.data.is_final && <td className="right">{!r.id.startsWith("leave-") && <button className="btn btn--ghost btn--sm" type="button" aria-expanded={editing === r.id} onClick={() => setEditing((x) => (x === r.id ? null : r.id))}>Düzelt</button>}</td>}
                    </tr>
                    {editing === r.id && <tr><td colSpan={6}><FixForm r={r} onDone={() => setEditing(null)} /></td></tr>}
                  </Fragment>
                ))}</tbody>
              </table></div>
            )}
          </div>
          <div className="card__foot row row--between">
            <span className="small muted">{q.data.is_final ? `Kesinleştiren ${q.data.finalized_by}, ${formatDateTime(q.data.finalized_at)}. Kesin gün değişmez.` : "Plan dışında bir şey olmadıysa doğrudan kesinleştirin."}</span>
            {manage && !q.data.is_final && q.data.rows.length > 0 && <ConfirmButton className="btn btn--primary" title="Günü kesinleştir" confirmLabel="Kesinleştir" body="Kesinleşen günün puantajı ve o güne ait vardiya atamaları değiştirilemez." onConfirm={() => fin.mutateAsync({ date })}><Lock aria-hidden="true" /> Günü kesinleştir</ConfirmButton>}
          </div>
        </div>
      )}
    </>
  );
}

function FixForm({ r, onDone }: { r: Row; onDone: () => void }) {
  const [f, setF] = useState({ status: r.status === "leave" ? "worked" : r.status, late: String(r.late_minutes || ""), early: String(r.early_leave_minutes || ""), over: String(r.overtime_minutes || ""), reason: r.reason ?? "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("PATCH", `/timesheets/${r.id}`, { onSuccess: onDone });
  const n = (v: string) => Number(v || 0);
  const num = (k: "late" | "early" | "over") => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "").slice(0, 3) }));
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ status: f.status, late_minutes: n(f.late), early_leave_minutes: n(f.early), overtime_minutes: n(f.over), reason: f.reason.trim() }); }
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Durum" required error={fieldError(m.error, "status")}>{(p) => <select {...p} className="field__input" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value as "worked" | "absent" }))}><option value="worked">Çalıştı</option><option value="absent">Gelmedi</option></select>}</Field>
        {f.status === "worked" && <>
          <Field label="Geç gelme (dk)" error={fieldError(m.error, "late_minutes")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.late} onChange={num("late")} />}</Field>
          <Field label="Erken çıkış (dk)" error={fieldError(m.error, "early_leave_minutes")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.early} onChange={num("early")} />}</Field>
          <Field label="Fazla mesai (dk)" error={fieldError(m.error, "overtime_minutes")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.over} onChange={num("over")} />}</Field>
        </>}
      </div>
      <Field label="Gerekçe" required error={fieldError(m.error, "reason")}>{(p) => <input {...p} className="field__input" maxLength={200} placeholder="ör. Trafik nedeniyle geç geldi" value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} />}</Field>
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Düzeltmeyi kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function MonthExport({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { site, can } = useSite();
  const pv = useSiteGet<ExportPreview>("/timesheet-exports/preview", { month });
  const hist = useSiteGet<Export[]>("/timesheet-exports");
  const run = useSiteMutation<{ month: string }, Export>("POST", "/timesheet-exports", { onSuccess: (x) => x && downloadCsv(x.file_name, fileRows(x.month, x.rows)) });
  return (
    <>
      <div className="filters"><div className="field"><label className="field__label" htmlFor="ts-m">Ay</label><input id="ts-m" className="field__input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div></div>
      {pv.isPending ? <Loading /> : pv.isError ? <ErrorState error={pv.error} /> : (
        <div className="card">
          <div className="card__head"><span className="card__title">{month} puantaj özeti</span>{pv.data.exported && <span className="ml-auto"><Badge tone="ok">Aktarıldı, kilitli</Badge></span>}</div>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            {pv.data.missing_days.length > 0 && <Alert tone="warn" title={`${pv.data.missing_days.length} gün kesinleşmedi`}>{pv.data.missing_days.slice(0, 10).map(formatDate).join(", ")}{pv.data.missing_days.length > 10 && "…"} — aktarım için tüm günler kesinleşmeli.</Alert>}
            {pv.data.missing_payroll.length > 0 && <Alert tone="warn" title="Bordro sicil no eksik">{pv.data.missing_payroll.join(", ")} — Personel kartından girin.</Alert>}
            <FormError error={run.error} />
          </div>
          {pv.data.rows.length === 0 ? <div className="card__body"><Empty title="Bu ay puantaj yok" /></div> : (
            <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Aylık puantaj özeti</caption>
              <thead><tr>{COLS.slice(0, 9).map(([k, l]) => <th key={k} scope="col" className={k === "name" || k === "payroll_no" ? undefined : "right"}>{l}</th>)}</tr></thead>
              <tbody>{pv.data.rows.map((r) => <tr key={String(r.staff_id)}>{COLS.slice(0, 9).map(([k]) => <td key={k} className={k === "name" ? "cell-main" : k === "payroll_no" ? "mono small" : "right num"}>{String(r[k] ?? "") === "" || r[k] === 0 ? "—" : typeof r[k] === "number" ? (r[k] as number).toLocaleString("tr-TR") : String(r[k])}</td>)}</tr>)}</tbody>
            </table></div></div>
          )}
          {can(P.staffManage) && (
            <div className="card__foot row row--between">
              <span className="small muted">Dosya: bordro sicil no, çalışılan gün, fazla mesai, gece çalışması, izin türleri. Bordro hesabı platformda yapılmaz.</span>
              <ConfirmButton className="btn btn--primary" disabled={!!pv.data.exported || pv.data.missing_days.length > 0 || pv.data.missing_payroll.length > 0 || pv.data.rows.length === 0} title="Puantajı aktar" confirmLabel="Dosyayı üret" body="Ayın puantajı dosyaya yazılır ve kilitlenir; bu ay için puantaj bir daha değiştirilemez." onConfirm={() => run.mutateAsync({ month })}><Download aria-hidden="true" /> Aktarım dosyası</ConfirmButton>
            </div>
          )}
        </div>
      )}
      <div className="card">
        <div className="card__head"><span className="card__title">Aktarım geçmişi</span></div>
        <div className="card__body card__body--flush">
          {!hist.data || hist.data.length === 0 ? <Empty title="Henüz aktarım yok" /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Puantaj aktarımları</caption>
              <thead><tr><th scope="col">Ay</th><th scope="col" className="right">Personel</th><th scope="col">Yapan</th><th scope="col"><span className="visually-hidden">Dosya</span></th></tr></thead>
              <tbody>{hist.data.map((x) => <tr key={x.id}><td className="cell-main">{x.month}</td><td className="right num">{x.rows.length}</td><td className="small">{x.created_by}<div className="cell-sub">{formatDateTime(x.created_at)}</div></td><td className="right"><button className="btn btn--ghost btn--sm" type="button" onClick={() => downloadCsv(x.file_name, fileRows(x.month, x.rows))}><Download aria-hidden="true" /> İndir</button></td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <p className="small muted">Mod K'da (KiviERP) puantaj bordroya doğrudan gönderilecek — {site.name} şu an Mod P.</p>
    </>
  );
}
