import { useState, type FormEvent } from "react";
import { Plus, Receipt } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { accountKind, adHocMode, adHocSource, adHocStatus } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 31'deki şekiller. */
type Source = "reservation" | "service" | "renovation" | "penalty" | "other";
interface Settings { sources: Record<Source, { mode: "immediate" | "next_period"; due_days: number }> }
interface AdHoc { id: string; unit_name: string; account_kind: string; reference_code: string; person_name: string | null; source: Source; description: string; amount: string; due_date: string; mode: string; status: "posted" | "waiting_next_run" | "cancelled"; created_by: string; created_at: string; cancel_reason: string | null }
const SOURCES: Source[] = ["reservation", "service", "renovation", "penalty", "other"];

/**
 * Dönem dışı ücretler (FIN-06): rezervasyon, ücretli hizmet, tadilat, ceza gibi aidat dışı ücretler. Kaynak bazında
 * "anında tahakkuk" ya da "sonraki aidata ekle". Aidat tahakkuku (işletme projesi, K23) bu ekrandan etkilenmez.
 */
export function AdHocChargesPage() {
  const { can } = useSite();
  const manage = can(P.chargePost);
  const [s, set] = useUrlState({ durum: "" });
  const q = useSiteGet<AdHoc[]>("/ad-hoc-charges", { status: s.durum || undefined });
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      <PageHead title="Dönem dışı ücretler" subtitle="Aidat dışındaki tek seferlik ücretler: rezervasyon, ücretli hizmet, tadilat, ceza. Kaynak bazında hemen ya da sonraki aidatla yansır." actions={manage && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Ücret ekle</button>} />
      <Alert tone="info">Sahte servis: ücret listede görünür ama cari hesaba yazılmaz; servis gelince "anında" ücretler cariye kendi vadesiyle, "sonraki aidat" ücretleri tahakkukta "ek kalemler" başlığıyla yazılacak.</Alert>
      {adding && <AdHocForm onDone={() => setAdding(false)} />}
      {manage && <SettingsCard />}
      <div className="filters"><div className="field"><label className="field__label" htmlFor="ah-st">Durum</label><select id="ah-st" className="field__input" value={s.durum} onChange={(e) => set({ durum: e.target.value })}><option value="">Tümü</option>{["posted", "waiting_next_run", "cancelled"].map((k) => <option key={k} value={k}>{adHocStatus(k)}</option>)}</select></div></div>
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Dönem dışı ücret yok" icon={<Receipt aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Dönem dışı ücretler</caption>
            <thead><tr><th scope="col">Bölüm / hesap</th><th scope="col">Ücret</th><th scope="col" className="right">Tutar</th><th scope="col">Vade</th><th scope="col">Durum</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((c) => (
              <tr key={c.id} style={c.status === "cancelled" ? { opacity: 0.6 } : undefined}>
                <td><div className="cell-main">{c.unit_name}</div><div className="cell-sub">{accountKind(c.account_kind)} · {c.person_name ?? "—"}</div></td>
                <td><div>{c.description}</div><div className="cell-sub">{adHocSource(c.source)} · {c.created_by}, {formatDateTime(c.created_at)}</div>{c.cancel_reason && <div className="cell-sub">İptal: {c.cancel_reason}</div>}</td>
                <td className="right"><Money value={c.amount} /></td>
                <td className="small nowrap">{formatDate(c.due_date)}</td>
                <td><Badge tone={c.status === "posted" ? "ok" : c.status === "waiting_next_run" ? "info" : "muted"}>{adHocStatus(c.status)}</Badge></td>
                {manage && <td className="right">{c.status !== "cancelled" && <CancelButton c={c} />}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}

function CancelButton({ c }: { c: AdHoc }) {
  const [reason, setReason] = useState("");
  const m = useSiteMutation<{ reason: string }, AdHoc>("POST", `/ad-hoc-charges/${c.id}/cancel`);
  return (
    <ConfirmButton className="btn btn--ghost btn--sm" danger title="Ücreti iptal et" confirmLabel="İptal et"
      body={<div className="field"><label className="field__label" htmlFor={`ac-${c.id}`}>Gerekçe *</label><input id={`ac-${c.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Rezervasyon iptal edildi" /><span className="field__hint">{c.status === "posted" ? "Cariye yazılmış ücret ters kayıtla kapanır; silinmez." : "Bekleyen ücret tahakkuka eklenmez."}</span></div>}
      onConfirm={() => m.mutateAsync({ reason })}>
      İptal
    </ConfirmButton>
  );
}

function AdHocForm({ onDone }: { onDone: () => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ account_kind: "occupant", source: "service" as Source, description: "", amount: "", due_date: "" });
  const m = useSiteMutation<Record<string, unknown>, AdHoc>("POST", "/ad-hoc-charges", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ ...f, unit_id: unit?.id, amount: parseMoneyInput(f.amount), due_date: f.due_date || null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Dönem dışı ücret</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <UnitPicker label="Bölüm" value={unit} onChange={setUnit} error={fieldError(m.error, "unit_id")} />
          <Field label="Kime yazılsın" required error={fieldError(m.error, "account_kind")}>{(p) => <select {...p} className="field__input" value={f.account_kind} onChange={(e) => setF((x) => ({ ...x, account_kind: e.target.value }))}><option value="occupant">Oturan (kiracı varsa kiracı)</option><option value="owner">Malik</option></select>}</Field>
          <Field label="Kaynak" required error={fieldError(m.error, "source")}>{(p) => <select {...p} className="field__input" value={f.source} onChange={(e) => setF((x) => ({ ...x, source: e.target.value as Source }))}>{SOURCES.map((k) => <option key={k} value={k}>{adHocSource(k)}</option>)}</select>}</Field>
          <Field label="Tutar (₺)" required error={fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} />}</Field>
          <Field label="Vade" hint="Boş: kaynak ayarındaki gün" error={fieldError(m.error, "due_date")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.due_date} onChange={(e) => setF((x) => ({ ...x, due_date: e.target.value }))} />}</Field>
        </div>
        <Field label="Açıklama" required error={fieldError(m.error, "description")}>{(p) => <input {...p} className="field__input" maxLength={200} placeholder="ör. Toplantı salonu kullanımı 18.10" value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
        <p className="small muted mb-0">Elle ücretin onay mekanizmasına bağlanması ortak kararı bekliyor (K21); şimdilik doğrudan yetkiyle oluşur.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!unit || !f.amount || !f.description.trim()}>Oluştur</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function SettingsCard() {
  const q = useSiteGet<Settings>("/settings/ad-hoc-charges");
  const m = useSiteMutation<Settings, Settings>("PUT", "/settings/ad-hoc-charges");
  if (!q.data) return null;
  const s = q.data;
  const upd = (k: Source, patch: Partial<Settings["sources"][Source]>) => m.mutate({ sources: { ...s.sources, [k]: { ...s.sources[k], ...patch } } });
  return (
    <details className="card">
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Kaynak bazında yansıma</span><span className="card__meta ml-auto">anında ya da sonraki aidatla</span></summary>
      <div className="card__body card__body--flush">
        <FormError error={m.error} />
        <div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Dönem dışı ücret ayarları</caption>
          <thead><tr><th scope="col">Kaynak</th><th scope="col">Yansıma</th><th scope="col">Anında tahakkukta vade</th></tr></thead>
          <tbody>{SOURCES.map((k) => (
            <tr key={k}>
              <td className="cell-main">{adHocSource(k)}</td>
              <td><select className="field__input" aria-label={`${adHocSource(k)} yansıma`} disabled={m.isPending} value={s.sources[k].mode} onChange={(e) => upd(k, { mode: e.target.value as "immediate" })}><option value="immediate">{adHocMode("immediate")}</option><option value="next_period">{adHocMode("next_period")}</option></select></td>
              <td><div className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}><input className="field__input" style={{ width: "5rem" }} inputMode="numeric" aria-label={`${adHocSource(k)} vade günü`} defaultValue={s.sources[k].due_days} onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n !== s.sources[k].due_days) upd(k, { due_days: n }); }} /><span className="small muted nowrap">gün sonra</span></div></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </details>
  );
}
