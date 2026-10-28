import type { ReactNode } from "react";

/* Kütüphanesiz grafikler. İki değerli 12 satırlık karşılaştırma için 200 KB JavaScript
   taşımak orantısız (docs/mimari-karar). Renk tek başına anlam taşımaz: her dilim ve
   çubuğun yanında etiket + değer yazılır; SVG'nin aria-label'ı özeti okur. */

type Tone = "ok" | "warn" | "danger" | "info" | "accent" | "muted";
const toneColor: Record<Tone, string> = {
  ok: "var(--ok-solid)",
  warn: "var(--warn-solid)",
  danger: "var(--danger-solid)",
  info: "var(--info-solid)",
  accent: "var(--accent)",
  muted: "var(--n-400)",
};
const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export type DonutSegment = { label: string; value: number; tone?: Tone; color?: string };

/**
 * Halka grafik: dilimler pastel mavi paletten (ya da tone/color ile), ortada toplam.
 * Yanında dilim başına nokta + etiket + yüzde + sayı rozeti.
 */
export function Donut({
  segments,
  label,
  center,
  centerSub,
  format = (v) => String(v),
}: {
  segments: DonutSegment[];
  /** Ekran okuyucu için grafik adı ("Talep durumları") */
  label: string;
  center?: ReactNode;
  centerSub?: string;
  format?: (v: number) => string;
}) {
  const vals = segments.map((s) => Math.max(0, s.value));
  const total = vals.reduce((a, b) => a + b, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  const gap = vals.filter((v) => v > 0).length > 1 ? 2.5 : 0;
  let offset = 0;
  const colorOf = (s: DonutSegment, i: number) => s.color ?? (s.tone ? toneColor[s.tone] : (palette[i % palette.length] ?? "var(--chart-6)"));
  const summary = segments.map((s) => `${s.label} ${format(s.value)}`).join(", ");
  // Uzun merkez yazısı ("2,3 M ₺") halkanın iç çapına sığsın diye küçülür
  const centerText = center ?? format(total);
  const centerLen = typeof centerText === "string" || typeof centerText === "number" ? String(centerText).length : 0;
  const centerSize = centerLen > 7 ? 15 : centerLen > 5 ? 19 : undefined;

  return (
    <div className="donut">
      <svg className="donut__svg" viewBox="0 0 140 140" role="img" aria-label={`${label}: ${summary}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="18" />
        {total > 0 &&
          segments.map((s, i) => {
            const len = ((vals[i] ?? 0) / total) * c;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={colorOf(s, i)}
                strokeWidth="18"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="70" y={centerSub ? 68 : 78} className="donut__center" style={centerSize ? { fontSize: centerSize } : undefined}>
          {centerText}
        </text>
        {centerSub && (
          <text x="70" y="88" className="donut__center-sub">
            {centerSub}
          </text>
        )}
      </svg>
      <ul className="legend">
        {segments.map((s, i) => (
          <li key={i}>
            <span className="legend__dot" style={{ background: colorOf(s, i) }} aria-hidden="true" />
            <span className="legend__label">{s.label}</span>
            <span className="legend__pct">{total > 0 ? `%${Math.round(((vals[i] ?? 0) / total) * 100)}` : "—"}</span>
            <span className="legend__count">{format(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Eksen tavanı: 1 / 2 / 2,5 / 5 × 10ⁿ basamaklarından en yakın üst değer */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

export type Bar = { label: string; value: number; sub?: string };

/**
 * Dikey çubuk grafik: pastel çubuklar, en yüksek (ya da `highlight`) çubuk koyu mavi ve
 * değeri balonda sürekli görünür; diğerleri üstüne gelince/odaklanınca gösterir.
 */
export function BarChart({
  data,
  label,
  format = (v) => String(v),
  highlight,
  compact,
}: {
  data: Bar[];
  label: string;
  format?: (v: number) => string;
  /** Vurgulanacak çubuğun sırası; verilmezse en yüksek değer */
  highlight?: number;
  compact?: boolean;
}) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const hi = highlight ?? data.reduce((bi, d, i, a) => (d.value > (a[bi]?.value ?? -Infinity) ? i : bi), 0);
  const ticks = [0.5, 1];
  const summary = data.map((d) => `${d.label} ${format(d.value)}`).join(", ");
  return (
    <div className={`barchart${compact ? " barchart--compact" : ""}`} role="img" aria-label={`${label}: ${summary}`}>
      <div className="barchart__plot">
        {ticks.map((t) => (
          <div key={t} className="barchart__gridline" style={{ bottom: `calc(${t} * (100% - 28px))` }} aria-hidden="true">
            <span>{format(t * max)}</span>
          </div>
        ))}
        {data.map((d, i) => {
          const h = d.value <= 0 ? 2 : Math.max(4, (d.value / max) * 100);
          const isHi = i === hi && d.value > 0;
          return (
            <div key={i} className={`barchart__col${isHi ? " barchart__col--hi" : ""}`} tabIndex={0} aria-hidden="true">
              <span className="barchart__tip">
                {format(d.value)}
                {d.sub ? ` · ${d.sub}` : ""}
              </span>
              <div className={`barchart__bar${isHi ? " barchart__bar--hi" : ""}${d.value <= 0 ? " barchart__bar--muted" : ""}`} style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="barchart__x" aria-hidden="true">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}
