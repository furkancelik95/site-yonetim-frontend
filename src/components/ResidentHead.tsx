import { cloneElement, type ReactElement, type ReactNode } from "react";

export type ResidentStat = { label: string; value: ReactNode; tone?: "ok" | "warn" | "danger" | "info" };

/**
 * Sakin alt ekranlarının sayfa başı: yönetim panelindeki renkli bandın sakin karşılığı.
 * Daire ikon + başlık + açıklama; altında (varsa) küçük özet sayıları. Sağdaki büyük soluk ikon süstür.
 * Masaüstünde iki sütunu da kaplar (p-sakin.css → .r-pagehead).
 */
export function ResidentHead({ icon, title, sub, stats, tone = "blue" }: { icon: ReactElement; title: string; sub?: ReactNode; stats?: ResidentStat[]; tone?: "blue" | "teal" | "violet" | "danger" }) {
  return (
    <header className={`r-pagehead r-pagehead--${tone}`}>
      <span className="r-pagehead__mark" aria-hidden="true">{cloneElement(icon, { "aria-hidden": true } as Record<string, unknown>)}</span>
      <div className="r-pagehead__top">
        <span className="r-pagehead__icon" aria-hidden="true">{icon}</span>
        <div className="r-pagehead__text">
          <h1 className="r-pagehead__title">{title}</h1>
          {sub && <p className="r-pagehead__sub">{sub}</p>}
        </div>
      </div>
      {stats && stats.length > 0 && (
        <dl className="r-pagehead__stats">
          {stats.map((s) => (
            <div key={s.label} className={`r-stat${s.tone ? ` r-stat--${s.tone}` : ""}`}>
              <dt className="r-stat__l">{s.label}</dt>
              <dd className="r-stat__v">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
