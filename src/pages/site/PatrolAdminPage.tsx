import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, MapPin, Pencil, Plus, Printer, Route } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Badge, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { patrolSlotStatus, patrolSlotTone, tagType } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

/** Servis isteği 46'daki şekiller. */
interface Point { id: string; name: string; location: string | null; area: string | null; tag: "qr" | "nfc" | "both"; code: string; is_active: boolean }
interface Plan { id: string; name: string; point_ids: string[]; ordered: boolean; start_times: string[]; allowed_minutes: number; assignee: string | null; is_active: boolean }
interface Report { missed: string[]; out_of_order: string[]; duration_minutes: number; overtime: boolean; late_start_minutes: number; total_points: number; scanned_points: number; ok: boolean }
interface Slot { plan_id: string; plan_name: string; slot: string; status: string; report: Report | null }
interface Run { id: string; plan_name: string; slot: string | null; started_by: string; started_at: string; finished_at: string | null; report: Report }

/**
 * Devriye (GUV-09, yönetim): kontrol noktaları ve QR etiketleri, tur planları (sıra, saatler, süre), bugünkü takvim
 * ve sapma raporu. Görevli turu Güvenlik › Devriye sekmesinden yürütür. NFC eşleme mobil uygulamayla gelecek.
 */
export function PatrolAdminPage() {
  const [s, set] = useUrlState({ sekme: "rapor", tarih: todayIso() });
  return (
    <div className="stack">
      <PageHead title="Devriye" subtitle="Kontrol noktaları, tur planları ve sapma raporu. Kaçırılan nokta, geç başlayan ya da süresi aşan tur burada görünür." />
      <div className="row" role="tablist" aria-label="Devriye" style={{ gap: "var(--s-2)" }}>
        {[["rapor", "Takvim ve rapor"], ["nokta", "Kontrol noktaları"], ["plan", "Tur planları"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k! })}>{l}</button>)}
      </div>
      {s.sekme === "nokta" ? <Points /> : s.sekme === "plan" ? <Plans /> : <ReportView date={s.tarih} setDate={(tarih) => set({ tarih })} />}
    </div>
  );
}

function ReportView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const sched = useSiteGet<Slot[]>("/patrol-schedule", { date });
  const runs = useSiteGet<Run[]>("/patrol-runs", { date });
  return (
    <>
      <div className="filters"><div className="field"><label className="field__label" htmlFor="pt-d">Gün</label><input id="pt-d" className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
      <div className="card">
        <div className="card__head"><span className="card__title">Planlı turlar</span></div>
        <div className="card__body card__body--flush">
          {sched.isPending ? <Loading /> : !sched.data || sched.data.length === 0 ? <Empty title="Planlı tur yok" icon={<Route aria-hidden="true" />} /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Günün devriye takvimi</caption>
              <thead><tr><th scope="col">Saat</th><th scope="col">Tur</th><th scope="col">Durum</th><th scope="col">Sapma</th></tr></thead>
              <tbody>{sched.data.map((x) => (
                <tr key={`${x.plan_id}-${x.slot}`}>
                  <td className="mono">{x.slot}</td><td className="cell-main">{x.plan_name}</td>
                  <td><Badge tone={patrolSlotTone(x.status)}>{patrolSlotStatus(x.status)}</Badge></td>
                  <td className="small">{x.report ? deviation(x.report) : x.status === "not_started" ? "Tur başlamadı — yöneticiye kritik bildirim" : "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Yürütülen turlar</span></div>
        <div className="card__body card__body--flush">
          {!runs.data || runs.data.length === 0 ? <Empty title="Bu gün yürütülen tur yok" /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Devriye yürütmeleri</caption>
              <thead><tr><th scope="col">Tur</th><th scope="col">Görevli</th><th scope="col" className="right">Nokta</th><th scope="col" className="right">Süre</th><th scope="col">Sonuç</th></tr></thead>
              <tbody>{runs.data.map((r) => (
                <tr key={r.id}>
                  <td className="cell-main">{r.plan_name}{r.slot && <div className="cell-sub mono">{r.slot}</div>}</td>
                  <td className="small">{r.started_by}<div className="cell-sub">{formatDateTime(r.started_at)}</div></td>
                  <td className="right num">{r.report.scanned_points}/{r.report.total_points}</td>
                  <td className="right num">{r.report.duration_minutes} dk</td>
                  <td className="small">{!r.finished_at ? <Badge tone="info">Sürüyor</Badge> : r.report.ok ? <Badge tone="ok">Sorunsuz</Badge> : deviation(r.report)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </>
  );
}
const deviation = (r: Report) => [r.missed.length ? `Okutulmayan: ${r.missed.join(", ")}` : "", r.out_of_order.length ? `Sıra dışı: ${r.out_of_order.join(", ")}` : "", r.overtime ? "Süre aşıldı" : "", r.late_start_minutes > 15 ? `${r.late_start_minutes} dk geç başladı` : ""].filter(Boolean).join(" · ") || "Sorunsuz";

function Points() {
  const { site } = useSite();
  const q = useSiteGet<Point[]>("/patrol-points");
  const [editing, setEditing] = useState<Point | "new" | null>(null);
  const [print, setPrint] = useState(false);
  return (
    <>
      <div className="row print-hide" style={{ gap: "var(--s-2)" }}>
        <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Nokta ekle</button>
        {q.data && q.data.length > 0 && <button className="btn" type="button" onClick={() => setPrint((v) => !v)}><Printer aria-hidden="true" /> {print ? "Etiketleri gizle" : "QR etiketleri"}</button>}
      </div>
      {editing && <PointForm p={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      {print && q.data ? <Labels points={q.data.filter((p) => p.is_active && p.tag !== "nfc")} site={site.name} /> : (
        <div className="card"><div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Kontrol noktası yok" icon={<MapPin aria-hidden="true" />} /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Kontrol noktaları</caption>
              <thead><tr><th scope="col">Nokta</th><th scope="col">Etiket</th><th scope="col">Kod</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
              <tbody>{q.data.map((p) => (
                <tr key={p.id}>
                  <td><div className="cell-main">{p.name}</div><div className="cell-sub">{[p.area, p.location].filter(Boolean).join(" · ")}</div></td>
                  <td className="small">{tagType(p.tag)}</td><td className="mono">{p.code}</td>
                  <td>{p.is_active ? <Badge tone="ok">Etkin</Badge> : <Badge>Kapalı</Badge>}</td>
                  <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${p.name} düzenle`} onClick={() => setEditing(p)}><Pencil aria-hidden="true" /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div></div>
      )}
    </>
  );
}

function Labels({ points, site }: { points: Point[]; site: string }) {
  const [imgs, setImgs] = useState<Record<string, string>>({});
  useEffect(() => { Promise.all(points.map((p) => QRCode.toDataURL(`SY-DEVRIYE:${p.code}`, { width: 360, margin: 1 }).then((d) => [p.id, d] as const))).then((x) => setImgs(Object.fromEntries(x))); }, [points.map((p) => p.id).join()]);
  return (
    <div className="stack">
      <div className="row print-hide"><button className="btn btn--primary" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır</button><span className="small muted">Etiketi noktaya yapıştırın; görevli QR'ı okutur ya da altındaki kodu girer.</span></div>
      <div className="poster-labels">{points.map((p) => (
        <section key={p.id} className="poster poster--label" aria-label={`${p.name} devriye etiketi`}>
          <div className="poster__brand">{site}</div>
          <div className="poster__scope">{p.name}</div>
          {imgs[p.id] ? <img className="poster__qr" src={imgs[p.id]} alt={`${p.name} devriye noktası QR kodu`} /> : <div className="poster__qr" aria-hidden="true" />}
          <div className="poster__url mono" style={{ fontSize: ".9rem" }}>{p.code}</div>
        </section>
      ))}</div>
    </div>
  );
}

function PointForm({ p, onDone }: { p: Point | null; onDone: () => void }) {
  const [f, setF] = useState({ name: p?.name ?? "", location: p?.location ?? "", area: p?.area ?? "", tag: p?.tag ?? "qr", is_active: p?.is_active ?? true });
  const m = useSiteMutation<Record<string, unknown>, Point>(p ? "PATCH" : "POST", p ? `/patrol-points/${p.id}` : "/patrol-points", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
      <div className="card__head"><span className="card__title">{p ? `${p.name} — düzenle` : "Kontrol noktası"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(x) => <input {...x} className="field__input" maxLength={60} placeholder="ör. Otopark B girişi" value={f.name} onChange={(e) => setF((v) => ({ ...v, name: e.target.value }))} />}</Field>
          <Field label="Blok / alan">{(x) => <input {...x} className="field__input" maxLength={40} value={f.area} onChange={(e) => setF((v) => ({ ...v, area: e.target.value }))} />}</Field>
          <Field label="Konum açıklaması">{(x) => <input {...x} className="field__input" maxLength={80} value={f.location} onChange={(e) => setF((v) => ({ ...v, location: e.target.value }))} />}</Field>
          <Field label="Etiket" required>{(x) => <select {...x} className="field__input" value={f.tag} onChange={(e) => setF((v) => ({ ...v, tag: e.target.value as Point["tag"] }))}>{["qr", "nfc", "both"].map((k) => <option key={k} value={k}>{tagType(k)}</option>)}</select>}</Field>
        </div>
        {f.tag !== "qr" && <p className="small muted mb-0">NFC etiketi (NTAG213/215) mobil uygulamada yönetici telefonuyla okutularak eşlenecek; o zamana kadar QR kullanılır.</p>}
        {p && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((v) => ({ ...v, is_active: e.target.checked }))} /><span>Etkin</span></label>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.name.trim()}>{p ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function Plans() {
  const q = useSiteGet<Plan[]>("/patrol-plans");
  const pts = useSiteGet<Point[]>("/patrol-points");
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const name = (id: string) => pts.data?.find((p) => p.id === id)?.name ?? "?";
  return (
    <>
      <div className="row"><button className="btn btn--primary" type="button" disabled={!pts.data?.length} onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Tur ekle</button>{!pts.data?.length && <span className="small muted">Önce kontrol noktası ekleyin.</span>}</div>
      {editing && <PlanForm p={editing === "new" ? null : editing} points={(pts.data ?? []).filter((x) => x.is_active)} onDone={() => setEditing(null)} />}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : !q.data || q.data.length === 0 ? <Empty title="Tur planı yok" icon={<Route aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Tur planları</caption>
            <thead><tr><th scope="col">Tur</th><th scope="col">Noktalar</th><th scope="col">Saatler</th><th scope="col" className="right">Süre</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((p) => (
              <tr key={p.id} style={!p.is_active ? { opacity: 0.6 } : undefined}>
                <td className="cell-main">{p.name}<div className="cell-sub">{p.ordered ? "Sıralı" : "Serbest sıra"}{p.assignee && ` · ${p.assignee}`}</div></td>
                <td className="small">{p.point_ids.map(name).join(" → ")}</td>
                <td className="small mono">{p.start_times.join(", ")}</td>
                <td className="right num">{p.allowed_minutes} dk</td>
                <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${p.name} düzenle`} onClick={() => setEditing(p)}><Pencil aria-hidden="true" /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function PlanForm({ p, points, onDone }: { p: Plan | null; points: Point[]; onDone: () => void }) {
  const [f, setF] = useState({ name: p?.name ?? "", point_ids: p?.point_ids ?? points.map((x) => x.id), ordered: p?.ordered ?? true, times: p?.start_times.join(", ") ?? "22:00, 01:00, 04:00", allowed: String(p?.allowed_minutes ?? 30), assignee: p?.assignee ?? "Güvenlik", is_active: p?.is_active ?? true });
  const m = useSiteMutation<Record<string, unknown>, Plan>(p ? "PATCH" : "POST", p ? `/patrol-plans/${p.id}` : "/patrol-plans", { onSuccess: onDone });
  const move = (i: number, d: number) => setF((x) => { const a = [...x.point_ids]; const j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j]!, a[i]!]; return { ...x, point_ids: a }; });
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ name: f.name.trim(), point_ids: f.point_ids, ordered: f.ordered, start_times: f.times.split(/[,\s]+/).filter(Boolean), allowed_minutes: Number(f.allowed), assignee: f.assignee, is_active: f.is_active }); }
  const byId = new Map(points.map((x) => [x.id, x]));
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__head"><span className="card__title">{p ? `${p.name} — düzenle` : "Tur planı"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(x) => <input {...x} className="field__input" maxLength={40} placeholder="ör. Gece turu" value={f.name} onChange={(e) => setF((v) => ({ ...v, name: e.target.value }))} />}</Field>
          <Field label="Başlangıç saatleri" required hint="Virgülle: 22:00, 01:00" error={fieldError(m.error, "start_times")}>{(x) => <input {...x} className="field__input mono" value={f.times} onChange={(e) => setF((v) => ({ ...v, times: e.target.value }))} />}</Field>
          <Field label="İzin verilen süre (dk)" required error={fieldError(m.error, "allowed_minutes")}>{(x) => <input {...x} className="field__input" inputMode="numeric" value={f.allowed} onChange={(e) => setF((v) => ({ ...v, allowed: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}</Field>
          <Field label="Atanan rol / kişi">{(x) => <input {...x} className="field__input" maxLength={40} value={f.assignee} onChange={(e) => setF((v) => ({ ...v, assignee: e.target.value }))} />}</Field>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Noktalar ve sıra</legend>
          {fieldError(m.error, "point_ids") && <span className="field__error" role="alert">{fieldError(m.error, "point_ids")}</span>}
          <ol className="stack" style={{ gap: "var(--s-1)", paddingLeft: "1.2rem", margin: 0 }}>
            {f.point_ids.map((id, i) => <li key={id} className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}><span style={{ flex: 1 }}>{byId.get(id)?.name ?? "?"}</span><button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label="Yukarı" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp aria-hidden="true" /></button><button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label="Aşağı" disabled={i === f.point_ids.length - 1} onClick={() => move(i, 1)}><ArrowDown aria-hidden="true" /></button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setF((v) => ({ ...v, point_ids: v.point_ids.filter((x) => x !== id) }))}>Çıkar</button></li>)}
          </ol>
          {points.filter((x) => !f.point_ids.includes(x.id)).length > 0 && <div className="row" style={{ gap: "var(--s-1)", marginTop: "var(--s-2)" }}>{points.filter((x) => !f.point_ids.includes(x.id)).map((x) => <button key={x.id} type="button" className="btn btn--sm" onClick={() => setF((v) => ({ ...v, point_ids: [...v.point_ids, x.id] }))}><Plus aria-hidden="true" /> {x.name}</button>)}</div>}
        </fieldset>
        <div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>
          <label className="check"><input type="checkbox" checked={f.ordered} onChange={(e) => setF((v) => ({ ...v, ordered: e.target.checked }))} /><span>Sıralı (sıra dışı okutma sapma sayılır)</span></label>
          {p && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((v) => ({ ...v, is_active: e.target.checked }))} /><span>Etkin</span></label>}
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.name.trim() || f.point_ids.length === 0}>{p ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
