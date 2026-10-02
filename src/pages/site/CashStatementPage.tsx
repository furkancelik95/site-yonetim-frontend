import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CashStatement, Schemas } from "../../api/types";
import { ExcelButton } from "../../components/ExcelButton";
import { Badge, ConfirmButton, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatMoney, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { cashAccountKind, cashSource } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Movement = Schemas["MovementOut"];

export function CashStatementPage() {
  const { accountId = "" } = useParams();
  const { site, can } = useSite();
  const [s, set] = useUrlState({ from: "", to: "", page: "1" });
  const range = { from: s.from, to: s.to };
  const q = useSiteGet<CashStatement>(`/cash-accounts/${accountId}/statement`, { ...range, page: s.page, page_size: 100 });
  const [adding, setAdding] = useState(false);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const a = d.account;

  return (
    <div className="stack">
      <PageHead
        title={a.name}
        subtitle={`${cashAccountKind(a.kind)}${a.iban ? ` · ${a.iban}` : ""}`}
        actions={
          <>
            <Link className="btn" to={`/s/${site.slug}/kasa`}>Hesaplar</Link>
            <ExcelButton path={`/sites/${site.slug}/cash-accounts/${a.id}/statement/export.xlsx`} query={range} fileName={`${a.name}-ekstre.xlsx`} />
            {can(P.cashManage) && a.is_active && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Elle hareket</button>}
          </>
        }
      />

      {adding && <MovementForm accountId={a.id} onDone={() => setAdding(false)} />}

      <div className="filters">
        <div className="field"><label className="field__label" htmlFor="cs-from">Başlangıç</label><input id="cs-from" className="field__input" type="date" value={s.from} onChange={(e) => set({ from: e.target.value })} /></div>
        <div className="field"><label className="field__label" htmlFor="cs-to">Bitiş</label><input id="cs-to" className="field__input" type="date" value={s.to} onChange={(e) => set({ to: e.target.value })} /></div>
      </div>

      <div className="grid grid--kpi">
        <Kpi label="Dönem başı" small value={formatMoney(d.opening)} />
        <Kpi label="Giriş" tone="ok" small value={formatMoney(d.total_in)} />
        <Kpi label="Çıkış" tone="danger" small value={formatMoney(d.total_out)} />
        <Kpi label="Dönem sonu" tone="accent" small value={formatMoney(d.closing)} />
      </div>

      <div className="card">
        <div className="card__body card__body--flush">
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Hesap hareketleri ve yürüyen bakiye</caption>
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Açıklama</th>
                  <th scope="col" className="right">Giriş</th>
                  <th scope="col" className="right">Çıkış</th>
                  <th scope="col" className="right">Bakiye</th>
                  {can(P.cashManage) && <th scope="col"><span className="visually-hidden">İşlem</span></th>}
                </tr>
              </thead>
              <tbody>
                {d.movements.items.length === 0 && (
                  <tr><td colSpan={6} className="muted small">Bu aralıkta hareket yok.</td></tr>
                )}
                {d.movements.items.map((m) => (
                  <tr key={m.id} style={m.is_reversed || m.reversal_of_id ? { opacity: 0.7 } : undefined}>
                    <td className="small nowrap">{formatDate(m.date)}</td>
                    <td>
                      <div className="cell-main">{m.description}</div>
                      <div className="cell-sub">
                        {cashSource(m.source)}
                        {m.reference ? ` · ${m.reference}` : ""}
                        {m.created_by_name ? ` · ${m.created_by_name}` : ""}
                        {m.is_reversed && <> · <Badge tone="danger">Geri alındı</Badge></>}
                        {m.reversal_of_id && <> · <Badge>Ters hareket</Badge></>}
                      </div>
                    </td>
                    <td className="right">{Number(m.inflow) !== 0 ? <Money value={m.inflow} /> : <span className="subtle">—</span>}</td>
                    <td className="right">{Number(m.outflow) !== 0 ? <Money value={m.outflow} /> : <span className="subtle">—</span>}</td>
                    <td className="right"><Money value={m.running_balance} /></td>
                    {can(P.cashManage) && (
                      <td className="right">{m.source === "manual" && !m.is_reversed && !m.reversal_of_id && <ReverseMovement m={m} />}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card__foot">
          <Pager page={d.movements.page} pageSize={d.movements.page_size} total={d.movements.total} onPage={(p) => set({ page: String(p) })} />
          <p className="small muted mb-0">Tahsilat, gider ve aktarım hareketleri kendi ekranlarından geri alınır; burada yalnız elle girilen hareket geri alınabilir.</p>
        </div>
      </div>
    </div>
  );
}

function MovementForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [f, setF] = useState({ direction: "in", amount: "", date: todayIso(), description: "", reference: "" });
  const [amountErr, setAmountErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Movement>("POST", "/cash-movements", { money: true, onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.amount);
    if (!amount || Number(amount) <= 0) return setAmountErr("Geçerli bir tutar girin.");
    setAmountErr(undefined);
    m.mutate({ cash_account_id: accountId, direction: f.direction, amount, date: f.date, description: f.description.trim(), reference: f.reference.trim() || null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Elle hareket</span><span className="card__meta ml-auto">banka masrafı, faiz geliri gibi</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Yön">{(p) => <select {...p} className="field__input" value={f.direction} onChange={up("direction")}><option value="in">Giriş</option><option value="out">Çıkış</option></select>}</Field>
          <Field label="Tutar (₺)" required error={amountErr ?? fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={up("amount")} />}</Field>
          <Field label="Tarih">{(p) => <input {...p} className="field__input" type="date" value={f.date} onChange={up("date")} />}</Field>
          <Field label="Açıklama" required error={fieldError(m.error, "description")}>{(p) => <input {...p} className="field__input" value={f.description} onChange={up("description")} />}</Field>
          <Field label="Referans">{(p) => <input {...p} className="field__input" value={f.reference} onChange={up("reference")} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.amount || !f.description.trim()}>Kaydet</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

function ReverseMovement({ m }: { m: Movement }) {
  const [reason, setReason] = useState("");
  const mut = useSiteMutation<{ reason: string }, Movement>("POST", `/cash-movements/${m.id}/reverse`, { money: true });
  return (
    <ConfirmButton
      className="btn btn--ghost btn--sm"
      danger
      title="Hareketi geri al"
      confirmLabel="Geri al"
      body={
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <p className="mb-0">"{m.description}" için ters hareket atılır; orijinal kayıt yerinde kalır.</p>
          <div className="field">
            <label className="field__label" htmlFor={`mv-${m.id}`}>Gerekçe *</label>
            <input id={`mv-${m.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      }
      onConfirm={() => {
        if (!reason.trim()) throw new Error("Gerekçe zorunlu.");
        return mut.mutateAsync({ reason: reason.trim() });
      }}
    >
      Geri al
    </ConfirmButton>
  );
}
