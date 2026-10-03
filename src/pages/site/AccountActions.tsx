import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { FileCheck2, History, Undo2 } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CashAccounts } from "../../api/types";
import { ConfirmButton, Field, FormError, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatMoney, parseMoneyInput, todayIso } from "../../lib/format";
import { P, useSite } from "../../site/SiteContext";
import type { Certificate } from "./DocumentPages";

type Panel = "opening" | "refund" | null;

/**
 * Cari hesap işlemleri (Apsiyon karşılaştırmasındaki eksikler):
 * borçsuzluk belgesi (01), devir bakiye (02), iade (03) — backend #24–#26.
 */
export function AccountActions({ accountId, balance }: { accountId: string; balance: string }) {
  const { site, can } = useSite();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);
  const bal = Number(balance); // yalnız hangi düğmenin görüneceğine karar vermek için; hesap yapılmaz
  const cert = useSiteMutation<Record<string, never>, Certificate>("POST", `/accounts/${accountId}/clearance-certificates`, {
    onSuccess: (c) => c && navigate(`/s/${site.slug}/belge/borcsuzluk/${c.id}`),
  });

  if (!can(P.paymentRecord)) return null;
  const toggle = (p: Panel) => setPanel((x) => (x === p ? null : p));

  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Hesap işlemleri</span>
      </div>
      <div className="card__body row" style={{ gap: "var(--s-2)" }}>
        <ConfirmButton
          className="btn"
          title="Borçsuzluk belgesi düzenle"
          confirmLabel="Belgeyi düzenle"
          disabled={bal > 0.005}
          body={bal > 0.005 ? "Borcu olan hesaba belge verilemez." : `Hesabın bugünkü bakiyesi ${formatMoney(balance)}. Numaralı belge düzenlenip yazdırma sayfası açılır.`}
          onConfirm={() => cert.mutateAsync({})}
        >
          <FileCheck2 aria-hidden="true" /> Borçsuzluk belgesi
        </ConfirmButton>
        <button className="btn" type="button" aria-expanded={panel === "opening"} onClick={() => toggle("opening")}><History aria-hidden="true" /> Devir bakiye</button>
        <button className="btn" type="button" aria-expanded={panel === "refund"} disabled={bal >= -0.005} title={bal >= -0.005 ? "İade için hesabın alacak bakiyesi olmalı" : undefined} onClick={() => toggle("refund")}>
          <Undo2 aria-hidden="true" /> İade
        </button>
        {bal > 0.005 && <span className="small muted">Borç kapanınca borçsuzluk belgesi verilebilir.</span>}
      </div>
      {panel === "opening" && <OpeningForm accountId={accountId} onDone={() => setPanel(null)} />}
      {panel === "refund" && <RefundForm accountId={accountId} credit={(-bal).toFixed(2)} onDone={() => setPanel(null)} />}
    </div>
  );
}

/** Devir bakiye: sisteme geçmeden önceki borç/alacak. Hesap başına bir kez; düzeltme ters kayıtla. */
function OpeningForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [f, setF] = useState({ amount: "", direction: "debit", date: todayIso(), description: "" });
  const [amountErr, setAmountErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/accounts/${accountId}/opening-balance`, { money: true, onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.amount);
    if (!amount || Number(amount) <= 0) return setAmountErr("Geçerli bir tutar girin.");
    setAmountErr(undefined);
    m.mutate({ amount, direction: f.direction, date: f.date, description: f.description.trim() || null });
  }
  return (
    <form className="card__body stack" style={{ gap: "var(--s-3)", borderTop: "1px solid var(--line)" }} onSubmit={submit} noValidate>
      <p className="small muted mb-0">Sisteme geçmeden önceki yönetimden devralınan borç ya da alacak. Hesap başına bir kez girilir; ekstrede "Devir bakiye" olarak görünür.</p>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Tür">{(p) => <select {...p} className="field__input" value={f.direction} onChange={(e) => setF((x) => ({ ...x, direction: e.target.value }))}><option value="debit">Borç (sakin borçlu)</option><option value="credit">Alacak (sakin alacaklı)</option></select>}</Field>
        <Field label="Tutar (₺)" required error={amountErr ?? fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} />}</Field>
        <Field label="Devir tarihi" hint="Genelde sisteme geçiş tarihi.">{(p) => <input {...p} className="field__input" type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} />}</Field>
        <Field label="Açıklama">{(p) => <input {...p} className="field__input" value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} placeholder="ör. 2025 yönetiminden devir" />}</Field>
      </div>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.amount}>Devir bakiyeyi kaydet</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** İade: alacaklı (avans) bakiyenin sakine geri ödenmesi; kasa/bankadan çıkış. */
function RefundForm({ accountId, credit, onDone }: { accountId: string; credit: string; onDone: () => void }) {
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const accounts = cash.data?.items.filter((c) => c.is_active) ?? [];
  const [f, setF] = useState({ amount: formatMoney(credit, false), cash_account_id: "", reason: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/refunds", { money: true, onSuccess: onDone });
  const acc = f.cash_account_id || accounts.find((a) => a.kind === "bank")?.id || accounts[0]?.id || "";
  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.amount);
    const next: Record<string, string> = {};
    if (!amount || Number(amount) <= 0) next.amount = "Geçerli bir tutar girin.";
    if (!f.reason.trim()) next.reason = "Gerekçe zorunlu.";
    setErrs(next);
    if (Object.keys(next).length) return;
    m.mutate({ ledger_account_id: accountId, amount, date: todayIso(), cash_account_id: acc, reason: f.reason.trim() });
  }
  return (
    <form className="card__body stack" style={{ gap: "var(--s-3)", borderTop: "1px solid var(--line)" }} onSubmit={submit} noValidate>
      <p className="small muted mb-0">Hesabın alacak bakiyesi {formatMoney(credit)}. İade edilen tutar seçilen hesaptan çıkış olarak yazılır ({formatDate(todayIso())}).</p>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Tutar (₺)" required error={errs.amount ?? fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} />}</Field>
        <Field label="Ödendiği hesap">{(p) => <select {...p} className="field__input" value={acc} onChange={(e) => setF((x) => ({ ...x, cash_account_id: e.target.value }))}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
        <Field label="Gerekçe" required error={errs.reason ?? fieldError(m.error, "reason")}>{(p) => <input {...p} className="field__input" value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} placeholder="ör. Taşınma, fazla ödeme iadesi" />}</Field>
      </div>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>İadeyi kaydet</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
