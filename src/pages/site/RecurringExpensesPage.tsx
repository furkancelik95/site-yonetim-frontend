import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CashAccounts, Schemas } from "../../api/types";
import { MockBadge } from "../../components/MockBadge";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatMoney, parseMoneyInput } from "../../lib/format";
import { P, useSite } from "../../site/SiteContext";

type Category = Schemas["ExpenseCategoryOut"];

/** Servis isteği 07'deki yanıt şekli. */
interface Recurring {
  id: string;
  description: string;
  expense_category_id: string;
  amount: string;
  vendor: string | null;
  day_of_month: number;
  is_active: boolean;
  auto_pay: boolean;
  cash_account_id: string | null;
  next_run_on: string | null;
  last_created_on: string | null;
  created_at: string;
}

/**
 * Tekrarlanan gider (Apsiyon "Tekrarlanan Evrak"): her ay aynı gelen gider (bakım sözleşmesi,
 * personel, abonelik) bir kez tanımlanır; backend her ay seçilen günde gider kaydını oluşturur.
 */
export function RecurringExpensesPage() {
  const { site, can } = useSite();
  const q = useSiteGet<Recurring[]>("/recurring-expenses");
  const cats = useSiteGet<Category[]>("/expense-categories");
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  const catName = (id: string) => cats.data?.find((c) => c.id === id)?.name ?? "—";
  const manage = can(P.expensesManage);

  return (
    <div className="stack">
      <PageHead
        title="Tekrarlanan giderler"
        subtitle="Her ay aynı gelen gideri bir kez tanımlayın; seçtiğiniz günde gider defterine kendiliğinden yazılır."
        actions={
          <>
            <MockBadge request="07" />
            <Link className="btn" to={`/s/${site.slug}/giderler`}>Gider defteri</Link>
            {manage && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Yeni tanım</button>}
          </>
        }
      />

      {editing && <RecurringForm item={editing === "new" ? null : editing} cats={cats.data ?? []} onDone={() => setEditing(null)} />}

      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : q.data.length === 0 ? (
            <Empty title="Henüz tekrarlanan gider yok" icon={<Repeat aria-hidden="true" />}>
              Asansör bakım sözleşmesi, kapıcı maaşı, ortak alan elektriği gibi her ay gelen giderleri burada tanımlayın.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Tekrarlanan gider tanımları</caption>
                <thead>
                  <tr><th scope="col">Gider</th><th scope="col">Kategori</th><th scope="col">Her ayın</th><th scope="col">Sıradaki</th><th scope="col">Durum</th><th scope="col" className="right">Tutar</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr>
                </thead>
                <tbody>
                  {q.data.map((r) => <RecurringRow key={r.id} r={r} cat={catName(r.expense_category_id)} manage={manage} onEdit={() => setEditing(r)} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card__foot">
          <p className="small muted mb-0">Tutarı değişen giderlerde (fatura) oluşan kaydı gider defterinden düzeltebilirsiniz. Tanımı silmek, daha önce oluşturulan giderleri silmez.</p>
        </div>
      </div>
    </div>
  );
}

function RecurringRow({ r, cat, manage, onEdit }: { r: Recurring; cat: string; manage: boolean; onEdit: () => void }) {
  const toggle = useSiteMutation<{ is_active: boolean }, Recurring>("PATCH", `/recurring-expenses/${r.id}`);
  const del = useSiteMutation<string, Recurring>("DELETE", `/recurring-expenses/${r.id}`);
  return (
    <tr style={!r.is_active ? { opacity: 0.65 } : undefined}>
      <td><div className="cell-main">{r.description}</div><div className="cell-sub">{r.vendor ?? "—"}{r.auto_pay ? " · ödendi olarak işaretlenir" : ""}</div></td>
      <td className="small">{cat}</td>
      <td className="small">{r.day_of_month}. günü</td>
      <td className="small nowrap">{r.is_active ? formatDate(r.next_run_on) : "—"}{r.last_created_on && <div className="cell-sub">son: {formatDate(r.last_created_on)}</div>}</td>
      <td>{r.is_active ? <Badge tone="ok">Etkin</Badge> : <Badge>Durduruldu</Badge>}</td>
      <td className="right"><Money value={r.amount} /></td>
      {manage && (
        <td className="right nowrap">
          <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${r.description}: düzenle`} onClick={onEdit}><Pencil aria-hidden="true" /></button>
          <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={r.is_active ? `${r.description}: durdur` : `${r.description}: yeniden başlat`} disabled={toggle.isPending} onClick={() => toggle.mutate({ is_active: !r.is_active })}>
            {r.is_active ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <ConfirmButton className="btn btn--ghost btn--sm btn--icon" danger title={`"${r.description}" tanımını kaldır`} confirmLabel="Kaldır" body="Bundan sonra kendiliğinden gider oluşturulmaz. Daha önce oluşturulan giderler gider defterinde kalır." onConfirm={() => del.mutateAsync(r.id)}>
            <Trash2 aria-hidden="true" /><span className="visually-hidden">Kaldır</span>
          </ConfirmButton>
        </td>
      )}
    </tr>
  );
}

function RecurringForm({ item, cats, onDone }: { item: Recurring | null; cats: Category[]; onDone: () => void }) {
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const accounts = cash.data?.items.filter((c) => c.is_active) ?? [];
  const [f, setF] = useState({
    description: item?.description ?? "",
    expense_category_id: item?.expense_category_id ?? "",
    amount: item ? formatMoney(item.amount, false) : "",
    vendor: item?.vendor ?? "",
    day_of_month: String(item?.day_of_month ?? 1),
    auto_pay: item?.auto_pay ?? false,
    cash_account_id: item?.cash_account_id ?? "",
  });
  const [amountErr, setAmountErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Recurring>(item ? "PATCH" : "POST", item ? `/recurring-expenses/${item.id}` : "/recurring-expenses", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const category = f.expense_category_id || cats[0]?.id || "";
  const acc = f.cash_account_id || accounts.find((a) => a.kind === "bank")?.id || accounts[0]?.id || "";

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.amount);
    if (!amount || Number(amount) <= 0) return setAmountErr("Geçerli bir tutar girin (ör. 19.440,00).");
    setAmountErr(undefined);
    m.mutate({
      description: f.description.trim(),
      expense_category_id: category,
      amount,
      vendor: f.vendor.trim() || null,
      day_of_month: Number(f.day_of_month),
      auto_pay: f.auto_pay,
      cash_account_id: f.auto_pay ? acc : null,
      is_active: item?.is_active ?? true,
    });
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{item ? `"${item.description}" tanımını düzenle` : "Yeni tekrarlanan gider"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Açıklama" required error={fieldError(m.error, "description")}>{(p) => <input {...p} className="field__input" value={f.description} onChange={up("description")} placeholder="ör. Asansör bakım sözleşmesi" />}</Field>
          <Field label="Tutar (₺)" required error={amountErr ?? fieldError(m.error, "amount")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={up("amount")} />}</Field>
          <Field label="Her ayın kaçında" hint="1–28" error={fieldError(m.error, "day_of_month")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.day_of_month} onChange={(e) => setF((x) => ({ ...x, day_of_month: e.target.value.replace(/\D/g, "") }))} />}</Field>
          <Field label="Kategori" error={fieldError(m.error, "expense_category_id")}>{(p) => <select {...p} className="field__input" value={category} onChange={up("expense_category_id")}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
          <Field label="Firma / tedarikçi">{(p) => <input {...p} className="field__input" value={f.vendor} onChange={up("vendor")} />}</Field>
        </div>
        <label className="check check--rich">
          <input type="checkbox" checked={f.auto_pay} onChange={(e) => setF((x) => ({ ...x, auto_pay: e.target.checked }))} />
          <span><span className="strong">Ödendi olarak işaretle</span><br /><span className="small muted">Otomatik ödeme talimatı olan giderler için. İşaretli değilse gider "ödenmedi" olarak oluşur, siz ödersiniz.</span></span>
        </label>
        {f.auto_pay && (
          <Field label="Ödendiği hesap" error={fieldError(m.error, "cash_account_id")}>{(p) => <select {...p} className="field__input" value={acc} onChange={up("cash_account_id")}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
        )}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.description.trim() || !f.amount}>{item ? "Kaydet" : "Tanımı ekle"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
