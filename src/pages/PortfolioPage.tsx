import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { get } from "../api/client";
import type { Schemas } from "../api/types";
import { Badge, ErrorState, Hero, Kpi, Loading, Money, todayLong } from "../components/ui";
import { coverUrl } from "../lib/cover";
import { formatInt, formatMoneyShort, formatPercent } from "../lib/format";

type Portfolio = Schemas["PortfolioOut"];

/** Tahsilat oranı çubuğunun tonu — K19 eşikleri açık karar; burada yalnız görsel kademe. */
function rateTone(rate: string | number | null | undefined): "ok" | "warn" | "danger" {
  const n = Number(rate);
  return n >= 90 ? "ok" : n >= 70 ? "warn" : "danger";
}

/**
 * Birden çok siteye erişen kullanıcının karşılaştırma ekranı. Finans/talep alanı yalnız o sitede
 * ilgili izin varsa dolu gelir; yoksa null (backend). "Sağlık" rozeti eşikleri açık karar K19 —
 * burada uydurulmaz, ham ölçüler gösterilir.
 */
export function PortfolioPage() {
  const q = useQuery({ queryKey: ["portfolio"], queryFn: () => get<Portfolio>("/portfolio") });
  return (
    <div className="stack">
      <Hero eyebrow={todayLong()} title="Portföy" subtitle="Eriştiğiniz sitelerin karşılaştırması" photo="/img/hero-2.webp" />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid--kpi rise">
            <Kpi label="Site" icon={<Building2 aria-hidden="true" />} value={q.data.sites.length} note={`${formatInt(q.data.total_units)} bağımsız bölüm`} />
            <Kpi label="Tahsilat oranı" tone={rateTone(q.data.collection_rate)} icon={<TrendingUp aria-hidden="true" />} value={formatPercent(q.data.collection_rate)} note="finans izni olan siteler" />
            <Kpi label="Toplam tahakkuk" icon={<ReceiptText aria-hidden="true" />} value={formatMoneyShort(q.data.total_charged)} note={`${formatMoneyShort(q.data.total_collected)} tahsil edildi`} />
            <Kpi label="Açık bakiye" tone="danger" icon={<Wallet aria-hidden="true" />} value={formatMoneyShort(q.data.total_open_balance)} />
          </div>

          <div>
            <div className="section-title">Siteler</div>
            <div className="grid grid--sites rise">
              {q.data.sites.map((s) => {
                const rate = s.finance ? Number(s.finance.collection_rate) : null;
                const width = rate === null ? 0 : Math.max(0, Math.min(100, rate));
                return (
                  <Link key={s.site_id} to={`/s/${s.slug}`} className="site-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="site-card__cover">
                      <img className="site-card__img" src={coverUrl(s.site_id)} alt="" loading="lazy" decoding="async" />
                      <span className="site-card__role">{s.role}</span>
                      <span className="site-card__glyph" aria-hidden="true">
                        <Building2 />
                      </span>
                    </div>
                    <div className="site-card__head">
                      <div className="site-card__name">{s.name}</div>
                      <div className="site-card__meta">{formatInt(s.units)} bağımsız bölüm</div>
                    </div>
                    {s.finance ? (
                      <div className="site-card__stats">
                        <div className="site-card__stat">
                          <div className="site-card__stat-label">Açık bakiye</div>
                          <div className="site-card__stat-value"><Money value={s.finance.open_balance} tone="balance" className="nowrap" /></div>
                        </div>
                        <div className="site-card__stat">
                          <div className="site-card__stat-label">Borçlu</div>
                          <div className="site-card__stat-value num">{s.finance.debtor_count}</div>
                        </div>
                        <div className="site-card__stat">
                          <div className="site-card__stat-label">Açık talep</div>
                          <div className="site-card__stat-value num">
                            {s.requests ? s.requests.open : "—"}
                            {s.requests && s.requests.overdue > 0 && (
                              <>
                                {" "}
                                <Badge tone="danger">{s.requests.overdue} geciken</Badge>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="card__body" style={{ borderTop: "1px solid var(--line)" }}>
                        <p className="small muted mb-0">Bu sitede finans görme yetkiniz yok.</p>
                        {s.requests && (
                          <p className="small mb-0 mt-2">
                            <span className="muted">Açık talep:</span> <span className="num strong">{s.requests.open}</span>{" "}
                            {s.requests.overdue > 0 && <Badge tone="danger">{s.requests.overdue} geciken</Badge>}
                          </p>
                        )}
                      </div>
                    )}
                    {s.finance && (
                      <div className="site-card__foot">
                        <div className="site-card__foot-row">
                          <span>Tahsilat oranı</span>
                          <strong>{formatPercent(s.finance.collection_rate)}</strong>
                        </div>
                        <div className="meter" role="img" aria-label={`Tahsilat oranı ${formatPercent(s.finance.collection_rate)}`}>
                          <div className={`meter__fill meter__fill--${rateTone(rate)}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
