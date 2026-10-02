import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CashAccounts, Schemas } from "../../api/types";
import { Field, FormError, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { parseMoneyInput, todayIso } from "../../lib/format";
import { expenseCategoryKind } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Category = Schemas["ExpenseCategoryOut"];

// Yükleme kuralları backend docs/09 §3 ile aynı; asıl kontrol (içerik imzası) sunucuda.
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
const MAX_BYTES = 10 * 1024 * 1024;

export function NewExpensePage() {
  const { site } = useSite();
  const navigate = useNavigate();
  const cats = useSiteGet<Category[]>("/expense-categories");
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const accounts = cash.data?.items.filter((c) => c.is_active) ?? [];
  const [f, setF] = useState({ expense_category_id: "", description: "", amount: "", date: todayIso(), vendor: "", document_number: "", note: "", paid: false, paid_on: todayIso(), cash_account_id: "" });
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useSiteMutation<FormData, Schemas["ExpenseOut"]>("POST", "/expenses", { form: true, money: true, onSuccess: () => navigate(`/s/${site.slug}/giderler`) });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const category = f.expense_category_id || cats.data?.[0]?.id || "";
  const cashAcc = f.cash_account_id || accounts.find((a) => a.kind === "bank")?.id || accounts[0]?.id || "";

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.amount);
    const next: Record<string, string> = {};
    if (!f.description.trim()) next.description = "Açıklama zorunlu.";
    if (!amount || Number(amount) <= 0) next.amount = "Geçerli bir tutar girin (ör. 1.250,00).";
    if (file && file.size > MAX_BYTES) next.document = "Belge en fazla 10 MB olabilir.";
    if (f.paid && !cashAcc) next.cash_account_id = "Ödendiği hesabı seçin.";
    setErrs(next);
    if (Object.keys(next).length) return;

    const fd = new FormData();
    fd.set("expense_category_id", category);
    fd.set("description", f.description.trim());
    fd.set("amount", amount!);
    fd.set("date", f.date);
    if (f.vendor.trim()) fd.set("vendor", f.vendor.trim());
    if (f.document_number.trim()) fd.set("document_number", f.document_number.trim());
    if (f.note.trim()) fd.set("note", f.note.trim());
    fd.set("paid", String(f.paid));
    if (f.paid) {
      fd.set("paid_on", f.paid_on);
      fd.set("cash_account_id", cashAcc);
    }
    if (file) fd.set("document", file);
    m.mutate(fd);
  }

  const err = (k: string) => errs[k] ?? fieldError(m.error, k);

  return (
    <div className="stack page--narrow">
      <PageHead title="Yeni gider" actions={<Link className="btn" to={`/s/${site.slug}/giderler`}>Vazgeç</Link>} />
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <FormError error={m.error} />
          <div className="grid grid--2">
            <Field label="Kategori" required>
              {(p) => (
                <select {...p} className="field__input" value={category} onChange={up("expense_category_id")}>
                  {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({expenseCategoryKind(c.kind)})</option>)}
                </select>
              )}
            </Field>
            <Field label="Tarih" required error={err("date")}>
              {(p) => <input {...p} className="field__input" type="date" value={f.date} onChange={up("date")} />}
            </Field>
          </div>
          <Field label="Açıklama" required error={err("description")}>
            {(p) => <input {...p} className="field__input" value={f.description} onChange={up("description")} placeholder="ör. Asansör bakımı — Ekim" />}
          </Field>
          <div className="grid grid--2">
            <Field label="Tutar (₺)" required error={err("amount")}>
              {(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={up("amount")} />}
            </Field>
            <Field label="Firma / tedarikçi">
              {(p) => <input {...p} className="field__input" value={f.vendor} onChange={up("vendor")} />}
            </Field>
            <Field label="Fatura / belge no">
              {(p) => <input {...p} className="field__input" value={f.document_number} onChange={up("document_number")} />}
            </Field>
            <Field label="Belge (fatura, fiş)" hint="PDF, JPG, PNG ya da WEBP; en fazla 10 MB." error={err("document")}>
              {(p) => <input {...p} className="field__input" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
            </Field>
          </div>
          <Field label="Not">
            {(p) => <textarea {...p} className="field__input" rows={2} value={f.note} onChange={up("note")} />}
          </Field>

          <label className="check check--rich">
            <input type="checkbox" checked={f.paid} onChange={(e) => setF((x) => ({ ...x, paid: e.target.checked }))} />
            <span>
              <span className="strong">Ödendi</span>
              <br />
              <span className="small muted">İşaretlenirse tutar seçilen kasa/banka hesabından çıkış olarak yazılır.</span>
            </span>
          </label>
          {f.paid && (
            <div className="grid grid--2">
              <Field label="Ödendiği hesap" required error={err("cash_account_id")}>
                {(p) => (
                  <select {...p} className="field__input" value={cashAcc} onChange={up("cash_account_id")}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Ödeme tarihi" required error={err("paid_on")}>
                {(p) => <input {...p} className="field__input" type="date" value={f.paid_on} onChange={up("paid_on")} />}
              </Field>
            </div>
          )}
        </div>
        <div className="card__foot">
          <SubmitButton busy={m.isPending}>Gideri kaydet</SubmitButton>
        </div>
      </form>
    </div>
  );
}
