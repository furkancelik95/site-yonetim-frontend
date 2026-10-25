import { useState, type FormEvent } from "react";
import { CalendarClock, LogIn, LogOut, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, todayIso } from "../../lib/format";
import { attendanceMethod, leaveStatus, leaveStatusTone, leaveType } from "../../lib/labels";

type Shifts = Schemas["StaffOwnShiftsOut"];
type Shift = Schemas["StaffOwnShiftOut"];
type Leave = Schemas["LeaveRequestOut"];
const TYPES = ["annual", "excuse", "sick", "unpaid"];

function forbidden(error: unknown) {
  return !!error && typeof error === "object" && (error as { status?: number }).status === 403;
}
const time = (ts: string) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Vardiyam (K29; IK-02 mobil görünüm, IK-03 izin talebi, IK-04 giriş-çıkış): giriş hesabı personel kartına bağlı kişi
 * yayınlanmış vardiyalarını görür, vardiyaya başlar/bitirir (site ayarına göre kulübe kodu ya da o anki konum) ve izin
 * talep eder. Konum yalnız düğmeye basıldığı an alınır, saklanmaz.
 */
export function MyShiftPage() {
  const q = useSiteGet<Shifts>("/me/shifts");
  if (q.isPending) return <Loading />;
  if (q.isError) {
    return (
      <div className="stack">
        <PageHead title="Vardiyam" />
        {forbidden(q.error) ? <Alert tone="info" title="Personel kartı bağlı değil">Hesabınız bir personel kartına bağlı değil. Site yönetimi Personel ekranından kartınıza hesabınızı bağlayınca vardiyalarınız burada görünür.</Alert> : <ErrorState error={q.error} />}
      </div>
    );
  }
  const today = todayIso();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const active = q.data.shifts.filter((s) => s.date === today || (s.date === iso(y) && s.template.overnight));
  return (
    <div className="stack">
      <PageHead title="Vardiyam" subtitle={`${q.data.full_name} · ${q.data.position}. Giriş-çıkış: ${attendanceMethod(q.data.attendance_method)}.`} />
      {active.length > 0 && <div className="stack">{active.map((s) => <ClockCard key={s.id} s={s} method={q.data.attendance_method} />)}</div>}
      <div className="card">
        <div className="card__head"><span className="card__title">Yayınlanmış vardiyalarım</span><span className="card__meta ml-auto">bu ve gelecek hafta</span></div>
        <div className="card__body card__body--flush">
          {q.data.shifts.length === 0 ? <Empty title="Yayınlanmış vardiya yok" icon={<CalendarClock aria-hidden="true" />}>Plan yayınlanınca burada görünür ve bildirim alırsınız.</Empty> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Vardiyalarım</caption>
              <thead><tr><th scope="col">Gün</th><th scope="col">Vardiya</th><th scope="col">Yer</th><th scope="col">Giriş-çıkış</th></tr></thead>
              <tbody>{q.data.shifts.map((s) => (
                <tr key={s.id}>
                  <td className="cell-main nowrap">{formatDate(s.date)}{s.changed_after_publish && <div className="cell-sub"><Badge tone="warn">değişti</Badge></div>}</td>
                  <td className="small nowrap">{s.template.name} {s.template.start}–{s.template.end}{s.template.overnight && <div className="cell-sub">ertesi güne taşar</div>}</td>
                  <td className="small">{[s.template.position, s.template.location].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="small">{s.events.length === 0 ? "—" : s.events.map((e) => `${e.kind === "in" ? "Giriş" : "Çıkış"} ${time(e.occurred_at)}${e.verified ? "" : " (doğrulanamadı)"}`).join(", ")}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <MyLeaves />
    </div>
  );
}

function position(): Promise<{ latitude: string; longitude: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Bu cihaz konum vermiyor.")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }),
      () => reject(new Error("Konum izni verilmedi; yalnız bu anki konum alınır.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function ClockCard({ s, method }: { s: Shift; method: string }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/me/attendance-events");
  const started = s.events.some((e) => e.kind === "in");
  const ended = s.events.some((e) => e.kind === "out");
  const kind = started ? "out" : "in";
  async function go(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const extra = method === "location" ? await position() : method === "qr" ? { code: code.trim() } : {};
      await m.mutateAsync({ kind, assignment_id: s.id, ...extra });
      setCode("");
    } catch (x) { setErr(x); }
  }
  return (
    <form className="card" onSubmit={go} noValidate>
      <div className="card__head"><span className="card__title">{s.template.name} {s.template.start}–{s.template.end}</span><span className="card__meta ml-auto">{formatDate(s.date)}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={err} />
        {ended ? <p className="mb-0">Vardiya tamamlandı.</p> : method === "qr" && (
          <Field label="Kulübe kodu" required hint="Kulübedeki koddaki harf ve rakamlar" error={fieldError(err, "code")}>{(p) => <input {...p} className="field__input mono" autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
        )}
        {!ended && method === "location" && <p className="small muted mb-0">Düğmeye basınca yalnız o anki konumunuz alınır; sürekli takip yapılmaz.</p>}
      </div>
      {!ended && <div className="card__foot"><SubmitButton busy={m.isPending}>{kind === "in" ? <><LogIn aria-hidden="true" /> Vardiyaya başla</> : <><LogOut aria-hidden="true" /> Vardiyayı bitir</>}</SubmitButton></div>}
    </form>
  );
}

function MyLeaves() {
  const q = useSiteGet<Page<Leave>>("/me/leave-requests", { page_size: 20 });
  const [adding, setAdding] = useState(false);
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">İzinlerim</span><button className="btn btn--sm ml-auto" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> İzin talep et</button></div>
      {adding && <div className="card__body"><LeaveRequestForm onDone={() => setAdding(false)} /></div>}
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="İzin talebiniz yok" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">İzin taleplerim</caption>
            <thead><tr><th scope="col">İzin</th><th scope="col">Tarih</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.items.map((l) => (
              <tr key={l.id}>
                <td className="small">{leaveType(l.type)}<div className="cell-sub">{formatDateTime(l.created_at)}</div></td>
                <td className="small nowrap">{formatDate(l.from)} – {formatDate(l.to)}<div className="cell-sub">{l.days} gün</div></td>
                <td><Badge tone={leaveStatusTone(l.status)}>{leaveStatus(l.status)}</Badge>{l.reject_reason && <div className="cell-sub">{l.reject_reason}</div>}</td>
                <td className="right">{l.status === "pending" && <CancelOwn id={l.id} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function CancelOwn({ id }: { id: string }) {
  const m = useSiteMutation<Record<string, never>, Leave>("POST", `/me/leave-requests/${id}/cancel`);
  return <ConfirmButton className="btn btn--ghost btn--sm" title="Talebi geri çek" confirmLabel="Geri çek" body="İzin talebiniz geri çekilir." onConfirm={() => m.mutateAsync({})}>Geri çek</ConfirmButton>;
}

function LeaveRequestForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ type: "annual", from: todayIso(), to: todayIso(), note: "" });
  const m = useSiteMutation<Record<string, unknown>, Leave>("POST", "/me/leave-requests", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sick = f.type === "sick";
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ ...f, note: sick ? null : f.note.trim() || null }); }
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} onSubmit={submit} noValidate>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="İzin türü" required error={fieldError(m.error, "type")}>{(p) => <select {...p} className="field__input" value={f.type} onChange={up("type")}>{TYPES.map((t) => <option key={t} value={t}>{leaveType(t)}</option>)}</select>}</Field>
        <Field label="Başlangıç" required error={fieldError(m.error, "from")}>{(p) => <input {...p} className="field__input" type="date" value={f.from} onChange={up("from")} />}</Field>
        <Field label="Bitiş" required error={fieldError(m.error, "to")}>{(p) => <input {...p} className="field__input" type="date" min={f.from} value={f.to} onChange={up("to")} />}</Field>
      </div>
      {sick ? <Alert tone="info">Raporlu izinde tanı ya da açıklama yazılmaz; rapor belgesini site yönetimine iletin.</Alert>
        : <Field label="Açıklama" error={fieldError(m.error, "note")}>{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={up("note")} />}</Field>}
      <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Talep et</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
