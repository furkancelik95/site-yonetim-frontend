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
const monthLong = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString("tr-TR", { month: "long" });
const cap = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);

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
  // Bu ay henüz tahakkuk yoksa son tahakkuk edilen ay gösterilir; etiket bunu açıkça söyler
  // (Bugün ekranı takvim ayını kullanır, iki ekran çelişkili görünmesin).
  const now = new Date();
  const isNow = cur.year === now.getFullYear() && cur.month === now.getMonth() + 1;
  return (
    <div className="grid grid--kpi rise">
      <Kpi
        label={isNow ? "Bu ay tahsil edilen" : `${cap(monthLong(cur.month))} tahsilatı`}
        tone="ok"
        icon={<Wallet aria-hidden="true" />}
        value={short(Number(cur.collected))}
        note={`${short(Number(cur.charged))} tahakkuktan · ${isNow ? cur.period : "son tahakkuk edilen ay"}`}
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
  // Başlıkta yalnız yıl değil, verisi olan ay aralığı ("Mayıs–Ekim 2026")
  const filled = data.periods.filter((p) => Number(p.charged) > 0 || Number(p.collected) > 0);
  const first = filled[0], last = filled[filled.length - 1];
  const range = !first || !last ? String(data.year)
    : first.month === last.month ? `${cap(monthLong(first.month))} ${data.year}`
    : `${cap(monthLong(first.month))}–${cap(monthLong(last.month))} ${data.year}`;
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
        <span className="card__meta ml-auto">{range}</span>
      </div>
      <div className="card__body fin-chart">
        <BarChart label={title} data={bars} format={short} highlight={index >= 0 ? index : undefined} />
      </div>
    </div>
  );
}
