import Decimal from "decimal.js";
import { BarChart3 } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { ExcelButton } from "../../components/ExcelButton";
import { Badge, ErrorState, Kpi, Loading, Money, PageHead } from "../../components/ui";
import { formatMoney, formatMoneyShort, formatPercent } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { P, useSite } from "../../site/SiteContext";

type Report = Schemas["IncomeExpenseOut"];
type Collections = Schemas["CollectionsOut"];

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Çubuk genişliği yüzdesi. Görsel oran için; tutarın kendisi metin olarak yanında yazılı. */
function pct(v: string, max: Decimal): string {
  return max.isZero() ? "0" : new Decimal(v).div(max).mul(100).toFixed(1);
}

export function ReportsPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ year: String(new Date().getFullYear()) });
  const r = useSiteGet<Report>("/reports/income-expense", { year: s.year });
  const c = useSiteGet<Collections>("/reports/collections", { year: s.year }, { enabled: can(P.financeRead) });

  return (
    <div className="stack">
      <PageHead
        title="Gelir–gider raporu"
        subtitle="Gelir: tahsil edilen aidat. Gider: gider defterindeki kayıtlar. Ters kayıtlar düşülmüş hâlidir."
        actions={
          <>
            {r.data && r.data.years.length > 0 && (
              <select aria-label="Yıl" className="field__input" style={{ width: "auto" }} value={s.year} onChange={(e) => set({ year: e.target.value })}>
                {r.data.years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <ExcelButton path={`/sites/${site.slug}/reports/income-expense/export.xlsx`} query={{ year: s.year }} fileName={`gelir-gider-${s.year}.xlsx`} />
          </>
        }
      />

      {r.isPending ? (
        <Loading />
      ) : r.isError ? (
        <ErrorState error={r.error} onRetry={() => r.refetch()} />
      ) : (
        <ReportBody d={r.data} />
      )}

      {c.data && (
        <div className="card">
          <div className="card__head"><span className="card__title">Aidat tahsilat özeti — {c.data.year}</span><span className="card__meta ml-auto">genel oran {formatPercent(c.data.rate)}</span></div>
          <div className="card__body card__body--flush">
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Dönem bazında tahakkuk ve tahsilat</caption>
                <thead><tr><th scope="col">Dönem</th><th scope="col" className="right">Tahakkuk</th><th scope="col" className="right">Tahsil edilen</th><th scope="col" className="right">Kalan</th><th scope="col" className="right">Oran</th></tr></thead>
                <tbody>
                  {c.data.periods.map((p) => (
                    <tr key={p.period}>
                      <td className="cell-main">{MONTHS[p.month - 1]} {p.year}</td>
                      <td className="right"><Money value={p.charged} /></td>
                      <td className="right"><Money value={p.collected} /></td>
                      <td className="right"><Money value={p.outstanding} tone="balance" /></td>
                      <td className="right"><Badge tone={Number(p.rate) >= 90 ? "ok" : Number(p.rate) >= 70 ? "warn" : "danger"}>{formatPercent(p.rate)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>Toplam</td><td className="right"><Money value={c.data.total_charged} /></td><td className="right"><Money value={c.data.total_collected} /></td><td /><td className="right">{formatPercent(c.data.rate)}</td></tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportBody({ d }: { d: Report }) {
  const max = d.months.reduce((m, x) => Decimal.max(m, x.income, x.expense), new Decimal(0));
  const diffPositive = !new Decimal(d.difference).isNegative();

  return (
    <>
      <div className="grid grid--kpi">
        <Kpi label="Gelir" tone="ok" value={formatMoneyShort(d.total_income)} note={formatMoney(d.total_income)} />
        <Kpi label="Gider" tone="danger" value={formatMoneyShort(d.total_expense)} note={formatMoney(d.total_expense)} />
        <Kpi label="Fark" tone={diffPositive ? "ok" : "danger"} value={formatMoneyShort(d.difference)} note={diffPositive ? "gelir fazlası" : "gider fazlası"} />
        <Kpi label="Kasa ve banka" tone="accent" value={formatMoneyShort(d.cash_balance)} note="bugünkü toplam" />
      </div>

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head">
            <span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span>
            <span className="card__title">Ay ay</span>
          </div>
          <div className="card__body">
            <div className="row" style={{ gap: "var(--s-4)", marginBottom: "var(--s-4)" }}>
              <span className="row small" style={{ gap: 6, alignItems: "center" }}><span className="legend-dot" style={{ background: "var(--ok-solid)" }} /> Gelir</span>
              <span className="row small" style={{ gap: 6, alignItems: "center" }}><span className="legend-dot" style={{ background: "var(--danger-solid)" }} /> Gider</span>
            </div>
            <div className="stack" style={{ gap: "var(--s-3)" }}>
              {d.months.map((m) => {
                const empty = new Decimal(m.income).isZero() && new Decimal(m.expense).isZero();
                return (
                  <div key={m.month} style={empty ? { opacity: 0.45 } : undefined}>
                    <div className="row row--between small" style={{ marginBottom: 4 }}>
                      <span>{MONTHS[m.month - 1]}</span>
                      <span className="num">
                        <span style={{ color: "var(--ok-fg)" }}>{formatMoney(m.income)}</span> <span className="muted">/</span>{" "}
                        <span style={{ color: "var(--danger-fg)" }}>{formatMoney(m.expense)}</span>
                      </span>
                    </div>
                    <div className="bars" aria-hidden="true">
                      <div className="bars__row"><div className="bars__fill" style={{ width: `${pct(m.income, max)}%`, background: "var(--ok-solid)" }} /></div>
                      <div className="bars__row"><div className="bars__fill" style={{ width: `${pct(m.expense, max)}%`, background: "var(--danger-solid)" }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__head"><span className="card__title">Kategori dağılımı</span></div>
            <div className="card__body card__body--flush">
              <div className="table-wrap">
                <table className="data">
                  <caption className="visually-hidden">Gider kategorileri</caption>
                  <thead><tr><th scope="col">Kategori</th><th scope="col" className="right">Kayıt</th><th scope="col" className="right">Pay</th><th scope="col" className="right">Tutar</th></tr></thead>
                  <tbody>
                    {d.categories.length === 0 && <tr><td colSpan={4} className="small muted">Bu yıl gider yok.</td></tr>}
                    {d.categories.map((c) => (
                      <tr key={c.category_id}>
                        <td className="cell-main">{c.name}</td>
                        <td className="right num">{c.count}</td>
                        <td className="right num small">{formatPercent(c.share)}</td>
                        <td className="right"><Money value={c.amount} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {d.budget_plan && d.budget.length > 0 && (
            <div className="card">
              <div className="card__head"><span className="card__title">Bütçe karşılaştırması</span><span className="card__meta ml-auto">{d.budget_plan.name}</span></div>
              <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
                {d.budget.map((b) => {
                  const usage = Number(b.usage);
                  return (
                    <div key={b.category_id}>
                      <div className="row row--between small" style={{ marginBottom: 4 }}>
                        <span className="strong">{b.name}</span>
                        <span className="num">{formatMoney(b.actual)} / {formatMoney(b.budgeted)} <span className="muted">{formatPercent(b.usage)}</span></span>
                      </div>
                      <div className="meter" role="img" aria-label={`${b.name} bütçesinin yüzde ${formatPercent(b.usage)} kadarı kullanıldı`}>
                        <div className={`meter__fill ${b.is_over ? "meter__fill--danger" : usage > 80 ? "meter__fill--warn" : "meter__fill--ok"}`} style={{ width: `${Math.min(100, usage)}%` }} />
                      </div>
                      {b.is_over && <div className="small" style={{ color: "var(--danger-fg)", marginTop: 4 }}>Bütçe {formatMoney(new Decimal(b.difference).abs().toFixed(2))} aşıldı</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
