import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowLeftRight, Landmark, Plus, Wallet } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CashAccounts, Schemas } from "../../api/types";
import { Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatMoney, formatMoneyShort, parseMoneyInput, todayIso } from "../../lib/format";
import { cashAccountKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Account = Schemas["CashAccountOut"];

export function CashPage() {
  const { can } = useSite();
  const q = useSiteGet<CashAccounts>("/cash-accounts");
  const [panel, setPanel] = useState<"account" | "transfer" | null>(null);
  const toggle = (p: "account" | "transfer") => setPanel((x) => (x === p ? null : p));

  return (
    <div className="stack">
      <PageHead
        title="Kasa ve banka"
        subtitle="Platform parayı tutmaz; burada sitenin kendi hesaplarındaki hareketler izlenir."
        actions={
          can(P.cashManage) && (
            <>
              <button className="btn" type="button" aria-expanded={panel === "transfer"} onClick={() => toggle("transfer")}><ArrowLeftRight aria-hidden="true" /> Aktarım</button>
              <button className="btn btn--primary" type="button" aria-expanded={panel === "account"} onClick={() => toggle("account")}><Plus aria-hidden="true" /> Hesap aç</button>
            </>
          )
        }
      />

      {panel === "account" && <NewAccountForm onDone={() => setPanel(null)} />}
      {panel === "transfer" && q.data && <TransferForm accounts={q.data.items.filter((a) => a.is_active)} onDone={() => setPanel(null)} />}

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <div className="card"><Empty title="Henüz hesap yok" icon={<Landmark aria-hidden="true" />}>Kasa ya da banka hesabı açın.</Empty></div>
      ) : (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Toplam bakiye" tone="accent" value={formatMoneyShort(q.data.total_balance)} note={formatMoney(q.data.total_balance)} />
          </div>
          <div className="grid grid--sites">
            {q.data.items.map((a) => <AccountCard key={a.id} a={a} />)}
          </div>
        </>
      )}
    </div>
  );
}

function AccountCard({ a }: { a: Account }) {
  return (
    <Link to={a.id} className="card site-card" style={{ textDecoration: "none", color: "inherit", opacity: a.is_active ? 1 : 0.6 }}>
      <div className="card__head">
        <span className={`card__icon ${a.kind === "bank" ? "card__icon--accent" : "card__icon--warn"}`}>{a.kind === "bank" ? <Landmark aria-hidden="true" /> : <Wallet aria-hidden="true" />}</span>
        <span className="card__title">{a.name}</span>
        <span className="card__meta ml-auto">{cashAccountKind(a.kind)}{!a.is_active ? " · Pasif" : ""}</span>
      </div>
      <div className="card__body">
        <div className="kv"><span className="kv__k">Bakiye</span><span className="kv__v strong"><Money value={a.balance} /></span></div>
        <div className="kv"><span className="kv__k">Giriş</span><span className="kv__v"><Money value={a.inflow} /></span></div>
        <div className="kv"><span className="kv__k">Çıkış</span><span className="kv__v"><Money value={a.outflow} /></span></div>
        {(a.bank_name || a.iban) && (
          <div className="kv">
            <span className="kv__k">{a.bank_name ?? "IBAN"}</span>
            <span className="kv__v mono xs">{a.iban ? a.iban.replace(/(.{4})/g, "$1 ").trim() : ""}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", kind: "bank", bank_name: "", iban: "", opening_balance: "0", opening_date: todayIso(), note: "" });
  const [amountErr, setAmountErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Account>("POST", "/cash-accounts", { money: true, onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const opening = parseMoneyInput(f.opening_balance || "0");
    if (opening === null) return setAmountErr("Geçerli bir tutar girin.");
    setAmountErr(undefined);
    m.mutate({
      name: f.name.trim(),
      kind: f.kind,
      bank_name: f.kind === "bank" ? f.bank_name.trim() || null : null,
      iban: f.kind === "bank" ? f.iban.replace(/\s/g, "").toLocaleUpperCase("tr-TR") || null : null,
      opening_balance: opening,
      opening_date: f.opening_date || null,
      note: f.note.trim() || null,
    });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Yeni hesap</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Hesap adı" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" value={f.name} onChange={up("name")} />}</Field>
          <Field label="Tür">{(p) => <select {...p} className="field__input" value={f.kind} onChange={up("kind")}><option value="bank">Banka</option><option value="cash">Kasa</option></select>}</Field>
          {f.kind === "bank" && <Field label="Banka">{(p) => <input {...p} className="field__input" value={f.bank_name} onChange={up("bank_name")} />}</Field>}
          {f.kind === "bank" && <Field label="IBAN" error={fieldError(m.error, "iban")}>{(p) => <input {...p} className="field__input mono" value={f.iban} onChange={up("iban")} placeholder="TR00 0000 …" />}</Field>}
          <Field label="Açılış bakiyesi (₺)" error={amountErr ?? fieldError(m.error, "opening_balance")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.opening_balance} onChange={up("opening_balance")} />}</Field>
          <Field label="Açılış tarihi">{(p) => <input {...p} className="field__input" type="date" value={f.opening_date} onChange={up("opening_date")} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.name.trim()}>Hesabı aç</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

function TransferForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const [f, setF] = useState({ from_id: accounts[0]?.id ?? "", to_id: accounts[1]?.id ?? "", amount: "", date: todayIso(), note: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/cash-transfers", { money: true, onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.amount);
    const next: Record<string, string> = {};
    if (!amount || Number(amount) <= 0) next.amount = "Geçerli bir tutar girin.";
    if (f.from_id === f.to_id) next.to_id = "Gönderen ve alan hesap aynı olamaz.";
    setErrs(next);
    if (Object.keys(next).length) return;
    m.mutate({ from_id: f.from_id, to_id: f.to_id, amount, date: f.date, note: f.note.trim() || null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Hesaplar arası aktarım</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Gönderen hesap">{(p) => <select {...p} className="field__input" value={f.from_id} onChange={up("from_id")}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {formatMoney(a.balance)}</option>)}</select>}</Field>
          <Field label="Alan hesap" error={errs.to_id}>{(p) => <select {...p} className="field__input" value={f.to_id} onChange={up("to_id")}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
          <Field label="Tutar (₺)" required error={errs.amount ?? fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={up("amount")} />}</Field>
          <Field label="Tarih">{(p) => <input {...p} className="field__input" type="date" value={f.date} onChange={up("date")} />}</Field>
          <Field label="Açıklama">{(p) => <input {...p} className="field__input" value={f.note} onChange={up("note")} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.amount || accounts.length < 2}>Aktar</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
