import { useState, type FormEvent } from "react";
import { AlertTriangle, BarChart3, CalendarClock, CalendarOff, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Send, Users, X } from "lucide-react";
import { BarChart } from "../../components/charts";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, Segmented, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { conflictKind, leaveType } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Template = Schemas["ShiftTemplateOut"];
type Plan = Schemas["ShiftPlanOut"];

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monday = (d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
const plus = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return iso(x); };
const short = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });

/**
 * Vardiya planı (IK-02): şablonlar, haftalık plan (personel × gün), çakışma kontrolü (aynı kişiye çakışan vardiya,
 * onaylı izin günü, 11 saatten az dinlenme), kopyala ve yayınla. Yayınlanan hafta kartı bağlı personelin "Vardiyam"ında
 * görünür ve bildirim gider (K29). Raporlu izin türü yalnız staff.manage'e gelir; diğerleri "İzinli" görür.
 */
export function ShiftPlanPage() {
  const { can } = useSite();
  const manage = can(P.staffManage);
  const [s, set] = useUrlState({ hafta: monday(), sekme: "plan" });
  const q = useSiteGet<Plan>("/shift-plans", { from: s.hafta, to: plus(s.hafta, 6) });
  return (
    <div className="stack">
      <PageHead title="Vardiya planı" subtitle="Saha ekibinin haftalık vardiyaları. Puantaj bu plandan üretilir; izinler planda görünür." />
      {q.isError ? null : !q.data ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : (
        <WeekKpis p={q.data} week={s.hafta} />
      )}
      <Segmented label="Vardiya" value={s.sekme} onChange={(k) => set({ sekme: k })} options={[{ value: "plan", label: "Haftalık plan" }, { value: "sablon", label: "Vardiya şablonları" }]} />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : s.sekme === "sablon" ? <Templates list={q.data.templates} manage={manage} /> : <WeekPlan p={q.data} week={s.hafta} setWeek={(w) => set({ hafta: w })} manage={manage} />}
    </div>
  );
}

/** Bant altı göstergeler: seçili haftanın planından (personel, atama, izinli, çakışma). Yeni hesap yok, yalnız sayım. */
function WeekKpis({ p, week }: { p: Plan; week: string }) {
  const onLeave = new Set(p.leaves.map((l) => l.staff_id)).size;
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Personel" icon={<Users aria-hidden="true" />} value={p.staff.length} note={`${short(week)} – ${short(plus(week, 6))} haftası`} />
      <Kpi label="Vardiya ataması" tone="accent" icon={<CalendarClock aria-hidden="true" />} value={p.assignments.length}
        delta={p.published ? { tone: "ok", label: "yayında" } : { tone: "muted", label: "taslak" }} />
      <Kpi label="İzinli personel" icon={<CalendarOff aria-hidden="true" />} value={onLeave} note="bu hafta onaylı izni olan" />
      <Kpi label="Çakışma" tone={p.conflicts.length > 0 ? "danger" : "ok"} icon={<AlertTriangle aria-hidden="true" />} value={p.conflicts.length} note={p.conflicts.length > 0 ? "kırmızı hücrelere bakın" : "çakışma yok"} />
    </div>
  );
}

/** Günlere göre atama sayısı: haftanın yükü bir bakışta. */
function DayLoad({ p, week }: { p: Plan; week: string }) {
  const days = Array.from({ length: 7 }, (_, i) => plus(week, i));
  const today = iso(new Date());
  const data = days.map((d, i) => ({ label: DAYS[i]!, value: p.assignments.filter((a) => a.date === d).length, sub: short(d) }));
  const hi = days.indexOf(today);
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span>
        <span className="card__title">Günlere göre vardiya</span>
        <span className="card__meta ml-auto">atama sayısı</span>
      </div>
      <div className="card__body">
        <BarChart compact label="Günlere göre vardiya ataması" data={data} format={(v) => `${Math.round(v)}`} highlight={hi >= 0 ? hi : undefined} />
      </div>
    </div>
  );
}

function WeekPlan({ p, week, setWeek, manage }: { p: Plan; week: string; setWeek: (w: string) => void; manage: boolean }) {
  const days = Array.from({ length: 7 }, (_, i) => plus(week, i));
  const tpl = new Map(p.templates.map((t) => [t.id, t]));
  const conflict = new Map(p.conflicts.map((c) => [c.assignment_id, c]));
  const [cell, setCell] = useState<{ staff: string; date: string } | null>(null);
  const publish = useSiteMutation<{ week: string; acknowledge_conflicts: boolean }, unknown>("POST", "/shift-plans/publish");
  const copy = useSiteMutation<{ from_week: string; to_week: string }, unknown>("POST", "/shift-plans/copy-week");
  const del = useSiteMutation<{ id: string }, unknown>("DELETE", (v) => `/shift-plans/assignments/${v.id}`);
  const onLeave = (staff: string, date: string) => p.leaves.find((l) => l.staff_id === staff && l.from <= date && l.to >= date);
  const finalDays = new Set(p.final_days);
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}>
          <button className="btn btn--sm btn--icon" type="button" aria-label="Önceki hafta" onClick={() => setWeek(plus(week, -7))}><ChevronLeft aria-hidden="true" /></button>
          <span className="strong nowrap">{short(week)} – {short(plus(week, 6))}</span>
          <button className="btn btn--sm btn--icon" type="button" aria-label="Sonraki hafta" onClick={() => setWeek(plus(week, 7))}><ChevronRight aria-hidden="true" /></button>
          {p.published ? <Badge tone="ok">Yayında</Badge> : <Badge>Taslak</Badge>}
        </div>
        {manage && (
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <ConfirmButton className="btn btn--sm" title="Önceki haftayı kopyala" confirmLabel="Kopyala" body="Önceki haftanın atamaları bu haftaya kopyalanır; var olan atamalar korunur." onConfirm={() => copy.mutateAsync({ from_week: plus(week, -7), to_week: week })}><Copy aria-hidden="true" /> Önceki haftayı kopyala</ConfirmButton>
            <ConfirmButton className="btn btn--sm btn--primary" disabled={p.assignments.length === 0} title="Haftayı yayınla" confirmLabel={p.conflicts.length ? "Uyarılara rağmen yayınla" : "Yayınla"}
              body={<>{p.conflicts.length > 0 && <p className="field__error">{p.conflicts.length} çakışma var (kırmızı hücreler).</p>}<p className="mb-0">Plan yayınlanınca giriş hesabı bağlı personele uygulama içi bildirim gider ve "Vardiyam"da görünür (SMS/e-posta K5 ile).</p></>}
              onConfirm={() => publish.mutateAsync({ week, acknowledge_conflicts: true })}><Send aria-hidden="true" /> Yayınla</ConfirmButton>
          </div>
        )}
      </div>
      {p.published && <p className="small muted mb-0">Yayınlayan {p.published.by}, {formatDateTime(p.published.at)}.{p.changed_after_publish > 0 && <> <Badge tone="warn">{p.changed_after_publish} değişiklik yayından sonra</Badge></>}</p>}
      {p.conflicts.length > 0 && <Alert tone="warn" title={`${p.conflicts.length} çakışma`}>{[...new Set(p.conflicts.map((c) => conflictKind(c.kind)))].join(", ")}. Yayın engellenmez; onayla yayınlanır.</Alert>}
      {p.staff.length === 0 ? <Empty title="Çalışan personel yok">Önce Personel ekranından ekleyin.</Empty> : (
        <div className="card"><div className="card__body card__body--flush"><div className="table-wrap"><table className="data shift-grid">
          <caption className="visually-hidden">Haftalık vardiya planı</caption>
          <thead><tr><th scope="col">Personel</th>{days.map((d, i) => <th key={d} scope="col">{DAYS[i]}<div className="cell-sub">{short(d)}</div></th>)}</tr></thead>
          <tbody>{p.staff.map((st) => (
            <tr key={st.id}>
              <th scope="row"><div className="cell-person"><Avatar name={st.full_name} size="sm" soft /><div><div className="cell-main">{st.full_name}</div><div className="cell-sub">{st.position}</div></div></div></th>
              {days.map((d) => {
                const as = p.assignments.filter((a) => a.staff_id === st.id && a.date === d);
                const lv = onLeave(st.id, d);
                return (
                  <td key={d} className={lv ? "shift-cell shift-cell--leave" : "shift-cell"}>
                    {lv && <div className="xs muted">{lv.type ? leaveType(lv.type) : "İzinli"}</div>}
                    {finalDays.has(d) && <div className="xs muted">puantaj kesin</div>}
                    {as.map((a) => {
                      const t = tpl.get(a.template_id); const c = conflict.get(a.id);
                      return (
                        <span key={a.id} className={`shift-chip${c ? " shift-chip--conflict" : ""}`} title={c?.message}>
                          {t ? `${t.name} ${t.start}–${t.end}` : "?"}{c && <span className="visually-hidden"> — {c.message}</span>}
                          {manage && !finalDays.has(d) && <button type="button" className="shift-chip__x" aria-label={`${st.full_name} ${short(d)} ${t?.name ?? ""} atamasını kaldır`} onClick={() => del.mutate({ id: a.id })}><X aria-hidden="true" /></button>}
                        </span>
                      );
                    })}
                    {manage && !finalDays.has(d) && (cell?.staff === st.id && cell.date === d ? (
                      <AssignForm staff={st.id} date={d} templates={p.templates.filter((t) => t.is_active)} onDone={() => setCell(null)} />
                    ) : <button type="button" className="btn btn--ghost btn--sm shift-add" aria-label={`${st.full_name} ${short(d)} vardiya ekle`} onClick={() => setCell({ staff: st.id, date: d })}><Plus aria-hidden="true" /></button>)}
                  </td>
                );
              })}
            </tr>
          ))}</tbody>
        </table></div></div></div>
      )}
      {p.assignments.length > 0 && <DayLoad p={p} week={week} />}
    </>
  );
}

function AssignForm({ staff, date, templates, onDone }: { staff: string; date: string; templates: Template[]; onDone: () => void }) {
  const m = useSiteMutation<{ staff_id: string; date: string; template_id: string }, unknown>("POST", "/shift-plans/assignments", { onSuccess: onDone });
  return (
    <span className="stack" style={{ gap: 4 }}>
      <select className="field__input" style={{ minHeight: 36, padding: "0 6px" }} aria-label="Vardiya seç" autoFocus defaultValue="" onChange={(e) => e.target.value && m.mutate({ staff_id: staff, date, template_id: e.target.value })}>
        <option value="">Vardiya…</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name} {t.start}–{t.end}</option>)}
      </select>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>Vazgeç</button>
      {m.error && <span className="field__error">{(m.error as Error).message}</span>}
    </span>
  );
}

function Templates({ list, manage }: { list: Template[]; manage: boolean }) {
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  return (
    <>
      {manage && <div className="row"><button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Şablon ekle</button></div>}
      {editing && <TemplateForm t={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="card"><div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
        <caption className="visually-hidden">Vardiya şablonları</caption>
        <thead><tr><th scope="col">Şablon</th><th scope="col">Saat</th><th scope="col" className="right">Mola</th><th scope="col">Görev / yer</th><th scope="col">Durum</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
        <tbody>{list.map((t) => (
          <tr key={t.id}>
            <td className="cell-main">{t.name}</td>
            <td className="small nowrap">{t.start}–{t.end}{t.end <= t.start && <div className="cell-sub">ertesi güne taşar</div>}</td>
            <td className="right num">{t.break_minutes} dk</td>
            <td className="small">{[t.position, t.location].filter(Boolean).join(" · ") || "—"}</td>
            <td>{t.is_active ? <Badge tone="ok">Etkin</Badge> : <Badge>Kapalı</Badge>}</td>
            {manage && <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${t.name} düzenle`} onClick={() => setEditing(t)}><Pencil aria-hidden="true" /></button></td>}
          </tr>
        ))}</tbody>
      </table></div></div></div>
    </>
  );
}

function TemplateForm({ t, onDone }: { t: Template | null; onDone: () => void }) {
  const [f, setF] = useState({ name: t?.name ?? "", start: t?.start ?? "08:00", end: t?.end ?? "16:00", break_minutes: String(t?.break_minutes ?? 60), position: t?.position ?? "", location: t?.location ?? "", is_active: t?.is_active ?? true });
  const m = useSiteMutation<Record<string, unknown>, Template>(t ? "PATCH" : "POST", t ? `/shift-templates/${t.id}` : "/shift-templates", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ ...f, break_minutes: Number(f.break_minutes) }); }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{t ? `${t.name} — düzenle` : "Vardiya şablonu"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={40} placeholder="ör. Sabah" value={f.name} onChange={up("name")} />}</Field>
          <Field label="Başlangıç" required error={fieldError(m.error, "start")}>{(p) => <input {...p} className="field__input" type="time" value={f.start} onChange={up("start")} />}</Field>
          <Field label="Bitiş" required hint="Başlangıçtan küçükse ertesi güne taşar" error={fieldError(m.error, "end")}>{(p) => <input {...p} className="field__input" type="time" value={f.end} onChange={up("end")} />}</Field>
          <Field label="Mola (dk)" error={fieldError(m.error, "break_minutes")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.break_minutes} onChange={(e) => setF((x) => ({ ...x, break_minutes: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}</Field>
          <Field label="Görev" hint="İsteğe bağlı">{(p) => <input {...p} className="field__input" maxLength={40} placeholder="ör. Güvenlik" value={f.position} onChange={up("position")} />}</Field>
          <Field label="Kapı / yer" hint="İsteğe bağlı">{(p) => <input {...p} className="field__input" maxLength={40} placeholder="ör. Ana kapı" value={f.location} onChange={up("location")} />}</Field>
        </div>
        {t && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Etkin (kapalı şablon yeni atamada çıkmaz)</span></label>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.name.trim()}>{t ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
