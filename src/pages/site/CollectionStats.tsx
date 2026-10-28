import { BarChart3, CircleDollarSign, Percent, TrendingUp, Wallet } from "lucide-react";
import type { Schemas } from "../../api/types";
import { BarChart } from "../../components/charts";
import { Kpi } from "../../components/ui";
import { formatMoneyShort, formatPercent } from "../../lib/format";

/* Tahsilat ve Tahakkuk sayfalarının ortak özet parçaları. Kaynak: /reports/collections
   (dönem başına tahakkuk, tahsil edilen, kalan, oran). Sayı üretilmez; yalnız raporda olan gösterilir. */

export type Collections = Schemas["CollectionsOut"];
type Period = Collections["periods"][number];

const short = (v: number) => formatMoneyShort(v.toFixed(2));
const monthShort = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString("tr-TR", { month: "short" });

/** İçinde bulunulan ayın dönemi; yoksa tahakkuku olan son dönem. Önceki dönemle birlikte döner. */
export function currentPeriod(c: Collections): { cur?: Period; prev?: Period; index: number } {
  const now = new Date();
  let i = c.periods.findIndex((p) => p.year === now.getFullYear() && p.month === now.getMonth() + 1);
  if (i < 0) {
    for (let k = c.periods.length - 1; k >= 0; k--) {
      if (Number(c.periods[k]?.charged) > 0) { i = k; break; }
    }
  }
  return { cur: c.periods[i], prev: i > 0 ? c.periods[i - 1] : undefined, index: i };
}

function rateTone(rate: number): "ok" | "warn" | "danger" {
  return rate >= 90 ? "ok" : rate >= 70 ? "warn" : "danger";
}

/** Başlık bandına binen dört gösterge. Veri gelene kadar iskelet. */
export function CollectionKpis({ data }: { data: Collections | undefined }) {
  if (!data) {
    return (
      <div className="grid grid--kpi">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}
      </div>
    );
  }
  const { cur, prev } = currentPeriod(data);
  if (!cur) return null;
  const rate = Number(cur.rate);
  const diff = prev ? rate - Number(prev.rate) : 0;
  const outstanding = Number(cur.outstanding);
  return (
    <div className="grid grid--kpi rise">
      <Kpi
        label="Bu ay tahsil edilen"
        tone="ok"
        icon={<Wallet aria-hidden="true" />}
        value={short(Number(cur.collected))}
        note={`${short(Number(cur.charged))} tahakkuktan · ${cur.period}`}
      />
      <Kpi
        label="Tahsilat oranı"
        tone={rateTone(rate)}
        icon={<Percent aria-hidden="true" />}
        value={formatPercent(cur.rate)}
        delta={prev ? { tone: diff >= 0 ? "ok" : "danger", dir: diff > 0 ? "up" : diff < 0 ? "down" : "flat", label: `geçen ay ${formatPercent(prev.rate)}` } : undefined}
      />
      <Kpi
        label="Kalan alacak"
        tone={outstanding > 0 ? "danger" : "ok"}
        icon={<CircleDollarSign aria-hidden="true" />}
        value={short(outstanding)}
        note={outstanding > 0 ? `${cur.period} döneminden açık` : "dönem kapandı"}
      />
      <Kpi
        label={`${data.year} toplamı`}
        icon={<TrendingUp aria-hidden="true" />}
        value={short(Number(data.total_collected))}
        note={`genel oran ${formatPercent(data.rate)}`}
      />
    </div>
  );
}

/**
 * Aylık çubuk grafik. series="collected": tahsil edilen; series="charged": tahakkuk edilen.
 * İçinde bulunulan dönem koyu mavi vurgulanır; balonda oran yazar.
 */
export function CollectionChart({ data, series = "collected", title = "Aylık tahsilat" }: { data: Collections; series?: "collected" | "charged"; title?: string }) {
  const { index } = currentPeriod(data);
  const bars = data.periods.map((p) => ({
    label: monthShort(p.month),
    value: Number(series === "collected" ? p.collected : p.charged),
    sub: series === "collected" ? formatPercent(p.rate) : `${formatPercent(p.rate)} tahsil`,
  }));
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span>
        <span className="card__title">{title}</span>
        <span className="card__meta ml-auto">{data.year}</span>
      </div>
      <div className="card__body fin-chart">
        <BarChart label={title} data={bars} format={short} highlight={index >= 0 ? index : undefined} />
      </div>
    </div>
  );
}
