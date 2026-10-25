import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CalendarOff, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { leaveStatus, leaveStatusTone, leaveType } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Leave = Schemas["LeaveRequestOut"];
type Balance = Schemas["LeaveBalanceOut"];
const TYPES = ["annual", "excuse", "sick", "unpaid"];

/**
 * İzinler (IK-03): personel kendi talebini "Vardiyam" ekranından açar (K29); İK sorumlusu personel adına da kaydeder.
 * Sitede "İzin talebi" onay kuralı varsa karar onay mekanizmasından geçer (buradaki düğme de oraya yazar), yoksa
 * İK karar verir. Onaylı izin vardiya planında ve puantajda görünür. Raporlu izinde tanı bilgisi tutulmaz.
 */
export function LeavePage() {
  const { can, site } = useSite();
  const manage = can(P.staffManage);
  const [s, set] = useUrlState({ durum: "pending", page: "1" });
  const q = useSiteGet<Page<Leave>>("/leave-requests", { status: s.durum || undefined, page: s.page, page_size: 50 });
  const bal = useSiteGet<Balance[]>("/leave-balances");
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      <PageHead title="İzinler" subtitle="Personel izinlerini kaydedin ve onaylayın; onaylı izin vardiya planına ve puantaja yansır." actions={manage && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> İzin kaydet</button>} />
      {adding && <LeaveForm onDone={() => setAdding(false)} />}
      <div className="row" role="tablist" aria-label="İzin durumu" style={{ gap: "var(--s-2)" }}>
        {[["pending", "Onay bekleyen"], ["approved", "Onaylanan"], ["rejected", "Reddedilen"], ["", "Tümü"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.durum === k} className={`btn btn--sm${s.durum === k ? " btn--primary" : ""}`} onClick={() => set({ durum: k!, page: "1" })}>{l}</button>)}
      </div>
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Kayıt yok" icon={<CalendarOff aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">İzin talepleri</caption>
            <thead><tr><th scope="col">Personel</th><th scope="col">İzin</th><th scope="col">Tarih</th><th scope="col">Durum</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.items.map((l) => (
              <tr key={l.id}>
                <td className="cell-main">{l.staff_name}<div className="cell-sub">{l.source === "staff" ? "Kendi talebi" : l.created_by}, {formatDateTime(l.created_at)}</div></td>
                <td className="small">{leaveType(l.type)}{l.note && <div className="cell-sub">{l.note}</div>}</td>
                <td className="small nowrap">{formatDate(l.from)} – {formatDate(l.to)}<div className="cell-sub">{l.days} gün{l.clashing_shifts > 0 && ` · ${l.clashing_shifts} vardiya`}</div></td>
                <td>
                  <Badge tone={leaveStatusTone(l.status)}>{leaveStatus(l.status)}</Badge>
                  {l.approval_request_id && <div className="cell-sub"><Link to={`/s/${site.slug}/onaylar/${l.approval_request_id}`}>Onay #{l.approval_number}</Link></div>}
                  {l.decided_by && <div className="cell-sub">{l.decided_by}</div>}
                  {l.reject_reason && <div className="cell-sub">{l.reject_reason}</div>}
                </td>
                {manage && <td className="right nowrap"><LeaveActions l={l} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
      {bal.data && bal.data.length > 0 && (
        <details className="card">
          <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Bu yıl kullanılan izinler</span><span className="card__meta ml-auto">bilgi amaçlı; bordro hesabı platformda yapılmaz</span></summary>
          <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Personel bazında kullanılan izin günleri</caption>
            <thead><tr><th scope="col">Personel</th>{TYPES.map((t) => <th key={t} scope="col" className="right">{leaveType(t)}</th>)}</tr></thead>
            <tbody>{bal.data.map((b) => <tr key={b.staff_id}><td className="cell-main">{b.staff_name}</td>{TYPES.map((t) => <td key={t} className="right num">{b.used[t] || "—"}</td>)}</tr>)}</tbody>
          </table></div></div>
        </details>
      )}
    </div>
  );
}

function LeaveActions({ l }: { l: Leave }) {
  const [reason, setReason] = useState("");
  const approve = useSiteMutation<Record<string, never>, Leave>("POST", `/leave-requests/${l.id}/approve`);
  const reject = useSiteMutation<{ reason: string }, Leave>("POST", `/leave-requests/${l.id}/reject`);
  const cancel = useSiteMutation<Record<string, never>, Leave>("POST", `/leave-requests/${l.id}/cancel`);
  if (l.status === "pending") return (
    <>
      <ConfirmButton className="btn btn--sm btn--primary" title="İzni onayla" confirmLabel="Onayla" body={l.clashing_shifts > 0 ? `Bu tarihlerde ${l.clashing_shifts} vardiyası var; onaydan sonra vardiya planında "atanmalı" olarak görünür.` : "İzin vardiya planına ve puantaja yansır."} onConfirm={() => approve.mutateAsync({})}>Onayla</ConfirmButton>{" "}
      <ConfirmButton className="btn btn--ghost btn--sm" danger title="İzni reddet" confirmLabel="Reddet" body={<div className="field"><label className="field__label" htmlFor={`lr-${l.id}`}>Gerekçe *</label><input id={`lr-${l.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} onConfirm={() => reject.mutateAsync({ reason })}>Reddet</ConfirmButton>{" "}
      <ConfirmButton className="btn btn--ghost btn--sm" title="Talebi iptal et" confirmLabel="İptal et" body={l.approval_request_id ? "Onay talebi de geri çekilir (yalnız talebi açan geri çekebilir)." : "Talep iptal edilir."} onConfirm={() => cancel.mutateAsync({})}>İptal</ConfirmButton>
    </>
  );
  if (l.status === "approved") return <ConfirmButton className="btn btn--ghost btn--sm" title="Onaylı izni iptal et" confirmLabel="İptal et" body="İzin kalkar; vardiya planı ve puantaj buna göre güncellenir. Puantajı kesinleşmiş günü olan izin iptal edilemez." onConfirm={() => cancel.mutateAsync({})}>İptal</ConfirmButton>;
  return null;
}

function LeaveForm({ onDone }: { onDone: () => void }) {
  const staff = useSiteGet<Schemas["StaffOut"][]>("/staff", { active: "true" });
  const [f, setF] = useState({ staff_id: "", type: "annual", from: todayIso(), to: todayIso(), note: "" });
  const m = useSiteMutation<Record<string, unknown>, Leave>("POST", "/leave-requests", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sick = f.type === "sick";
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ ...f, note: sick ? null : f.note.trim() || null }); }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">İzin kaydet</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Personel" required error={fieldError(m.error, "staff_id")}>{(p) => <select {...p} className="field__input" value={f.staff_id} onChange={up("staff_id")}><option value="">Seçin</option>{staff.data?.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}</Field>
          <Field label="İzin türü" required error={fieldError(m.error, "type")}>{(p) => <select {...p} className="field__input" value={f.type} onChange={up("type")}>{TYPES.map((t) => <option key={t} value={t}>{leaveType(t)}</option>)}</select>}</Field>
          <Field label="Başlangıç" required error={fieldError(m.error, "from")}>{(p) => <input {...p} className="field__input" type="date" value={f.from} onChange={up("from")} />}</Field>
          <Field label="Bitiş" required error={fieldError(m.error, "to")}>{(p) => <input {...p} className="field__input" type="date" min={f.from} value={f.to} onChange={up("to")} />}</Field>
        </div>
        {sick ? <Alert tone="info">Raporlu izinde açıklama ve tanı bilgisi tutulmaz (KVKK özel nitelikli veri); yalnız rapor belgesi, belge modülüyle (gizli kategori) bağlanacak.</Alert>
          : <Field label="Açıklama" error={fieldError(m.error, "note")}>{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={up("note")} />}</Field>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.staff_id}>Kaydet</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
