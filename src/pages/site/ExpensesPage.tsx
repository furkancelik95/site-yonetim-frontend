import { useState } from "react";
import { Link } from "react-router";
import { FileText, Inbox, Plus, Repeat } from "lucide-react";
import { openDocument } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CashAccounts, Schemas } from "../../api/types";
import { ExcelButton } from "../../components/ExcelButton";
import { useToast } from "../../components/toast";
import { Badge, ConfirmButton, Empty, ErrorState, Kpi, Loading, Money, PageHead, Pager } from "../../components/ui";
import { formatDate, formatMoney, formatMoneyShort, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { P, useSite } from "../../site/SiteContext";

type Expenses = Schemas["ExpensePage"];
type Expense = Schemas["ExpenseOut"];
type Category = Schemas["ExpenseCategoryOut"];

export function ExpensesPage() {
  const { site, can } = useSite();
  const year = String(new Date().getFullYear());
  const [s, set] = useUrlState({ year, category: "", paid: "", page: "1" });
  const filters = { year: s.year, category_id: s.category, paid: s.paid };
  const r = useSiteGet<Expenses>("/expenses", { ...filters, page: s.page, page_size: 50 });
  const cats = useSiteGet<Category[]>("/expense-categories");
  const catName = (id: string) => cats.data?.find((c) => c.id === id)?.name ?? "—";
  const sum = r.data?.summary;
  const years = Array.from({ length: 4 }, (_, i) => String(Number(year) - i));

  return (
    <div className="stack">
      <PageHead
        title="Gider defteri"
        subtitle="Kayıt silinmez; hatalı gider eksi tutarlı düzeltme kaydıyla geri alınır."
        actions={
          <>
            <ExcelButton path={`/sites/${site.slug}/expenses/export.xlsx`} query={filters} fileName={`giderler-${s.year}.xlsx`} />
            <Link className="btn" to="tekrarlanan"><Repeat aria-hidden="true" /> Tekrarlanan</Link>
            {can(P.expensesManage) && <Link className="btn btn--primary" to="yeni"><Plus aria-hidden="true" /> Gider ekle</Link>}
          </>
        }
      />

      {sum && (
        <div className="grid grid--kpi">
          <Kpi label={`${s.year} toplam gider`} tone="accent" value={formatMoneyShort(sum.total)} note={formatMoney(sum.total)} />
          <Kpi label="Ödenmemiş" tone={sum.unpaid_count > 0 ? "warn" : "ok"} value={formatMoneyShort(sum.unpaid_total)} note={`${sum.unpaid_count} gider`} />
          {sum.by_category.slice(0, 2).map((c) => (
            <Kpi key={c.category_id} label={c.name} value={formatMoneyShort(c.total)} note={`${c.count} kayıt`} />
          ))}
        </div>
      )}

      <div className="filters">
        <div className="field">
          <label className="field__label" htmlFor="e-year">Yıl</label>
          <select id="e-year" className="field__input" value={s.year} onChange={(e) => set({ year: e.target.value })}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="e-cat">Kategori</label>
          <select id="e-cat" className="field__input" value={s.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Tümü</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="e-paid">Durum</label>
          <select id="e-paid" className="field__input" value={s.paid} onChange={(e) => set({ paid: e.target.value })}>
            <option value="">Tümü</option>
            <option value="true">Ödendi</option>
            <option value="false">Ödenmedi</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card__body card__body--flush">
          {r.isPending ? (
            <Loading />
          ) : r.isError ? (
            <div className="card__body"><ErrorState error={r.error} onRetry={() => r.refetch()} /></div>
          ) : r.data.items.length === 0 ? (
            <Empty title="Bu filtreye uyan gider yok" icon={<Inbox aria-hidden="true" />}>{can(P.expensesManage) ? "Yeni gider ekleyebilir ya da filtreyi değiştirebilirsiniz." : "Filtreyi değiştirin."}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Giderler</caption>
                <thead>
                  <tr>
                    <th scope="col">Tarih</th>
                    <th scope="col">Gider</th>
                    <th scope="col">Kategori</th>
                    <th scope="col">Durum</th>
                    <th scope="col" className="right">Tutar</th>
                    <th scope="col"><span className="visually-hidden">İşlem</span></th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.items.map((e) => (
                    <ExpenseRow key={e.id} e={e} cat={catName(e.expense_category_id)} canManage={can(P.expensesManage)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {r.data && (
          <div className="card__foot">
            <Pager page={r.data.page} pageSize={r.data.page_size} total={r.data.total} onPage={(p) => set({ page: String(p) })} />
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseRow({ e, cat, canManage }: { e: Expense; cat: string; canManage: boolean }) {
  const { site } = useSite();
  const toast = useToast();
  const muted = e.is_reversed || e.is_reversal;
  return (
    <tr style={muted ? { opacity: 0.7 } : undefined}>
      <td className="small nowrap">{formatDate(e.date)}</td>
      <td>
        <div className="cell-main">{e.description}</div>
        <div className="cell-sub">{[e.vendor, e.document_number].filter(Boolean).join(" · ") || "—"}</div>
      </td>
      <td className="small">{cat}</td>
      <td>
        {e.is_reversal ? <Badge tone="muted">Düzeltme kaydı</Badge> : e.is_reversed ? <Badge tone="danger">Geri alındı</Badge> : e.is_paid ? <Badge tone="ok">Ödendi {formatDate(e.paid_on)}</Badge> : <Badge tone="warn">Ödenmedi</Badge>}
      </td>
      <td className="right"><Money value={e.amount} /></td>
      <td className="right nowrap">
        {e.stored_file_id && (
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => openDocument(`/sites/${site.slug}/files/${e.stored_file_id}`).catch(() => toast("Belge açılamadı.", "danger"))}
          >
            <FileText aria-hidden="true" /> Belge
          </button>
        )}
        {canManage && !e.is_paid && !muted && <PayButton e={e} />}
        {canManage && !muted && <ReverseExpenseButton e={e} />}
      </td>
    </tr>
  );
}

function PayButton({ e }: { e: Expense }) {
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const accounts = cash.data?.items.filter((c) => c.is_active) ?? [];
  const [acc, setAcc] = useState("");
  const [date, setDate] = useState(todayIso());
  const m = useSiteMutation<{ cash_account_id: string; paid_on: string }, Expense>("POST", `/expenses/${e.id}/pay`, { money: true });
  const chosen = acc || accounts[0]?.id || "";
  return (
    <ConfirmButton
      className="btn btn--sm"
      title={`"${e.description}" — ödendi olarak işaretle`}
      confirmLabel="Ödendi"
      body={
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <p className="mb-0">{formatMoney(e.amount)} seçilen hesaptan çıkış olarak kaydedilir.</p>
          <div className="field">
            <label className="field__label" htmlFor={`pay-acc-${e.id}`}>Ödendiği hesap</label>
            <select id={`pay-acc-${e.id}`} className="field__input" value={chosen} onChange={(x) => setAcc(x.target.value)}>
              {accounts.map((c) => <option key={c.id} value={c.id}>{c.name} — {formatMoney(c.balance)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`pay-date-${e.id}`}>Ödeme tarihi</label>
            <input id={`pay-date-${e.id}`} className="field__input" type="date" value={date} onChange={(x) => setDate(x.target.value)} />
          </div>
        </div>
      }
      onConfirm={() => m.mutateAsync({ cash_account_id: chosen, paid_on: date })}
    >
      Öde
    </ConfirmButton>
  );
}

function ReverseExpenseButton({ e }: { e: Expense }) {
  const [reason, setReason] = useState("");
  const m = useSiteMutation<{ reason: string }, Expense>("POST", `/expenses/${e.id}/reverse`, { money: true });
  return (
    <ConfirmButton
      className="btn btn--ghost btn--sm"
      danger
      title={`"${e.description}" giderini geri al`}
      confirmLabel="Geri al"
      body={
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <p className="mb-0">Eksi tutarlı bir düzeltme kaydı oluşur; orijinal kayıt yerinde kalır.{e.is_paid ? " Ödeme de kasaya geri girer." : ""}</p>
          <div className="field">
            <label className="field__label" htmlFor={`rev-e-${e.id}`}>Gerekçe *</label>
            <input id={`rev-e-${e.id}`} className="field__input" value={reason} onChange={(x) => setReason(x.target.value)} />
          </div>
        </div>
      }
      onConfirm={() => {
        if (!reason.trim()) throw new Error("Gerekçe zorunlu.");
        return m.mutateAsync({ reason: reason.trim() });
      }}
    >
      Geri al
    </ConfirmButton>
  );
}
