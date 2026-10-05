import { useState, type FormEvent } from "react";
import { FileSignature, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { MockBadge } from "../../components/MockBadge";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatMoney, parseMoneyInput } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { contractCategory, contractPeriod } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 16'daki şekil. `days_left` ve `state` sunucuda hesaplanır. */
interface Contract {
  id: string; vendor: string; subject: string; category: string; start_date: string; end_date: string; amount: string | null;
  period: "monthly" | "yearly" | "once"; notice_days: number; auto_renew: boolean; note: string | null; is_archived: boolean;
  days_left: number; state: "active" | "expiring" | "expired" | "archived";
}

const CATEGORIES = ["elevator", "cleaning", "security", "garden", "maintenance", "insurance", "pool", "other"];

function StateBadge({ c }: { c: Contract }) {
  if (c.state === "expired") return <Badge tone="danger">Süresi doldu · {-c.days_left} gün önce</Badge>;
  if (c.state === "expiring") return <Badge tone="warn">{c.days_left === 0 ? "Bugün bitiyor" : `${c.days_left} gün kaldı`}</Badge>;
  if (c.state === "archived") return <Badge>Arşivde</Badge>;
  return <Badge tone="ok">Yürürlükte</Badge>;
}

/** Hizmet sözleşmeleri (Apsiyon "Cari ve kira sözleşmeleri"): firma, süre, bedel, bitiş uyarısı. */
export function ContractsPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ arsiv: "" });
  const q = useSiteGet<Contract[]>("/contracts", { archived: s.arsiv ? "true" : undefined });
  const [editing, setEditing] = useState<Contract | "new" | null>(null);
  const manage = can(P.expensesManage);
  const warn = (q.data ?? []).filter((c) => c.state === "expiring" || c.state === "expired");
  return (
    <div className="stack">
      <PageHead
        title="Sözleşmeler"
        subtitle="Asansör, temizlik, güvenlik, sigorta gibi hizmet sözleşmeleri ve bitiş tarihleri."
        actions={<><MockBadge request="16" />{manage && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Sözleşme ekle</button>}</>}
      />
      {editing && <ContractForm c={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      {!s.arsiv && warn.length > 0 && (
        <Alert tone="warn" title={`${warn.length} sözleşme için işlem gerekiyor`}>
          {warn.map((c) => `${c.vendor} (${c.state === "expired" ? "süresi doldu" : `${c.days_left} gün`})`).join(", ")}. Yenileme ya da yeni teklif için firmayla görüşün.
        </Alert>
      )}
      <div className="row" role="tablist" aria-label="Sözleşme listesi" style={{ gap: "var(--s-2)" }}>
        {[["", "Geçerli"], ["1", "Arşiv"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={s.arsiv === k} className={`btn btn--sm${s.arsiv === k ? " btn--primary" : ""}`} onClick={() => set({ arsiv: k! })}>{l}</button>
        ))}
      </div>
      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? (
            <Empty title={s.arsiv ? "Arşivde sözleşme yok" : "Henüz sözleşme yok"} icon={<FileSignature aria-hidden="true" />}>Bitişine yaklaşan sözleşmeler burada ve bu sayfanın üstünde uyarı olarak görünür.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Sözleşmeler, bitiş tarihine göre</caption>
                <thead><tr><th scope="col">Firma / konu</th><th scope="col">Süre</th><th scope="col" className="right">Bedel</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>
                  {q.data.map((c) => (
                    <tr key={c.id}>
                      <td><div className="cell-main">{c.vendor}</div><div className="cell-sub">{contractCategory(c.category)} · {c.subject}</div></td>
                      <td className="small nowrap">{formatDate(c.start_date)} – {formatDate(c.end_date)}{c.auto_renew && <div className="cell-sub">Kendiliğinden yenilenir</div>}</td>
                      <td className="right nowrap">{c.amount ? <>{formatMoney(c.amount)}<div className="cell-sub">{contractPeriod(c.period)}</div></> : "—"}</td>
                      <td><StateBadge c={c} /></td>
                      <td className="right nowrap">{manage && <ContractActions c={c} onEdit={() => setEditing(c)} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractActions({ c, onEdit }: { c: Contract; onEdit: () => void }) {
  const archive = useSiteMutation<{ is_archived: boolean }, Contract>("PATCH", `/contracts/${c.id}`);
  if (c.is_archived) return <button className="btn btn--ghost btn--sm" type="button" disabled={archive.isPending} onClick={() => archive.mutate({ is_archived: false })}>Geri al</button>;
  return (
    <span className="row" style={{ gap: "var(--s-1)", justifyContent: "flex-end" }}>
      <button className="btn btn--ghost btn--sm" type="button" onClick={onEdit}>Düzenle</button>
      <ConfirmButton className="btn btn--ghost btn--sm" title={`${c.vendor} sözleşmesini arşive kaldır`} confirmLabel="Arşive kaldır" body="Sözleşme listeden ve uyarılardan çıkar; Arşiv sekmesinde kalır." onConfirm={() => archive.mutateAsync({ is_archived: true })}>Arşivle</ConfirmButton>
    </span>
  );
}

function ContractForm({ c, onDone }: { c: Contract | null; onDone: () => void }) {
  const [f, setF] = useState({
    vendor: c?.vendor ?? "", subject: c?.subject ?? "", category: c?.category ?? "elevator", start_date: c?.start_date ?? "", end_date: c?.end_date ?? "",
    amount: c?.amount ? formatMoney(c.amount, false) : "", period: c?.period ?? "monthly", notice_days: String(c?.notice_days ?? 30), auto_renew: c?.auto_renew ?? false, note: c?.note ?? "",
  });
  const [amountErr, setAmountErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Contract>(c ? "PATCH" : "POST", c ? `/contracts/${c.id}` : "/contracts", { onSuccess: onDone });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = f.amount.trim() ? parseMoneyInput(f.amount) : null;
    if (f.amount.trim() && !amount) { setAmountErr("Tutarı 12.500,00 biçiminde girin."); return; }
    setAmountErr(undefined);
    m.mutate({ ...f, amount, notice_days: Number(f.notice_days || 0) });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{c ? `${c.vendor} — düzenle` : "Sözleşme ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Firma" required error={fieldError(m.error, "vendor")}>{(p) => <input {...p} className="field__input" value={f.vendor} onChange={set("vendor")} />}</Field>
          <Field label="Tür" required error={fieldError(m.error, "category")}>{(p) => <select {...p} className="field__input" value={f.category} onChange={set("category")}>{CATEGORIES.map((k) => <option key={k} value={k}>{contractCategory(k)}</option>)}</select>}</Field>
        </div>
        <Field label="Konu" required error={fieldError(m.error, "subject")}>{(p) => <input {...p} className="field__input" placeholder="ör. 4 asansörün aylık periyodik bakımı" value={f.subject} onChange={set("subject")} />}</Field>
        <div className="grid grid--kpi">
          <Field label="Başlangıç" required error={fieldError(m.error, "start_date")}>{(p) => <input {...p} className="field__input" type="date" value={f.start_date} onChange={set("start_date")} />}</Field>
          <Field label="Bitiş" required error={fieldError(m.error, "end_date")}>{(p) => <input {...p} className="field__input" type="date" min={f.start_date || undefined} value={f.end_date} onChange={set("end_date")} />}</Field>
          <Field label="Bedel (₺)" error={amountErr ?? fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" placeholder="12.500,00" value={f.amount} onChange={set("amount")} />}</Field>
          <Field label="Ödeme dönemi" error={fieldError(m.error, "period")}>{(p) => <select {...p} className="field__input" value={f.period} onChange={set("period")}>{["monthly", "yearly", "once"].map((k) => <option key={k} value={k}>{contractPeriod(k)}</option>)}</select>}</Field>
          <Field label="Kaç gün önce uyar" error={fieldError(m.error, "notice_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.notice_days} onChange={(e) => setF((x) => ({ ...x, notice_days: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}</Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.auto_renew} onChange={(e) => setF((x) => ({ ...x, auto_renew: e.target.checked }))} />
          <span>Fesih bildirilmezse kendiliğinden yenilenir</span>
        </label>
        <Field label="Not">{(p) => <textarea {...p} className="field__input" rows={2} maxLength={1000} value={f.note} onChange={set("note")} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>{c ? "Kaydet" : "Ekle"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
