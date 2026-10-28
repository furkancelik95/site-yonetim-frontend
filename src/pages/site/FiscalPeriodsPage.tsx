import { useState } from "react";
import { Link } from "react-router";
import { CalendarDays, CheckCircle2, Circle, ClipboardCheck, Clock, Lock, LockOpen, Unlock } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Alert, Badge, ConfirmButton, ErrorState, Kpi, Loading, PageHead } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { fiscalAction, fiscalStatus, fiscalStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import type { Schemas } from "../../api/types";

type FiscalPeriod = Schemas["FiscalPeriodOut"];
type Checklist = Schemas["CloseChecklistOut"];

/**
 * Dönem kapanışı (FIN-13): kontrol listesi → kapanışta → kilitli (iki kişi). Kilitli dönem yalnız gerekçeyle
 * süreli açılır. Kilitli/kapanıştaki döneme backend hiçbir finansal kaydı yazmaz (409 `period_locked`).
 */
export function FiscalPeriodsPage() {
  const [s, set] = useUrlState({ yil: String(new Date().getFullYear()), donem: "" });
  const q = useSiteGet<FiscalPeriod[]>("/fiscal-periods", { year: s.yil });
  const selected = s.donem || q.data?.find((p) => p.is_past && p.status !== "locked")?.period || q.data?.[0]?.period || "";
  return (
    <div className="stack">
      <PageHead title="Dönem kapanışı" subtitle="Ay sonunda kontrol listesiyle dönemi kapatın ve kilitleyin; kilitli döneme kayıt eklenmez ve o döneme ait kayıt ters kaydedilemez; düzeltme gerekirse kilit gerekçeyle süreli açılır." />
      {q.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Kilitli" tone="ok" icon={<Lock aria-hidden="true" />} value={q.data.filter((p) => p.status === "locked").length} note={`${s.yil} yılında`} />
          <Kpi label="Kapanışta" tone="warn" icon={<Clock aria-hidden="true" />} value={q.data.filter((p) => p.status === "closing").length} note="ikinci yetkili kilitleyecek" />
          <Kpi label="Açık geçmiş dönem" tone={q.data.some((p) => p.is_past && p.status === "open") ? "danger" : undefined} icon={<LockOpen aria-hidden="true" />} value={q.data.filter((p) => p.is_past && p.status === "open").length} note="ay bitti, henüz kapanmadı" />
          <Kpi label="Süreli açık" icon={<Unlock aria-hidden="true" />} value={q.data.filter((p) => p.status === "temp_open").length} note="gerekçeyle açılan" />
        </div>
      ) : q.isPending ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : null}
      <div className="filters">
        <div className="field"><label className="field__label" htmlFor="fp-year">Yıl</label><select id="fp-year" className="field__input" value={s.yil} onChange={(e) => set({ yil: e.target.value, donem: "" })}>{[0, 1].map((d) => { const y = String(new Date().getFullYear() - d); return <option key={y} value={y}>{y}</option>; })}</select></div>
      </div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="grid grid--2" style={{ alignItems: "start" }}>
          <div className="card">
            <div className="card__head">
              <span className="card__icon card__icon--accent"><CalendarDays aria-hidden="true" /></span>
              <div>
                <div className="card__title">Dönemler</div>
                <div className="card__meta">{q.data.length} ay</div>
              </div>
              <div className="card__tools">
                <div className="field"><label className="field__label" htmlFor="fp-year">Yıl</label><select id="fp-year" className="field__input" value={s.yil} onChange={(e) => set({ yil: e.target.value, donem: "" })}>{[0, 1].map((d) => { const y = String(new Date().getFullYear() - d); return <option key={y} value={y}>{y}</option>; })}</select></div>
              </div>
            </div>
            <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Mali dönemler</caption>
              <thead><tr><th scope="col">Dönem</th><th scope="col">Durum</th><th scope="col">Kilitleyen</th></tr></thead>
              <tbody>{q.data.map((p) => (
                <tr key={p.period} aria-selected={p.period === selected} style={p.period === selected ? { background: "var(--accent-soft)" } : undefined}>
                  <td><button type="button" className="btn btn--ghost btn--sm" onClick={() => set({ donem: p.period })} aria-current={p.period === selected || undefined}>{p.label}</button></td>
                  <td><Badge tone={fiscalStatusTone(p.status)}>{fiscalStatus(p.status)}</Badge>{!p.is_past && <span className="cell-sub"> içinde bulunulan</span>}</td>
                  <td className="small">{p.locked_by ? <>{p.locked_by}<div className="cell-sub">{formatDateTime(p.locked_at)}</div></> : "—"}</td>
                </tr>
              ))}</tbody>
            </table></div></div>
          </div>
          {selected && <PeriodDetail key={selected} period={selected} />}
        </div>
      )}
    </div>
  );
}

function PeriodDetail({ period }: { period: string }) {
  const { can } = useSite();
  const manage = can(P.chargePost);
  const q = useSiteGet<Checklist>(`/fiscal-periods/${period}/close-checklist`);
  const [ex, setEx] = useState<Record<string, string>>({});
  const start = useSiteMutation<{ exceptions: Record<string, string> }, FiscalPeriod>("POST", `/fiscal-periods/${period}/start-close`);
  const lock = useSiteMutation<Record<string, never>, FiscalPeriod>("POST", `/fiscal-periods/${period}/lock`);
  const reopen = useSiteMutation<Record<string, never>, FiscalPeriod>("POST", `/fiscal-periods/${period}/reopen`);
  const unlock = useSiteMutation<{ reason: string; hours: number }, FiscalPeriod>("POST", `/fiscal-periods/${period}/unlock-requests`);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("24");
  if (q.isPending) return <div className="card"><div className="card__body"><Loading label="Kontrol listesi hesaplanıyor…" /></div></div>;
  if (q.isError) return <ErrorState error={q.error} />;
  const { period: p, items } = q.data;
  const blocking = items.filter((i) => i.required && !i.ok && (ex[i.key] ?? "").trim().length < 10);
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--ok"><ClipboardCheck aria-hidden="true" /></span><div><div className="card__title">{p.label}</div><div className="card__meta">{items.filter((i) => i.ok).length}/{items.length} madde tamam</div></div><span className="ml-auto"><Badge tone={fiscalStatusTone(p.status)}>{fiscalStatus(p.status)}</Badge></span></div>
      <div className="card__body card__body--flush">
        <ul className="checklist">
          {items.map((i) => (
            <li key={i.key} className={`checklist__item${i.ok ? " checklist__item--ok" : ""}`} style={{ flexWrap: "wrap" }}>
              {i.ok ? <CheckCircle2 aria-hidden="true" className="checklist__icon checklist__icon--ok" /> : <Circle aria-hidden="true" className="checklist__icon" />}
              <div className="checklist__main">
                <div><span className="strong">{i.label}</span>{!i.required && <span className="small muted"> · uyarı</span>}<span className="visually-hidden">{i.ok ? " — tamam" : " — eksik"}</span></div>
                <div className="small muted">{i.detail}</div>
                {i.exception && <div className="small">Gerekçeli istisna: {i.exception}</div>}
                {!i.ok && i.required && p.status === "open" && p.is_past && manage && (
                  <div className="field" style={{ marginTop: "var(--s-2)" }}>
                    <label className="field__label" htmlFor={`ex-${i.key}`}>Gerekçeli istisna (eksik kalacaksa)</label>
                    <input id={`ex-${i.key}`} className="field__input" maxLength={300} placeholder="En az 10 karakter; kapanış raporunda listelenir" value={ex[i.key] ?? ""} onChange={(e) => setEx((x) => ({ ...x, [i.key]: e.target.value }))} />
                  </div>
                )}
              </div>
              {i.link && !i.ok && <Link className="btn btn--sm" to={`../${i.link}`} relative="path">Git</Link>}
            </li>
          ))}
        </ul>
      </div>
      <div className="card__foot stack" style={{ gap: "var(--s-3)" }}>
        {!p.is_past && <Alert tone="info">İçinde bulunulan dönem ay bitmeden kapatılamaz.</Alert>}
        {p.unlock_request_id && <Alert tone="info" title="Süreli açma onay bekliyor">Talep Onaylar ekranında; onaylanınca dönem seçilen süre kadar açılır.</Alert>}
        {p.status === "temp_open" && <Alert tone="danger" title="Dönem süreli açık">{formatDateTime(p.unlock_until)} tarihine kadar kayıt eklenebilir; bu süredeki işlemler denetim kaydında "kilit açıkken" etiketli.</Alert>}
        {manage && (
          <div className="row" style={{ gap: "var(--s-2)" }}>
            {p.status === "open" && p.is_past && (
              <ConfirmButton className="btn btn--primary" disabled={blocking.length > 0} title={`${p.label} — kapanışı başlat`} confirmLabel="Kapanışa al" body="Dönem 'kapanışta' olur; yeni işlemler sonraki döneme yönlendirilir. Kilitlemeyi ikinci bir yetkili yapar." onConfirm={() => start.mutateAsync({ exceptions: ex })}>Kapanışı başlat</ConfirmButton>
            )}
            {(p.status === "closing" || p.status === "temp_open") && (
              <ConfirmButton className="btn btn--primary" title={`${p.label} — kilitle`} confirmLabel="Kilitle" body="Kilitli döneme hiçbir finansal kayıt eklenemez ve değiştirilemez. Kapanışı başlatan kişi kilitleyemez (iki kişi kuralı)." onConfirm={() => lock.mutateAsync({})}><Lock aria-hidden="true" /> Kilitle</ConfirmButton>
            )}
            {p.status === "closing" && <button className="btn btn--ghost" type="button" disabled={reopen.isPending} onClick={() => reopen.mutate({})}>Açığa al</button>}
            {p.status === "locked" && !p.unlock_request_id && (
              <ConfirmButton className="btn btn--ghost" danger title={`${p.label} — süreli aç`} confirmLabel="Süreli aç"
                body={<div className="stack" style={{ gap: "var(--s-3)" }}>
                  <p className="mb-0 small">İstisnai durum. "Dönem kilidi açma" onay kuralı varsa (hazır şablon: YK çoğunluğu) talep onaya gider; onaylanınca dönem süreli açılır.</p>
                  <div className="field"><label className="field__label" htmlFor="ul-reason">Gerekçe * (en az 20 karakter)</label><textarea id="ul-reason" className="field__input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                  <div className="field"><label className="field__label" htmlFor="ul-hours">Süre</label><select id="ul-hours" className="field__input" value={hours} onChange={(e) => setHours(e.target.value)}><option value="4">4 saat</option><option value="24">24 saat</option><option value="72">72 saat</option></select></div>
                </div>}
                onConfirm={() => unlock.mutateAsync({ reason, hours: Number(hours) })}>
                Kilidi süreli aç
              </ConfirmButton>
            )}
          </div>
        )}
        {blocking.length > 0 && p.status === "open" && p.is_past && <span className="small muted">Kapanış için {blocking.length} zorunlu madde eksik; giderin ya da gerekçeli istisna yazın.</span>}
        {p.history.length > 0 && (
          <details>
            <summary className="small">Geçmiş ({p.history.length})</summary>
            <ol className="timeline" style={{ marginTop: "var(--s-2)" }}>{[...p.history].reverse().map((h, i) => <li key={i}><div className="timeline__title">{fiscalAction(h.action)}</div><div className="timeline__meta">{formatDateTime(h.at)} · {h.by}</div>{h.note && <div className="small">{h.note}</div>}</li>)}</ol>
          </details>
        )}
      </div>
    </div>
  );
}
