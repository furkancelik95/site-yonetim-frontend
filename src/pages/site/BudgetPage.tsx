import { useState, type FormEvent } from "react";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatMoney, formatMoneyShort, parseMoneyInput, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { allocationKind, budgetStatus, budgetTone, frequency, payerRule } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Plan = Schemas["BudgetPlanOut"];
type PlanDetail = Schemas["BudgetPlanDetail"];
type Item = Schemas["BudgetItemOut"];
type Category = Schemas["ExpenseCategoryOut"];
type ChargeType = Schemas["ChargeTypeOut"];
type Rule = Schemas["AllocationRuleOut"];

export function BudgetPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ plan: "" });
  const plans = useSiteGet<Page<Plan>>("/budget-plans", { page_size: 50 });
  const list = plans.data?.items ?? [];
  // Varsayılan: kesinleşmiş (geçerli) proje, yoksa en yeni taslak
  const selectedId = s.plan || list.find((p) => p.status === "finalized")?.id || list[0]?.id || "";
  const [creating, setCreating] = useState(false);

  return (
    <div className="stack">
      <PageHead
        title="İşletme projesi"
        subtitle="Yıllık gider tahmini ve dağıtım kuralları. Aylık tahakkuk buradaki kalemlerden hesaplanır (KMK m.37)."
        actions={can(P.budgetManage) && <button className="btn" type="button" onClick={() => setCreating((v) => !v)} aria-expanded={creating}><Plus aria-hidden="true" /> Yeni proje</button>}
      />

      {creating && <NewPlanForm onDone={(id) => { setCreating(false); if (id) set({ plan: id }); }} />}

      {plans.isPending ? (
        <Loading />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : list.length === 0 ? (
        <div className="card"><Empty title="Henüz işletme projesi yok" icon={<Receipt aria-hidden="true" />}>Yeni proje oluşturup kalemlerini ekleyin.</Empty></div>
      ) : (
        <>
          {list.length > 1 && (
            <div className="filters">
              <div className="field">
                <label className="field__label" htmlFor="plan-sel">Proje</label>
                <select id="plan-sel" className="field__input" value={selectedId} onChange={(e) => set({ plan: e.target.value })}>
                  {list.map((p) => <option key={p.id} value={p.id}>{p.name} — {budgetStatus(p.status)}</option>)}
                </select>
              </div>
            </div>
          )}
          {selectedId && <PlanView id={selectedId} canManage={can(P.budgetManage)} />}
        </>
      )}
    </div>
  );
}

function NewPlanForm({ onDone }: { onDone: (id?: string) => void }) {
  const year = new Date().getFullYear() + 1;
  const [f, setF] = useState({ fiscal_year: String(year), name: `${year} İşletme Projesi` });
  const m = useSiteMutation<{ fiscal_year: number; name: string }, PlanDetail>("POST", "/budget-plans", { onSuccess: (d) => onDone(d?.id) });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ fiscal_year: Number(f.fiscal_year), name: f.name.trim() }); }}>
      <div className="card__head"><span className="card__title">Yeni işletme projesi (taslak)</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Mali yıl" required error={fieldError(m.error, "fiscal_year")}>
            {(p) => <input {...p} className="field__input" inputMode="numeric" value={f.fiscal_year} onChange={(e) => setF((x) => ({ ...x, fiscal_year: e.target.value }))} />}
          </Field>
          <Field label="Ad" required error={fieldError(m.error, "name")}>
            {(p) => <input {...p} className="field__input" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}
          </Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.name.trim()}>Oluştur</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={() => onDone()}>Vazgeç</button>
      </div>
    </form>
  );
}

function PlanView({ id, canManage }: { id: string; canManage: boolean }) {
  const q = useSiteGet<PlanDetail>(`/budget-plans/${id}`);
  const cats = useSiteGet<Category[]>("/expense-categories");
  const types = useSiteGet<ChargeType[]>("/charge-types");
  const rules = useSiteGet<Rule[]>("/allocation-rules");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [notifyOn, setNotifyOn] = useState(todayIso());
  const notify = useSiteMutation<{ notified_on: string }, PlanDetail>("POST", `/budget-plans/${id}/notify`);
  const finalize = useSiteMutation<Record<string, never>, PlanDetail>("POST", `/budget-plans/${id}/finalize`);
  const del = useSiteMutation<string, PlanDetail>("DELETE", (itemId) => `/budget-plans/${id}/items/${itemId}`);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  const editable = canManage && p.status === "draft";
  const name = <T extends { id: string; name: string }>(list: T[] | undefined, x: string) => list?.find((i) => i.id === x)?.name ?? "—";

  return (
    <>
      <div className="grid grid--kpi">
        <Kpi label="Durum" value={<Badge tone={budgetTone(p.status)}>{budgetStatus(p.status)}</Badge>} small />
        <Kpi label="Yıllık toplam" tone="accent" value={formatMoneyShort(p.total_annual_amount)} note={formatMoney(p.total_annual_amount)} />
        <Kpi label="Kalem" value={p.item_count} />
        <Kpi label="Tebliğ / itiraz süresi" small value={formatDate(p.notified_on)} note={p.objection_deadline ? `itiraz son günü ${formatDate(p.objection_deadline)}` : "henüz tebliğ edilmedi"} />
      </div>

      {canManage && p.status === "draft" && (
        <Alert tone="info" title="Taslak">
          Kalemler düzenlenebilir. Kat malikleri kuruluna kabul ettirildikten sonra tebliğ tarihini girin; itiraz süresi bitince kesinleştirin.
        </Alert>
      )}

      <div className="card">
        <div className="card__head">
          <span className="card__title">{p.name}</span>
          {editable && (
            <button className="btn btn--sm ml-auto" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Kalem ekle</button>
          )}
        </div>
        {editing && (
          <ItemForm
            planId={p.id}
            item={editing === "new" ? null : editing}
            cats={cats.data ?? []}
            types={types.data ?? []}
            rules={rules.data ?? []}
            onDone={() => setEditing(null)}
          />
        )}
        <div className="card__body card__body--flush">
          {p.items.length === 0 ? (
            <Empty title="Kalem yok">Projeye gider kalemi ekleyin.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">İşletme projesi kalemleri</caption>
                <thead>
                  <tr>
                    <th scope="col">Kalem</th>
                    <th scope="col">Dağıtım</th>
                    <th scope="col">Ödeyen</th>
                    <th scope="col">Sıklık</th>
                    <th scope="col" className="right">Dönem tutarı</th>
                    <th scope="col" className="right">Yıllık</th>
                    {editable && <th scope="col"><span className="visually-hidden">İşlem</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((i) => {
                    const rule = rules.data?.find((r) => r.id === i.allocation_rule_id);
                    const type = types.data?.find((t) => t.id === i.charge_type_id);
                    return (
                      <tr key={i.id}>
                        <td>
                          <div className="cell-main">{i.name}</div>
                          <div className="cell-sub">{name(cats.data, i.expense_category_id)}</div>
                        </td>
                        <td className="small">{rule ? rule.name : "—"}<div className="cell-sub">{rule ? allocationKind(rule.kind) : ""}</div></td>
                        <td className="small">{type ? payerRule(type.payer_rule) : "—"}</td>
                        <td className="small">{frequency(i.frequency)}</td>
                        <td className="right"><Money value={i.period_amount} /></td>
                        <td className="right"><Money value={i.annual_amount} /></td>
                        {editable && (
                          <td className="right nowrap">
                            <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${i.name} kalemini düzenle`} onClick={() => setEditing(i)}><Pencil aria-hidden="true" /></button>
                            <ConfirmButton
                              className="btn btn--ghost btn--sm btn--icon"
                              danger
                              title={`"${i.name}" kalemini kaldır`}
                              confirmLabel="Kaldır"
                              body="Kalem taslak projeden çıkarılır."
                              onConfirm={() => del.mutateAsync(i.id)}
                            >
                              <Trash2 aria-hidden="true" /><span className="visually-hidden">Kaldır</span>
                            </ConfirmButton>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Yıllık toplam</td>
                    <td className="right"><Money value={p.total_annual_amount} /></td>
                    {editable && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        {canManage && (p.status === "draft" || p.status === "notified") && (
          <div className="card__foot row" style={{ gap: "var(--s-3)", alignItems: "flex-end" }}>
            {p.status === "draft" && (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="notify-on">Tebliğ tarihi</label>
                  <input id="notify-on" className="field__input" type="date" value={notifyOn} onChange={(e) => setNotifyOn(e.target.value)} />
                </div>
                <ConfirmButton
                  className="btn"
                  title="Tebliğ edildi olarak işaretle"
                  body="Proje malikleri bildirildi kabul edilir; itiraz süresi bu tarihten başlar. Bundan sonra kalemler değiştirilemez."
                  disabled={p.items.length === 0}
                  onConfirm={() => notify.mutateAsync({ notified_on: notifyOn })}
                >
                  Tebliğ edildi
                </ConfirmButton>
              </>
            )}
            {p.status === "notified" && (
              <ConfirmButton
                className="btn btn--primary"
                title="Projeyi kesinleştir"
                body="Kesinleşen proje geçerli proje olur; sonraki tahakkuklar bu kalemlerden hesaplanır. Önceki kesinleşmiş projenin yerini alır."
                onConfirm={() => finalize.mutateAsync({})}
              >
                Kesinleştir
              </ConfirmButton>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ItemForm({ planId, item, cats, types, rules, onDone }: { planId: string; item: Item | null; cats: Category[]; types: ChargeType[]; rules: Rule[]; onDone: () => void }) {
  const [f, setF] = useState({
    name: item?.name ?? "",
    expense_category_id: item?.expense_category_id ?? cats[0]?.id ?? "",
    charge_type_id: item?.charge_type_id ?? types[0]?.id ?? "",
    allocation_rule_id: item?.allocation_rule_id ?? rules[0]?.id ?? "",
    annual_amount: item ? formatMoney(item.annual_amount, false) : "",
    frequency: item?.frequency ?? "monthly",
  });
  const [amountErr, setAmountErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, PlanDetail>(item ? "PUT" : "POST", item ? `/budget-plans/${planId}/items/${item.id}` : `/budget-plans/${planId}/items`, { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(f.annual_amount);
    if (!amount || Number(amount) <= 0) return setAmountErr("Geçerli bir yıllık tutar girin.");
    setAmountErr(undefined);
    m.mutate({
      name: f.name.trim(),
      expense_category_id: f.expense_category_id,
      charge_type_id: f.charge_type_id,
      allocation_rule_id: f.allocation_rule_id,
      annual_amount: amount,
      frequency: f.frequency,
      scope_kind: item?.scope_kind ?? "whole_site",
      scope_block_ids: item?.scope_block_ids ?? [],
      scope_unit_type_ids: item?.scope_unit_type_ids ?? [],
      scope_usage: item?.scope_usage ?? null,
      sort_order: item?.sort_order ?? 0,
    });
  }

  return (
    <form className="card__body stack" style={{ gap: "var(--s-4)", borderBottom: "1px solid var(--line)", background: "var(--bg-inset)" }} onSubmit={submit} noValidate>
      <div className="strong">{item ? `"${item.name}" kalemini düzenle` : "Yeni kalem"}</div>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Kalem adı" required error={fieldError(m.error, "name")}>
          {(p) => <input {...p} className="field__input" value={f.name} onChange={up("name")} />}
        </Field>
        <Field label="Yıllık tutar (₺)" required error={amountErr ?? fieldError(m.error, "annual_amount")}>
          {(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.annual_amount} onChange={up("annual_amount")} />}
        </Field>
        <Field label="Sıklık">
          {(p) => (
            <select {...p} className="field__input" value={f.frequency} onChange={up("frequency")}>
              {["monthly", "quarterly", "yearly", "one_time"].map((x) => <option key={x} value={x}>{frequency(x)}</option>)}
            </select>
          )}
        </Field>
        <Field label="Gider kategorisi">
          {(p) => <select {...p} className="field__input" value={f.expense_category_id} onChange={up("expense_category_id")}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        </Field>
        <Field label="Tahakkuk tipi" hint="Ödeyeni belirler: aidat oturana, demirbaş malike.">
          {(p) => <select {...p} className="field__input" value={f.charge_type_id} onChange={up("charge_type_id")}>{types.map((t) => <option key={t.id} value={t.id}>{t.name} — {payerRule(t.payer_rule)}</option>)}</select>}
        </Field>
        <Field label="Dağıtım kuralı">
          {(p) => <select {...p} className="field__input" value={f.allocation_rule_id} onChange={up("allocation_rule_id")}>{rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        </Field>
      </div>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.name.trim() || !f.annual_amount}>{item ? "Kaydet" : "Ekle"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
