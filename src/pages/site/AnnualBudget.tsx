import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Plus, Wallet } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, formatMoney, formatMoneyShort, formatPercent, parseMoneyInput } from "../../lib/format";
import { budgetLevel, budgetLevelTone, versionStatus, versionTone } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Budget = Schemas["AnnualBudgetOut"];
type Detail = Schemas["AnnualBudgetDetail"];
type Actuals = Schemas["BudgetActualsOut"];
type ActualRow = Schemas["BudgetActualRowOut"];
type Category = Schemas["ExpenseCategoryOut"];
type Plan = Schemas["BudgetPlanOut"];
type CreateBody = Schemas["BudgetCreateIn"];
type UpdateBody = Schemas["BudgetUpdateIn"];

export const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_LONG = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

type State = { yil: string; butce: string; ay: string };

/**
 * Yıllık bütçe ve gerçekleşme (FIN-17): gider kategorisi × ay bütçe, sürümlü (revizyon), "Bütçe" onay kuralına bağlı.
 * Gerçekleşme tablosu seçilen aya kadar kümülatif; seviye backend'den (eşik %90 sarı, %100 kırmızı).
 * İşletme projesi (KMK m.37, aidat dağıtımı) ayrı belgedir; bütçe ondan önerilerek açılabilir.
 */
export function AnnualBudget({ s, set, canManage }: { s: State; set: (x: Partial<State>) => void; canManage: boolean }) {
  const thisYear = new Date().getFullYear();
  const year = Number(s.yil) || thisYear;
  const list = useSiteGet<Page<Budget>>("/budgets", { fiscal_year: year, page_size: 50 });
  const [creating, setCreating] = useState(false);
  const items = list.data?.items ?? [];
  const selected = s.butce && items.some((b) => b.id === s.butce) ? s.butce : items.find((b) => b.status === "active")?.id ?? items[0]?.id ?? "";

  return (
    <div className="stack">
      <div className="filters">
        <div className="field">
          <label className="field__label" htmlFor="b-year">Mali yıl</label>
          <select id="b-year" className="field__input" value={year} onChange={(e) => set({ yil: e.target.value, butce: "" })}>
            {[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {items.length > 1 && (
          <div className="field">
            <label className="field__label" htmlFor="b-ver">Sürüm</label>
            <select id="b-ver" className="field__input" value={selected} onChange={(e) => set({ butce: e.target.value })}>
              {items.map((b) => <option key={b.id} value={b.id}>{b.name} — sürüm {b.version} ({versionStatus(b.status)})</option>)}
            </select>
          </div>
        )}
        {canManage && (
          <button className="btn" type="button" style={{ alignSelf: "flex-end" }} aria-expanded={creating} onClick={() => setCreating((v) => !v)}><Plus aria-hidden="true" /> Yeni bütçe</button>
        )}
      </div>

      {creating && <NewBudgetForm year={year} onDone={(id) => { setCreating(false); if (id) set({ butce: id }); }} />}

      {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : items.length === 0 ? (
        <div className="card"><Empty title={`${year} için bütçe yok`} icon={<Wallet aria-hidden="true" />}>{canManage ? "Yeni bütçe açın; isterseniz işletme projesinden önerilsin." : "Bütçeyi site yöneticisi ve muhasebe hazırlar."}</Empty></div>
      ) : (
        selected && <BudgetView key={selected} id={selected} canManage={canManage} month={s.ay} setMonth={(ay) => set({ ay })} onRevised={(id) => set({ butce: id })} />
      )}
    </div>
  );
}

function NewBudgetForm({ year, onDone }: { year: number; onDone: (id?: string) => void }) {
  const plans = useSiteGet<Page<Plan>>("/budget-plans", { page_size: 50 });
  const [f, setF] = useState({ fiscal_year: String(year), name: `${year} Bütçesi`, income_target: "", budget_plan_id: "" });
  const [err, setErr] = useState<string>();
  const m = useSiteMutation<CreateBody, Detail>("POST", "/budgets", { onSuccess: (d) => onDone(d?.id) });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="card"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const target = f.income_target.trim() ? parseMoneyInput(f.income_target) : null;
        if (f.income_target.trim() && !target) return setErr("Geçerli bir tutar girin.");
        setErr(undefined);
        m.mutate({ fiscal_year: Number(f.fiscal_year), name: f.name.trim(), income_target: target, budget_plan_id: f.budget_plan_id || null });
      }}
    >
      <div className="card__head"><span className="card__title">Yeni bütçe (taslak)</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Mali yıl" required error={fieldError(m.error, "fiscal_year")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.fiscal_year} onChange={up("fiscal_year")} />}</Field>
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.name} onChange={up("name")} />}</Field>
          <Field label="Yıllık gelir hedefi (₺)" hint="İsteğe bağlı; aidat kuralı deneme hesabında karşılaştırılır" error={err ?? fieldError(m.error, "income_target")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.income_target} onChange={up("income_target")} />}</Field>
          <Field label="İşletme projesinden öner" hint="Kalemler kategori × aya dağıtılarak önerilir" error={fieldError(m.error, "budget_plan_id")}>
            {(p) => (
              <select {...p} className="field__input" value={f.budget_plan_id} onChange={up("budget_plan_id")}>
                <option value="">Boş başla</option>
                {(plans.data?.items ?? []).map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              </select>
            )}
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

function BudgetView({ id, canManage, month, setMonth, onRevised }: { id: string; canManage: boolean; month: string; setMonth: (m: string) => void; onRevised: (id: string) => void }) {
  const { site } = useSite();
  const q = useSiteGet<Detail>(`/budgets/${id}`);
  const submit = useSiteMutation<Record<string, never>, Detail>("POST", `/budgets/${id}/submit`);
  const revise = useSiteMutation<Record<string, never>, Detail>("POST", `/budgets/${id}/revise`, { onSuccess: (d) => d && onRevised(d.id) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data;
  const editable = canManage && b.status === "draft";

  return (
    <>
      <div className="grid grid--kpi">
        <Kpi label="Durum" small value={<Badge tone={versionTone(b.status)}>{versionStatus(b.status)}</Badge>} note={`sürüm ${b.version}${b.activated_at ? ` · ${formatDateTime(b.activated_at)}` : ""}`} />
        <Kpi label="Yıllık gider bütçesi" tone="accent" value={formatMoneyShort(b.total)} note={formatMoney(b.total)} />
        <Kpi label="Gelir hedefi" small value={b.income_target ? formatMoney(b.income_target) : "—"} />
        <Kpi label="Kategori" value={b.lines.length} />
      </div>
      {b.status === "approval_pending" && (
        <Alert tone="warn" title="Bütçe onay bekliyor">
          "Bütçe" onay kuralına gönderildi. {b.approval_request_id && <Link to={`/s/${site.slug}/onaylar/${b.approval_request_id}`}>Onay talebini aç</Link>}
        </Alert>
      )}
      {editable ? <BudgetEditor b={b} /> : <BudgetGrid b={b} />}
      {canManage && (b.status === "draft" || b.status === "active" || b.status === "rejected") && (
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          {b.status === "draft" && (
            <ConfirmButton
              className="btn btn--primary"
              title={`${b.fiscal_year} bütçesini gönder`}
              confirmLabel="Gönder"
              disabled={b.lines.length === 0}
              body={`Toplam ${formatMoney(b.total)}. "Bütçe" onay kuralı varsa onaya gider; yoksa hemen yürürlüğe girer ve önceki sürümün yerini alır. Kaydedilmemiş değişiklikleri önce kaydedin.`}
              onConfirm={() => submit.mutateAsync({})}
            >
              Onaya gönder
            </ConfirmButton>
          )}
          {(b.status === "active" || b.status === "rejected") && (
            <ConfirmButton className="btn" title="Revizyon aç" confirmLabel="Revizyon aç" body="Bu sürümün kopyası yeni taslak sürüm olarak açılır; yürürlükteki sürüm, yenisi yürürlüğe girene kadar geçerli kalır." onConfirm={() => revise.mutateAsync({})}>
              Revizyon (yeni sürüm)
            </ConfirmButton>
          )}
        </div>
      )}
      {b.status !== "draft" && <ActualsCard budgetId={b.id} month={month} setMonth={setMonth} />}
    </>
  );
}

/** Salt okunur kategori × ay tablosu. */
function BudgetGrid({ b }: { b: Detail }) {
  if (b.lines.length === 0) return <div className="card"><Empty title="Bütçede kategori yok" /></div>;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">{b.name}</span><span className="card__meta ml-auto">kategori × ay</span></div>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">Kategori ve ay bazında bütçe</caption>
            <thead><tr><th scope="col">Kategori</th>{MONTHS_SHORT.map((m) => <th key={m} scope="col" className="right">{m}</th>)}<th scope="col" className="right">Yıllık</th></tr></thead>
            <tbody>
              {b.lines.map((l) => (
                <tr key={l.expense_category_id}>
                  <td className="cell-main nowrap">{l.category_name}</td>
                  {l.months.map((v, i) => <td key={i} className="right small nowrap">{formatMoney(v, false)}</td>)}
                  <td className="right nowrap"><Money value={l.total} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Toplam</td>{b.month_totals.map((v, i) => <td key={i} className="right small nowrap">{formatMoney(v, false)}</td>)}<td className="right nowrap"><Money value={b.total} /></td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Taslakta düzenlenebilir ızgara. Toplamlar kaydedince backend'den gelir (burada para hesabı yapılmaz). */
function BudgetEditor({ b }: { b: Detail }) {
  const cats = useSiteGet<Category[]>("/expense-categories");
  const initial = () => Object.fromEntries(b.lines.map((l) => [l.expense_category_id, l.months.map((v) => formatMoney(v, false))]));
  const [rows, setRows] = useState<Record<string, string[]>>(initial);
  const [name, setName] = useState(b.name);
  const [target, setTarget] = useState(b.income_target ? formatMoney(b.income_target, false) : "");
  const [adding, setAdding] = useState("");
  const [err, setErr] = useState<string>();
  useEffect(() => { setRows(initial()); setName(b.name); setTarget(b.income_target ? formatMoney(b.income_target, false) : ""); }, [b]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useSiteMutation<UpdateBody, Detail>("PUT", `/budgets/${b.id}`);
  const catName = (id: string) => b.lines.find((l) => l.expense_category_id === id)?.category_name ?? cats.data?.find((c) => c.id === id)?.name ?? "—";
  const unused = (cats.data ?? []).filter((c) => !(c.id in rows));

  function save() {
    const lines: UpdateBody["lines"] = [];
    for (const [cid, months] of Object.entries(rows)) {
      const parsed = months.map((v) => (v.trim() === "" ? "0.00" : parseMoneyInput(v)));
      if (parsed.some((v) => v == null)) return setErr(`${catName(cid)}: geçerli tutar girin.`);
      lines.push({ expense_category_id: cid, months: parsed as string[] });
    }
    const t = target.trim() ? parseMoneyInput(target) : null;
    if (target.trim() && !t) return setErr("Gelir hedefi geçerli bir tutar olmalı.");
    setErr(undefined);
    m.mutate({ name: name.trim() || b.name, income_target: t, lines });
  }

  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Taslak — kategori × ay</span><span className="card__meta ml-auto">toplamlar kaydedince güncellenir</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {err && <Alert tone="danger">{err}</Alert>}
        <div className="grid grid--kpi">
          <Field label="Ad" error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Yıllık gelir hedefi (₺)" error={fieldError(m.error, "income_target")}>{(p) => <input {...p} className="field__input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />}</Field>
        </div>
      </div>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">Düzenlenebilir bütçe: kategori ve ay</caption>
            <thead><tr><th scope="col">Kategori</th>{MONTHS_SHORT.map((mm) => <th key={mm} scope="col" className="right">{mm}</th>)}<th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>
              {Object.entries(rows).map(([cid, months]) => (
                <tr key={cid}>
                  <td className="cell-main nowrap">{catName(cid)}</td>
                  {months.map((v, i) => (
                    <td key={i} style={{ padding: 2 }}>
                      <input
                        className="field__input num"
                        style={{ width: "6.5rem", minHeight: 44 }}
                        inputMode="decimal"
                        aria-label={`${catName(cid)} — ${MONTHS_LONG[i]}`}
                        value={v}
                        onChange={(e) => setRows((x) => ({ ...x, [cid]: x[cid]!.map((y, j) => (j === i ? e.target.value : y)) }))}
                      />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="btn btn--ghost btn--sm" aria-label={`${catName(cid)} satırını kaldır`} onClick={() => setRows((x) => { const n = { ...x }; delete n[cid]; return n; })}>Kaldır</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Kayıtlı toplam</td>{b.month_totals.map((v, i) => <td key={i} className="right small nowrap">{formatMoney(v, false)}</td>)}<td className="right nowrap"><Money value={b.total} /></td></tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
        {unused.length > 0 && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="b-add-cat">Kategori ekle</label>
              <select id="b-add-cat" className="field__input" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Seçin</option>
                {unused.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="button" className="btn" disabled={!adding} onClick={() => { setRows((x) => ({ ...x, [adding]: Array(12).fill("") })); setAdding(""); }}><Plus aria-hidden="true" /> Ekle</button>
          </>
        )}
        <button type="button" className="btn btn--primary ml-auto" disabled={m.isPending} aria-busy={m.isPending || undefined} onClick={save}>
          {m.isPending && <span className="spinner" aria-hidden="true" />}Kaydet
        </button>
      </div>
    </div>
  );
}

const pctCell = (v: string | null) => (v == null ? "—" : formatPercent(v));

function ActualsCard({ budgetId, month, setMonth }: { budgetId: string; month: string; setMonth: (m: string) => void }) {
  const q = useSiteGet<Actuals>(`/budgets/${budgetId}/actuals`, { month: month || undefined });
  const shownMonth = month || (q.data ? String(q.data.month) : "");
  const row = (r: ActualRow, total = false) => (
    <tr key={total ? "total" : r.expense_category_id}>
      <td className={total ? "strong" : "cell-main"}>{total ? "Toplam" : r.category_name}</td>
      <td className="right"><Money value={r.month_budget} /></td>
      <td className="right"><Money value={r.month_actual} /></td>
      <td className="right"><Money value={r.cumulative_budget} /></td>
      <td className="right"><Money value={r.cumulative_actual} /></td>
      <td className="right hide-sm"><Money value={r.annual_budget} /></td>
      <td className="right"><Money value={r.remaining} tone="balance" /></td>
      <td className="right"><Badge tone={budgetLevelTone(r.level)}>{pctCell(r.usage_percent)}</Badge><span className="visually-hidden"> {budgetLevel(r.level)}</span></td>
      <td className="right num hide-sm">{r.deviation_percent == null ? "—" : `${Number(r.deviation_percent) > 0 ? "+" : ""}${pctCell(r.deviation_percent)}`}</td>
    </tr>
  );
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Bütçe ve gerçekleşme</span>
        <span className="ml-auto field" style={{ margin: 0 }}>
          <label className="visually-hidden" htmlFor="act-month">Ay</label>
          <select id="act-month" className="field__input" value={shownMonth} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS_LONG.map((mm, i) => <option key={mm} value={String(i + 1)}>{mm} sonuna kadar</option>)}
          </select>
        </span>
      </div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.rows.length === 0 ? <Empty title="Gerçekleşme verisi yok" /> : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Kategori bazında bütçe ve gerçekleşen gider</caption>
              <thead>
                <tr>
                  <th scope="col">Kategori</th><th scope="col" className="right">Ay bütçe</th><th scope="col" className="right">Ay gerçek</th>
                  <th scope="col" className="right">Kümülatif bütçe</th><th scope="col" className="right">Kümülatif gerçek</th><th scope="col" className="right hide-sm">Yıllık</th>
                  <th scope="col" className="right">Kalan</th><th scope="col" className="right">Kullanım</th><th scope="col" className="right hide-sm">Sapma</th>
                </tr>
              </thead>
              <tbody>{q.data.rows.map((r) => row(r))}</tbody>
              {q.data.totals && <tfoot>{row(q.data.totals, true)}</tfoot>}
            </table>
          </div>
        )}
      </div>
      {q.data && <div className="card__foot small muted">Kullanım yıllık bütçeye göre; %{q.data.warn_percent} ve üstü sarı, %100 ve üstü kırmızı. Eşik Finans ayarlarındaki "Bütçe uyarı eşiği"dir.</div>}
    </div>
  );
}
