import { useState } from "react";
import Decimal from "decimal.js";
import { BarChart3, Landmark, PieChart, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { BarChart, Donut } from "../../components/charts";
import { ExcelButton } from "../../components/ExcelButton";
import { Badge, ErrorState, Kpi, Loading, Money, PageHead, Segmented } from "../../components/ui";
import { formatMoney, formatMoneyShort, formatPercent } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { P, useSite } from "../../site/SiteContext";

type Report = Schemas["IncomeExpenseOut"];
type Collections = Schemas["CollectionsOut"];
type Series = "income" | "expense";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** Para metni → grafik için sayı; grafik etiketi yine formatMoneyShort ile yazılır. */
const num = (v: string) => Number(new Decimal(v).toFixed(2));
const short = (v: number) => formatMoneyShort(v.toFixed(2));

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

      {c.data && <CollectionsCard c={c.data} />}
    </div>
  );
}

function ReportBody({ d }: { d: Report }) {
  const diffPositive = !new Decimal(d.difference).isNegative();
  const [series, setSeries] = useState<Series>("income");
  const bars = d.months.map((m) => ({
    label: MONTHS_SHORT[m.month - 1] ?? String(m.month),
    value: num(series === "income" ? m.income : m.expense),
    sub: series === "income" ? `gider ${formatMoneyShort(m.expense)}` : `gelir ${formatMoneyShort(m.income)}`,
  }));
  const hasAny = d.months.some((m) => !new Decimal(m.income).isZero() || !new Decimal(m.expense).isZero());

  return (
    <>
      <div className="grid grid--kpi">
        <Kpi label="Gelir" tone="ok" icon={<TrendingUp aria-hidden="true" />} value={formatMoneyShort(d.total_income)} note={formatMoney(d.total_income)} />
        <Kpi label="Gider" tone="danger" icon={<TrendingDown aria-hidden="true" />} value={formatMoneyShort(d.total_expense)} note={formatMoney(d.total_expense)} />
        <Kpi label="Fark" tone={diffPositive ? "ok" : "danger"} icon={<Scale aria-hidden="true" />} value={formatMoneyShort(d.difference)} note={diffPositive ? "gelir fazlası" : "gider fazlası"} />
        <Kpi label="Kasa ve banka" tone="accent" icon={<Landmark aria-hidden="true" />} value={formatMoneyShort(d.cash_balance)} note="bugünkü toplam" />
      </div>

      <div className="grid grid--main">
        <div className="card">
          <div className="card__head">
            <span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span>
            <span className="card__title">Ay ay</span>
            <div className="ml-auto">
              <Segmented
                label="Seri"
                value={series}
                onChange={setSeries}
                options={[
                  { value: "income", label: "Gelir" },
                  { value: "expense", label: "Gider" },
                ]}
              />
            </div>
          </div>
          <div className="card__body">
            {hasAny ? (
              <div className="fin-chart">
                <BarChart label={`Aylık ${series === "income" ? "gelir" : "gider"}`} data={bars} format={short} />
              </div>
            ) : (
              <p className="small muted mb-0">Bu yıl kayıt yok.</p>
            )}
            <div className="table-wrap fin-months">
              <table className="data">
                <caption className="visually-hidden">Ay bazında gelir ve gider</caption>
                <thead><tr><th scope="col">Ay</th><th scope="col" className="right">Gelir</th><th scope="col" className="right">Gider</th><th scope="col" className="right">Fark</th></tr></thead>
                <tbody>
                  {d.months.map((m) => {
                    const empty = new Decimal(m.income).isZero() && new Decimal(m.expense).isZero();
                    const diff = new Decimal(m.income).minus(m.expense);
                    return (
                      <tr key={m.month} style={empty ? { opacity: 0.5 } : undefined}>
                        <td className="cell-main">{MONTHS[m.month - 1]}</td>
                        <td className="right"><Money value={m.income} /></td>
                        <td className="right"><Money value={m.expense} /></td>
                        <td className="right"><span className={`num ${diff.isNegative() ? "amount-pos" : diff.isZero() ? "amount-zero" : "amount-neg"}`}>{formatMoney(diff.toFixed(2))}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__head">
              <span className="card__icon card__icon--warn"><PieChart aria-hidden="true" /></span>
              <span className="card__title">Kategori dağılımı</span>
            </div>
            <div className="card__body fin-pie">
              {d.categories.length === 0 ? (
                <p className="small muted mb-0">Bu yıl gider yok.</p>
              ) : (
                <>
                  <Donut
                    label="Gider kategorileri"
                    centerSub="toplam gider"
                    center={formatMoneyShort(d.total_expense)}
                    format={short}
                    segments={d.categories.map((x) => ({ label: x.name, value: num(x.amount) }))}
                  />
                  <div className="table-wrap fin-months">
                    <table className="data">
                      <caption className="visually-hidden">Gider kategorileri</caption>
                      <thead><tr><th scope="col">Kategori</th><th scope="col" className="right">Kayıt</th><th scope="col" className="right">Pay</th><th scope="col" className="right">Tutar</th></tr></thead>
                      <tbody>
                        {d.categories.map((x) => (
                          <tr key={x.category_id}>
                            <td className="cell-main">{x.name}</td>
                            <td className="right num">{x.count}</td>
                            <td className="right num small">{formatPercent(x.share)}</td>
                            <td className="right"><Money value={x.amount} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
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
                      {b.is_over && <div className="small amount-pos" style={{ marginTop: 4 }}>Bütçe {formatMoney(new Decimal(b.difference).abs().toFixed(2))} aşıldı</div>}
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

/** Aidat tahsilat özeti: halka (tahsil edilen / kalan) + dönem tablosu */
function CollectionsCard({ c }: { c: Collections }) {
  const outstanding = Decimal.max(new Decimal(c.total_charged).minus(c.total_collected), 0);
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--ok"><TrendingUp aria-hidden="true" /></span>
        <span className="card__title">Aidat tahsilat özeti — {c.year}</span>
        <span className="card__meta ml-auto">genel oran {formatPercent(c.rate)}</span>
      </div>
      <div className="card__body fin-aging">
        <Donut
          label="Yıllık tahsilat"
          center={formatPercent(c.rate)}
          centerSub="tahsil edildi"
          format={short}
          segments={[
            { label: "Tahsil edilen", value: num(c.total_collected), tone: "ok" },
            { label: "Kalan", value: Number(outstanding.toFixed(2)), color: "var(--chart-3)" },
          ]}
        />
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">Dönem bazında tahakkuk ve tahsilat</caption>
            <thead><tr><th scope="col">Dönem</th><th scope="col" className="right">Tahakkuk</th><th scope="col" className="right">Tahsil edilen</th><th scope="col" className="right">Kalan</th><th scope="col" className="right">Oran</th></tr></thead>
            <tbody>
              {c.periods.map((p) => (
                <tr key={p.period}>
                  <td className="cell-main">{MONTHS[p.month - 1]} {p.year}</td>
                  <td className="right"><Money value={p.charged} /></td>
                  <td className="right"><Money value={p.collected} /></td>
                  <td className="right"><Money value={p.outstanding} tone="balance" /></td>
                  <td className="right"><Badge tone={Number(p.rate) >= 90 ? "ok" : Number(p.rate) >= 70 ? "warn" : "danger"}>{formatPercent(p.rate)}</Badge></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Toplam</td><td className="right"><Money value={c.total_charged} /></td><td className="right"><Money value={c.total_collected} /></td><td /><td className="right">{formatPercent(c.rate)}</td></tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
