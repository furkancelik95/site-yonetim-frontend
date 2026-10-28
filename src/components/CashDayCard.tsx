import { useState, type FormEvent } from "react";
import { ClipboardCheck } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../api/hooks";
import { Badge, Field, FormError, Loading, Money, SubmitButton, fieldError } from "./ui";
import { formatDate, formatDateTime, parseMoneyInput } from "../lib/format";
import type { Schemas } from "../api/types";

type CashDay = Schemas["CashDayOut"];
type Days = Schemas["CashDaysOut"];

/**
 * Kasa gün sonu (FIN-11): hareketli her kasa günü fiziki sayımla kapatılır; fark varsa gerekçe zorunlu. Kapanan gün
 * değişmez, hata ertesi gün düzeltme fişiyle giderilir. "Kasa farkı" onay kuralı varsa farklı sayım onaya gider.
 * Açık kasa günü dönem kapanışını engeller.
 */
export function CashDayCard({ accountId, canManage }: { accountId: string; canManage: boolean }) {
  const q = useSiteGet<Days>(`/cash-accounts/${accountId}/days`);
  const [date, setDate] = useState("");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const m = useSiteMutation<{ date: string; counted: string | null; reason: string }, CashDay>("POST", `/cash-accounts/${accountId}/days/close`, { onSuccess: () => { setCounted(""); setReason(""); setDate(""); } });
  if (q.isPending) return <div className="card"><div className="card__body"><Loading /></div></div>;
  if (!q.data || q.data.kind !== "cash") return null;
  const d = q.data;
  const target = date || d.open_days[0] || "";
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ date: target, counted: parseMoneyInput(counted), reason: reason.trim() }); }
  const needReason = m.error && fieldError(m.error, "reason");
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><ClipboardCheck aria-hidden="true" /></span><span className="card__title">Gün sonu sayımı</span><span className="card__meta ml-auto">{d.open_days.length ? `${d.open_days.length} gün kapanmadı` : "Tüm hareketli günler kapalı"}</span></div>
      {canManage && d.open_days.length > 0 && (
        <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={submit}>
          <FormError error={m.error} />
          <div className="grid grid--kpi">
            <Field label="Gün" required error={fieldError(m.error, "date")}>{(p) => <select {...p} className="field__input" value={target} onChange={(e) => setDate(e.target.value)}>{d.open_days.map((x) => <option key={x} value={x}>{formatDate(x)}</option>)}</select>}</Field>
            <Field label="Sayılan nakit (₺)" required hint="Gün sonunda kasadaki fiziki para" error={fieldError(m.error, "counted")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />}</Field>
          </div>
          {(needReason || reason) && <Field label="Fark gerekçesi" required error={fieldError(m.error, "reason")}>{(p) => <textarea {...p} className="field__input" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
          <div className="row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!counted}>Günü kapat</SubmitButton><span className="small muted">Sistem bakiyesi o günün sonundaki bakiyedir; sayım farklıysa gerekçe istenir.</span></div>
        </form>
      )}
      <div className="card__body card__body--flush">
        {d.closed.length === 0 ? <p className="small muted" style={{ padding: "var(--s-4)", margin: 0 }}>Henüz kapatılmış gün yok.</p> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Kapatılan kasa günleri</caption>
            <thead><tr><th scope="col">Gün</th><th scope="col" className="right">Sistem</th><th scope="col" className="right">Sayım</th><th scope="col" className="right">Fark</th><th scope="col">Kapatan</th></tr></thead>
            <tbody>{d.closed.slice(0, 15).map((c) => (
              <tr key={c.id}>
                <td className="small nowrap">{formatDate(c.date)}{c.status !== "closed" && <> <Badge tone={c.status === "approval_pending" ? "warn" : "muted"}>{c.status === "approval_pending" ? "Fark onay bekliyor" : "Reddedildi"}</Badge></>}</td>
                <td className="right"><Money value={c.system_balance} /></td>
                <td className="right"><Money value={c.counted} /></td>
                <td className="right">{Number(c.difference) === 0 ? <Badge tone="ok">Yok</Badge> : <><Money value={c.difference} /><div className="cell-sub">{c.reason}</div></>}</td>
                <td className="small">{c.closed_by}{c.closed_at && <div className="cell-sub">{formatDateTime(c.closed_at)}</div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
