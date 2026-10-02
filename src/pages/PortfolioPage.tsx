import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { Schemas } from "../api/types";
import { Badge, ErrorState, Kpi, Loading, Money, PageHead } from "../components/ui";
import { formatInt, formatMoneyShort, formatPercent } from "../lib/format";

type Portfolio = Schemas["PortfolioOut"];

/**
 * Birden çok siteye erişen kullanıcının karşılaştırma ekranı. Finans/talep alanı yalnız o sitede
 * ilgili izin varsa dolu gelir; yoksa null (backend). "Sağlık" rozeti eşikleri açık karar K19 —
 * burada uydurulmaz, ham ölçüler gösterilir.
 */
export function PortfolioPage() {
  const q = useQuery({ queryKey: ["portfolio"], queryFn: () => get<Portfolio>("/portfolio") });
  return (
    <div className="stack">
      <PageHead title="Portföy" subtitle="Eriştiğiniz sitelerin karşılaştırması" />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Site" value={q.data.sites.length} note={`${formatInt(q.data.total_units)} bağımsız bölüm`} />
            <Kpi label="Tahsilat oranı" tone="accent" value={formatPercent(q.data.collection_rate)} />
            <Kpi label="Toplam tahakkuk" value={formatMoneyShort(q.data.total_charged)} note={`${formatMoneyShort(q.data.total_collected)} tahsil edildi`} />
            <Kpi label="Açık bakiye" tone="danger" value={formatMoneyShort(q.data.total_open_balance)} />
          </div>
          <div className="grid grid--sites">
            {q.data.sites.map((s) => (
              <Link key={s.site_id} to={`/s/${s.slug}`} className="card site-card" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="card__head">
                  <span className="card__title">{s.name}</span>
                  <span className="card__meta ml-auto">{s.role}</span>
                </div>
                <div className="card__body">
                  <div className="kv"><span className="kv__k">Bağımsız bölüm</span><span className="kv__v num">{formatInt(s.units)}</span></div>
                  {s.finance ? (
                    <>
                      <div className="kv"><span className="kv__k">Tahsilat oranı</span><span className="kv__v num">{formatPercent(s.finance.collection_rate)}</span></div>
                      <div className="kv"><span className="kv__k">Açık bakiye</span><span className="kv__v"><Money value={s.finance.open_balance} tone="balance" /></span></div>
                      <div className="kv"><span className="kv__k">Borçlu hesap</span><span className="kv__v num">{s.finance.debtor_count}</span></div>
                    </>
                  ) : (
                    <p className="small muted mb-0">Bu sitede finans görme yetkiniz yok.</p>
                  )}
                  {s.requests && (
                    <div className="kv">
                      <span className="kv__k">Açık talep</span>
                      <span className="kv__v">{s.requests.open} {s.requests.overdue > 0 && <Badge tone="danger">{s.requests.overdue} geciken</Badge>}</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
