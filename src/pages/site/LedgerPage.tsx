import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { AccountStatement, CashAccounts, Schemas } from "../../api/types";
import { Badge, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatMoney, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { accountKind, allocationKind, ledgerSource, paymentMethod } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { AccountActions } from "./AccountActions";

export function LedgerPage() {
  const { accountId = "" } = useParams();
  const { site, can } = useSite();
  const [s, set] = useUrlState({ page: "1" });
  const q = useSiteGet<AccountStatement>(`/accounts/${accountId}/statement`, { page: s.page, page_size: 50 });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { account: a, entries, last_charge } = q.data;

  return (
    <div className="stack">
      <PageHead
        title={`${a.unit_name} · ${accountKind(a.kind)} hesabı`}
        subtitle={
          <>
            {a.person_name ?? "—"} · <span className="mono">{a.reference_code}</span>
            {a.is_closed && <> · <Badge>Kapalı</Badge></>}
          </>
        }
        actions={<Link className="btn" to={`/s/${site.slug}/daireler/${a.unit_id}`}>Bölüme git</Link>}
      />

      <div className="grid grid--kpi">
        <Kpi label="Bakiye" tone={Number(a.balance) > 0 ? "danger" : "ok"} value={formatMoney(a.balance)} note={Number(a.balance) < 0 ? "avans (alacak)" : Number(a.balance) > 0 ? "borç" : "kapalı"} small />
        <Kpi label="En eski açık vade" value={formatDate(a.oldest_open_due_date)} small />
        {last_charge && <Kpi label={`Son tahakkuk (${last_charge.period})`} value={formatMoney(last_charge.amount)} small />}
      </div>

      {can(P.paymentRecord) && !a.is_closed && <PaymentForm accountId={a.id} balance={a.balance} />}
      {!a.is_closed && <AccountActions accountId={a.id} balance={a.balance} />}

      {last_charge && last_charge.lines.length > 0 && (
        <details className="card">
          <summary className="card__head" style={{ cursor: "pointer" }}>
            <span className="card__title">Bu tutar nasıl hesaplandı? ({last_charge.period})</span>
          </summary>
          <div className="card__body card__body--flush">
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Son tahakkukun kalem dökümü</caption>
                <thead><tr><th scope="col">Kalem</th><th scope="col">Dağıtım</th><th scope="col" className="right">Tutar</th></tr></thead>
                <tbody>
                  {last_charge.lines.map((l) => (
                    <tr key={l.budget_item_id}>
                      <td>
                        <div className="cell-main">{l.description}</div>
                        <div className="calc">{l.explanation}</div>
                      </td>
                      <td className="small">{allocationKind(l.allocation_kind)}</td>
                      <td className="right"><Money value={l.amount} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={2}>Toplam</td><td className="right"><Money value={last_charge.amount} /></td></tr></tfoot>
              </table>
            </div>
          </div>
        </details>
      )}

      <div className="card">
        <div className="card__head"><span className="card__title">Hesap hareketleri</span><span className="card__meta ml-auto">{entries.total} kayıt · yeni üstte</span></div>
        <div className="card__body card__body--flush">
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Cari hesap hareketleri ve yürüyen bakiye</caption>
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Açıklama</th>
                  <th scope="col" className="hide-sm">Vade</th>
                  <th scope="col" className="right">Borç</th>
                  <th scope="col" className="right">Alacak</th>
                  <th scope="col" className="right">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {entries.items.map((e) => (
                  <tr key={e.id}>
                    <td className="small nowrap">{formatDate(e.date)}</td>
                    <td>
                      <div className="cell-main">{e.description}</div>
                      <div className="cell-sub">{ledgerSource(e.source)}</div>
                    </td>
                    <td className="small nowrap hide-sm">{formatDate(e.due_date)}</td>
                    <td className="right">{Number(e.debit) !== 0 ? <Money value={e.debit} /> : <span className="subtle">—</span>}</td>
                    <td className="right">{Number(e.credit) !== 0 ? <Money value={e.credit} /> : <span className="subtle">—</span>}</td>
                    <td className="right"><Money value={e.running_balance} tone="balance" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card__foot">
          <Pager page={entries.page} pageSize={entries.page_size} total={entries.total} onPage={(p) => set({ page: String(p) })} />
        </div>
      </div>
    </div>
  );
}

/** Tahsilat girişi. Tutar en eski borçtan başlayarak kapatılır (backend docs/04 §5.1). */
function PaymentForm({ accountId, balance }: { accountId: string; balance: string }) {
  const { site } = useSite();
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const accounts = cash.data?.items.filter((c) => c.is_active) ?? [];
  const [f, setF] = useState({ amount: Number(balance) > 0 ? formatMoney(balance, false) : "", date: todayIso(), method: "bank_transfer", cash_account_id: "", reference: "", note: "" });
  const [amountErr, setAmountErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Schemas["PaymentResultOut"]>("POST", "/payments", {
    money: true,
    onSuccess: () => setF((x) => ({ ...x, amount: "", reference: "", note: "" })),
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const defaultCash = f.cash_account_id || (accounts.find((c) => (f.method === "cash" ? c.kind === "cash" : c.kind === "bank"))?.id ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.amount);
    if (!amount || Number(amount) <= 0) {
      setAmountErr("Geçerli bir tutar girin (ör. 1.250,00).");
      return;
    }
    setAmountErr(undefined);
    m.mutate({
      ledger_account_id: accountId,
      amount,
      date: f.date,
      method: f.method,
      cash_account_id: defaultCash || null,
      reference: f.reference.trim() || null,
      note: f.note.trim() || null,
    });
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Tahsilat gir</span><span className="card__meta ml-auto">En eski borçtan başlayarak kapatılır</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="pay-form">
          <Field label="Tutar (₺)" required error={amountErr ?? fieldError(m.error, "amount")}>
            {(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={up("amount")} />}
          </Field>
          <Field label="Tarih" required error={fieldError(m.error, "date")}>
            {(p) => <input {...p} className="field__input" type="date" value={f.date} onChange={up("date")} />}
          </Field>
          <Field label="Yöntem" required>
            {(p) => (
              <select {...p} className="field__input" value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value, cash_account_id: "" }))}>
                {["bank_transfer", "cash", "credit_card", "other"].map((k) => <option key={k} value={k}>{paymentMethod(k)}</option>)}
              </select>
            )}
          </Field>
          <Field label="Kasa / banka hesabı" error={fieldError(m.error, "cash_account_id")}>
            {(p) => (
              <select {...p} className="field__input" value={defaultCash} onChange={up("cash_account_id")}>
                <option value="">Seçilmedi</option>
                {accounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <div className="pay-form__submit">
            <SubmitButton busy={m.isPending} disabled={!f.amount}>Tahsilatı kaydet</SubmitButton>
          </div>
        </div>
        <div className="grid grid--2">
          <Field label="Dekont / referans no">
            {(p) => <input {...p} className="field__input" value={f.reference} onChange={up("reference")} />}
          </Field>
          <Field label="Not">
            {(p) => <input {...p} className="field__input" value={f.note} onChange={up("note")} />}
          </Field>
        </div>
        {m.data && (
          <p className="small muted mb-0" role="status">
            Son tahsilat: {formatMoney(m.data.data.applied)} borca sayıldı
            {Number(m.data.data.unapplied) > 0 && <>, {formatMoney(m.data.data.unapplied)} avans olarak kaldı</>}. Yeni bakiye {formatMoney(m.data.data.balance)}.{" "}
            <Link to={`/s/${site.slug}/makbuz/${m.data.data.payment.id}`}>Makbuzu aç</Link>
          </p>
        )}
      </div>
    </form>
  );
}
