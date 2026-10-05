import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Badge, Empty, ErrorState, Kpi, Loading, Money, PageHead, Pager } from "../../components/ui";
import { formatDate, formatMoney, formatMoneyShort } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { accountKind, overdueTone } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";
import Decimal from "decimal.js";

type Debtors = Schemas["DebtorPage"];

export function DebtorsPage() {
  const { site } = useSite();
  const [s, set] = useUrlState({ q: "", page: "1" });
  const [search, setSearch] = useState(s.q);
  const q = useDebounced(search);
  useEffect(() => {
    if (q !== s.q) set({ q });
  }, [q]);
  const r = useSiteGet<Debtors>("/debtors", { q: s.q, page: s.page, page_size: 50 });
  const sum = r.data?.summary;

  return (
    <div className="stack">
      <PageHead title="Borçlu hesaplar" subtitle={sum ? `${sum.debtor_count} hesapta açık bakiye var` : undefined} />

      {sum && (
        <div className="grid grid--kpi">
          <Kpi label="Toplam açık bakiye" tone="danger" value={formatMoneyShort(sum.total_balance)} />
          <Kpi label="30 günü aşan" tone="warn" value={sum.over_30_count} note={formatMoneyShort(sum.over_30_days)} />
          <Kpi label="60 günü aşan" tone="danger" value={sum.over_60_count} note={formatMoneyShort(sum.over_60_days)} />
          <Kpi label="Ortalama borç" small value={formatMoney(sum.average_balance)} />
        </div>
      )}

      {sum && sum.over_30_count > 0 && (
        <Alert tone="info" title="Gecikme tazminatı hakkında">
          KMK m.20 uyarınca geciken aidat için gecikme tazminatı istenebilir. Tazminatın deftere işlenmesi henüz açık bir karar; şu an
          bakiyelere eklenmiyor.
        </Alert>
      )}

      <div className="filters">
        <div className="field">
          <label className="field__label" htmlFor="debtor-q">Ara</label>
          <input id="debtor-q" className="field__input" type="search" placeholder="Bölüm, kişi ya da referans" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card__body card__body--flush">
          {r.isPending ? (
            <Loading />
          ) : r.isError ? (
            <div className="card__body"><ErrorState error={r.error} onRetry={() => r.refetch()} /></div>
          ) : r.data.items.length === 0 ? (
            <Empty title={s.q ? "Aramaya uyan borçlu yok" : "Borçlu hesap yok"} icon={<CheckCircle2 aria-hidden="true" />}>
              {s.q ? "Aramayı değiştirin." : "Tüm hesaplar kapalı."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Borçlu hesaplar, gecikme günleri ve bakiyeleri</caption>
                <thead>
                  <tr>
                    <th scope="col">Bölüm</th>
                    <th scope="col">Kişi</th>
                    <th scope="col">Hesap</th>
                    <th scope="col">Referans</th>
                    <th scope="col">En eski vade</th>
                    <th scope="col" className="right">Gecikme</th>
                    <th scope="col" className="right">Bakiye</th>
                    <th scope="col"><span className="visually-hidden">İşlem</span></th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.items.map((d) => (
                    <tr key={d.id} className={d.overdue_days > 30 ? "is-overdue" : undefined}>
                      <td className="cell-main">{d.unit_name}</td>
                      <td>{d.person_name ?? "—"}</td>
                      <td><Badge>{accountKind(d.kind)}</Badge></td>
                      <td className="mono xs">{d.reference_code}</td>
                      <td className="small nowrap">{formatDate(d.oldest_open_due_date)}</td>
                      <td className="right">{d.overdue_days > 0 ? <Badge tone={overdueTone(d.overdue_days)}>{d.overdue_days} gün</Badge> : <span className="subtle">—</span>}</td>
                      <td className="right"><Money value={d.balance} tone="balance" /></td>
                      <td className="right nowrap"><Link className="btn btn--sm" to={`/s/${site.slug}/cari/${d.id}`}>Ekstre</Link> <Link className="btn btn--ghost btn--sm" to={`/s/${site.slug}/belge/ihtar/${d.id}`}>İhtar</Link></td>
                    </tr>
                  ))}
                </tbody>
                {sum && !s.q && new Decimal(sum.total_balance).gt(0) && (
                  <tfoot>
                    <tr>
                      <td colSpan={6}>Toplam</td>
                      <td className="right"><Money value={sum.total_balance} tone="balance" /></td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
        {r.data && (
          <div className="card__foot">
            <Pager page={r.data.page} pageSize={r.data.page_size} total={r.data.total} onPage={(p) => set({ page: String(p) })} />
          </div>
        )}
      </div>
    </div>
  );
}
