import { Fragment, useState, type FormEvent } from "react";
import { Download, Lock, RefreshCw } from "lucide-react";
import { download } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { attendanceFlag, attendanceMethod, leaveType, timesheetStatus } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Row = Schemas["TimesheetRowOut"];
type Day = Schemas["TimesheetDayOut"];
type ExportPreview = Schemas["TimesheetPreviewOut"];
type ExportRow = Schemas["TimesheetExportRowOut"];
type Export = Schemas["TimesheetExportOut"];
type Settings = Schemas["AttendanceSettingsOut"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7); };
const hm = (m: number) => `${Math.floor(m / 60)} sa${m % 60 ? ` ${m % 60} dk` : ""}`;
/** Saat metni ("6.67") → "6,67"; hesap yapılmaz, yalnız gösterilir. */
const hrs = (v: string) => (v === "0.00" ? "—" : v.replace(".", ","));
const COLS: [keyof ExportRow, string, "text" | "int" | "hours"][] = [
  ["payroll_no", "Bordro sicil no", "text"], ["name", "Ad soyad", "text"], ["worked_days", "Çalışılan gün", "int"], ["worked_hours", "Çalışma saati", "hours"],
  ["overtime_hours", "Fazla mesai saati", "hours"], ["night_hours", "Gece çalışması saati", "hours"], ["absent_days", "Devamsız gün", "int"],
  ["leave_annual", "Yıllık izin", "int"], ["leave_excuse", "Mazeret", "int"], ["leave_sick", "Raporlu", "int"], ["leave_unpaid", "Ücretsiz", "int"],
];

/**
 * Puantaj (IK-04/05): günlük puantaj vardiya planı, onaylı izinler ve (site açtıysa) QR/konum doğrulamalı giriş-çıkıştan
 * üretilir; yalnız istisnalar gerekçeyle düzeltilir; gün kesinleşir. Ay sonunda bordro sicil no ile dosyaya aktarılır.
 */
export function TimesheetPage() {
  const { can } = useSite();
  const manage = can(P.staffManage);
  const [s, set] = useUrlState({ sekme: manage ? "gun" : "aktarim", tarih: yesterday(), ay: lastMonth() });
  const tabs: [string, string][] = manage ? [["gun", "Günlük puantaj"], ["aktarim", "Aylık aktarım"], ["ayar", "Giriş-çıkış ayarı"]] : [["aktarim", "Aylık aktarım"]];
  return (
    <div className="stack">
      <PageHead title="Puantaj" subtitle="Vardiya planından otomatik; yalnız istisnaları düzeltin ve günü kesinleştirin. Ay sonunda bordroya aktarın." />
      <div className="row" role="tablist" aria-label="Puantaj" style={{ gap: "var(--s-2)" }}>
        {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k })}>{l}</button>)}
      </div>
      {s.sekme === "aktarim" || !manage ? <MonthExport month={s.ay} setMonth={(ay) => set({ ay })} /> : s.sekme === "ayar" ? <AttendanceSettings /> : <DayView date={s.tarih} setDate={(tarih) => set({ tarih })} />}
    </div>
  );
}

function DayView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const q = useSiteGet<Day>("/timesheets", { date });
  const fin = useSiteMutation<{ date: string }, unknown>("POST", "/timesheets/finalize");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <div className="filters"><div className="field"><label className="field__label" htmlFor="ts-date">Gün</label><input id="ts-date" className="field__input" type="date" max={yesterday()} value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="card">
          <div className="card__head"><span className="card__title">{formatDate(q.data.date)}</span><span className="card__meta">{attendanceMethod(q.data.attendance_method)}</span><span className="ml-auto">{q.data.is_final ? <Badge tone="ok">Kesin</Badge> : <Badge tone="warn">Taslak</Badge>}</span></div>
          <div className="card__body card__body--flush">
            {q.data.rows.length === 0 ? <Empty title="Bu gün vardiya yok">Vardiya planında atama yapılınca puantaj buradan üretilir.</Empty> : (
              <div className="table-wrap"><table className="data">
                <caption className="visually-hidden">Günlük puantaj</caption>
                <thead><tr><th scope="col">Personel</th><th scope="col">Vardiya</th><th scope="col">Durum</th><th scope="col" className="right">Çalışma</th><th scope="col">İstisna</th>{!q.data.is_final && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
                <tbody>{q.data.rows.map((r) => {
                  const key = r.id ?? `leave-${r.staff_id}`;
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td className="cell-main">{r.staff_name}<div className="cell-sub">{r.position ?? ""}{!r.payroll_no && " · sicil no yok"}</div></td>
                        <td className="small nowrap">{r.template}</td>
                        <td><Badge tone={r.status === "worked" ? "ok" : r.status === "absent" ? "danger" : "info"}>{r.status === "leave" && r.leave_type ? leaveType(r.leave_type) : timesheetStatus(r.status)}</Badge></td>
                        <td className="right small nowrap">{r.status === "worked" ? hm(r.worked_minutes) : "—"}{r.night_minutes > 0 && <div className="cell-sub">gece {hm(r.night_minutes)}</div>}</td>
                        <td className="small">
                          {[r.late_minutes && `geç ${r.late_minutes} dk`, r.early_leave_minutes && `erken çıkış ${r.early_leave_minutes} dk`, r.overtime_minutes && `fazla mesai ${r.overtime_minutes} dk`].filter(Boolean).join(", ") || "—"}
                          {r.flags.length > 0 && <div className="cell-sub">{r.flags.map(attendanceFlag).join(" · ")}</div>}
                          {r.reason && <div className="cell-sub">{r.reason} · {r.fixed_by}</div>}
                        </td>
                        {!q.data.is_final && <td className="right">{r.id && <button className="btn btn--ghost btn--sm" type="button" aria-expanded={editing === r.id} onClick={() => setEditing((x) => (x === r.id ? null : r.id ?? null))}>Düzelt</button>}</td>}
                      </tr>
                      {editing === r.id && r.id && <tr><td colSpan={6}><FixForm r={r} id={r.id} onDone={() => setEditing(null)} /></td></tr>}
                    </Fragment>
                  );
                })}</tbody>
              </table></div>
            )}
          </div>
          <div className="card__foot row row--between">
            <span className="small muted">{q.data.is_final ? `Kesinleştiren ${q.data.finalized_by}, ${formatDateTime(q.data.finalized_at)}. Kesin gün değişmez.` : "Plan dışında bir şey olmadıysa doğrudan kesinleştirin."}</span>
            {!q.data.is_final && q.data.rows.length > 0 && <ConfirmButton className="btn btn--primary" title="Günü kesinleştir" confirmLabel="Kesinleştir" body="Kesinleşen günün puantajı ve o güne ait vardiya atamaları değiştirilemez." onConfirm={() => fin.mutateAsync({ date })}><Lock aria-hidden="true" /> Günü kesinleştir</ConfirmButton>}
          </div>
        </div>
      )}
    </>
  );
}

function FixForm({ r, id, onDone }: { r: Row; id: string; onDone: () => void }) {
  const [f, setF] = useState({ status: r.status === "absent" ? "absent" : "worked", late: String(r.late_minutes || ""), early: String(r.early_leave_minutes || ""), over: String(r.overtime_minutes || ""), reason: r.reason ?? "" });
  const m = useSiteMutation<Record<string, unknown>, unknown>("PATCH", `/timesheets/${id}`, { onSuccess: onDone });
  const n = (v: string) => Number(v || 0);
  const num = (k: "late" | "early" | "over") => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "").slice(0, 3) }));
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ status: f.status, late_minutes: n(f.late), early_leave_minutes: n(f.early), overtime_minutes: n(f.over), reason: f.reason.trim() }); }
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={submit}>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Durum" required error={fieldError(m.error, "status")}>{(p) => <select {...p} className="field__input" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}><option value="worked">Çalıştı</option><option value="absent">Gelmedi</option></select>}</Field>
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
  const hist = useSiteGet<Page<Export>>("/timesheet-exports", { page_size: 24 });
  const file = (x: Export) => download(`/sites/${site.slug}/timesheet-exports/${x.id}/file`, undefined, x.file_name);
  const run = useSiteMutation<{ month: string }, Export>("POST", "/timesheet-exports", { onSuccess: (x) => { if (x) void file(x); } });
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
              <thead><tr>{COLS.map(([k, l, t]) => <th key={k} scope="col" className={t === "text" ? undefined : "right"}>{l}</th>)}</tr></thead>
              <tbody>{pv.data.rows.map((r) => <tr key={r.staff_id}>{COLS.map(([k, , t]) => {
                const v = r[k];
                return <td key={k} className={k === "name" ? "cell-main" : t === "text" ? "mono small" : "right num"}>{t === "hours" ? hrs(String(v)) : t === "int" ? (v ? String(v) : "—") : (v ?? "—")}</td>;
              })}</tr>)}</tbody>
            </table></div></div>
          )}
          {can(P.staffManage) && (
            <div className="card__foot row row--between">
              <span className="small muted">Dosya (CSV, Excel'de açılır): bordro sicil no, çalışılan gün, fazla mesai, gece çalışması, izin türleri. Bordro hesabı platformda yapılmaz.</span>
              <ConfirmButton className="btn btn--primary" disabled={!!pv.data.exported || pv.data.missing_days.length > 0 || pv.data.missing_payroll.length > 0 || pv.data.rows.length === 0} title="Puantajı aktar" confirmLabel="Dosyayı üret" body="Ayın puantajı dosyaya yazılır ve kilitlenir; bu ay için puantaj bir daha değiştirilemez." onConfirm={() => run.mutateAsync({ month })}><Download aria-hidden="true" /> Aktarım dosyası</ConfirmButton>
            </div>
          )}
        </div>
      )}
      <div className="card">
        <div className="card__head"><span className="card__title">Aktarım geçmişi</span></div>
        <div className="card__body card__body--flush">
          {!hist.data || hist.data.items.length === 0 ? <Empty title="Henüz aktarım yok" /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Puantaj aktarımları</caption>
              <thead><tr><th scope="col">Ay</th><th scope="col" className="right">Personel</th><th scope="col">Yapan</th><th scope="col"><span className="visually-hidden">Dosya</span></th></tr></thead>
              <tbody>{hist.data.items.map((x) => <tr key={x.id}><td className="cell-main">{x.month}</td><td className="right num">{x.staff_count}</td><td className="small">{x.created_by}<div className="cell-sub">{formatDateTime(x.created_at)}</div></td><td className="right"><button className="btn btn--ghost btn--sm" type="button" onClick={() => void file(x)}><Download aria-hidden="true" /> İndir</button></td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <p className="small muted">Mod K'da (KiviERP) puantaj bordroya doğrudan gönderilecek (A-01 sonrası) — {site.name} şu an dosya ile aktarıyor.</p>
    </>
  );
}

function AttendanceSettings() {
  const q = useSiteGet<Settings>("/attendance-settings");
  return q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : <SettingsForm s={q.data} />;
}

function SettingsForm({ s }: { s: Settings }) {
  const [f, setF] = useState({ method: s.method, latitude: s.latitude ?? "", longitude: s.longitude ?? "", radius_m: String(s.radius_m), late: String(s.late_tolerance_minutes), early: String(s.early_tolerance_minutes) });
  const save = useSiteMutation<Record<string, unknown>, Settings>("PUT", "/attendance-settings");
  const rotate = useSiteMutation<Record<string, never>, Settings>("POST", "/attendance-settings/rotate-code");
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const int = (v: string) => (v.trim() === "" ? null : Number(v));
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ method: f.method, latitude: f.latitude.trim().replace(",", ".") || null, longitude: f.longitude.trim().replace(",", ".") || null, radius_m: int(f.radius_m), late_tolerance_minutes: int(f.late), early_tolerance_minutes: int(f.early) });
  }
  return (
    <>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__head"><span className="card__title">Vardiya giriş-çıkışı</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={save.error} />
          <p className="small muted mb-0">Personel "Vardiyam" ekranından vardiyaya başlar ve bitirir. Yalnız o anki konum ya da kod alınır; sürekli konum takibi yapılmaz, konum saklanmaz. Doğrulanamayan kayıt reddedilmez, puantajda istisna olarak düşer.</p>
          <div className="grid grid--kpi">
            <Field label="Doğrulama" error={fieldError(save.error, "method")}>{(p) => <select {...p} className="field__input" value={f.method} onChange={up("method")}>{["none", "qr", "location"].map((m) => <option key={m} value={m}>{attendanceMethod(m)}</option>)}</select>}</Field>
            <Field label="Geç gelme toleransı (dk)" error={fieldError(save.error, "late_tolerance_minutes")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.late} onChange={up("late")} />}</Field>
            <Field label="Erken çıkış toleransı (dk)" error={fieldError(save.error, "early_tolerance_minutes")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.early} onChange={up("early")} />}</Field>
            {f.method === "location" && <>
              <Field label="Tesis enlemi" hint="ör. 41.015137" error={fieldError(save.error, "latitude")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.latitude} onChange={up("latitude")} />}</Field>
              <Field label="Tesis boylamı" hint="ör. 28.979530" error={fieldError(save.error, "longitude")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.longitude} onChange={up("longitude")} />}</Field>
              <Field label="Yarıçap (m)" error={fieldError(save.error, "radius_m")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.radius_m} onChange={up("radius_m")} />}</Field>
            </>}
          </div>
        </div>
        <div className="card__foot"><SubmitButton busy={save.isPending}>Kaydet</SubmitButton></div>
      </form>
      {f.method === "qr" && (
        <div className="card">
          <div className="card__head"><span className="card__title">Kulübe kodu</span>{s.qr_rotated_at && <span className="card__meta ml-auto">{formatDateTime(s.qr_rotated_at)}</span>}</div>
          <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
            {s.qr_code ? <p className="mono" style={{ fontSize: "1.5rem", letterSpacing: "0.1em" }}>{s.qr_code}</p> : <p className="small muted">Ayarı kaydedince kod oluşur.</p>}
            <p className="small muted mb-0">Bu kodu kulübeye asın (personel okutur ya da yazar). Kod sızarsa yenileyin; eski kod hemen geçersiz olur.</p>
          </div>
          <div className="card__foot"><ConfirmButton className="btn" title="Kodu yenile" confirmLabel="Yenile" body="Eski kod artık doğrulanmaz; yeni kodu kulübeye asmanız gerekir." onConfirm={() => rotate.mutateAsync({})}><RefreshCw aria-hidden="true" /> Kodu yenile</ConfirmButton></div>
        </div>
      )}
    </>
  );
}
