import { Fragment, useState } from "react";
import { Link } from "react-router";
import { CalendarRange } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import { PlanView, type PaymentPlan } from "../../components/CollectionPanel";
import { Badge, Empty, ErrorState, Kpi, Loading, Money, PageHead } from "../../components/ui";
import { formatDate, formatMoney } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { planStatus, planStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Ödeme planları (FIN-12): tüm yapılandırmalar; bozulan plan üstte uyarıyla. Plan cari hesap ekranından oluşturulur. */
export function PaymentPlansPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ durum: "" });
  const q = useSiteGet<PaymentPlan[]>("/payment-plans", { status: s.durum || undefined });
  const all = useSiteGet<PaymentPlan[]>("/payment-plans");
  const [open, setOpen] = useState<string | null>(null);
  const count = (st: string) => (all.data ?? []).filter((p) => p.status === st).length;
  return (
    <div className="stack">
      <PageHead title="Ödeme planları" subtitle="Borcu taksitlendirilen hesaplar. Yeni plan, borçlu hesabın cari ekranındaki Borç takibi kartından oluşturulur." actions={<Link className="btn" to={`/s/${site.slug}/borclular`}>Borçlular</Link>} />
      {all.data && (
        <div className="grid grid--kpi">
          <Kpi label="Yürürlükte" value={count("active")} />
          <Kpi label="Bozuldu" value={count("broken")} tone={count("broken") ? "danger" : undefined} />
          <Kpi label="Tamamlandı" value={count("completed")} tone="ok" />
          <Kpi label="Plandaki tutar" small value={formatMoney(String((all.data ?? []).filter((p) => p.status === "active" || p.status === "broken").reduce((t, p) => t + Number(p.total) - Number(p.paid_total), 0).toFixed(2)))} note="kalan" />
        </div>
      )}
      <div className="filters"><div className="field"><label className="field__label" htmlFor="pp-st">Durum</label><select id="pp-st" className="field__input" value={s.durum} onChange={(e) => set({ durum: e.target.value })}><option value="">Tümü</option>{["active", "broken", "completed", "cancelled"].map((k) => <option key={k} value={k}>{planStatus(k)}</option>)}</select></div></div>
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Ödeme planı yok" icon={<CalendarRange aria-hidden="true" />}>Borçlu bir hesabın cari ekranından plan oluşturabilirsiniz.</Empty> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Ödeme planları</caption>
            <thead><tr><th scope="col">Bölüm / kişi</th><th scope="col" className="right">Toplam</th><th scope="col" className="right">Ödenen</th><th scope="col">Sıradaki vade</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.map((p) => {
              const next = p.installments.find((i) => i.status !== "paid");
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td><div className="cell-main">{p.unit_name}</div><div className="cell-sub">{p.person_name ?? "—"} · <span className="mono">{p.reference_code}</span></div></td>
                    <td className="right"><Money value={p.total} /><div className="cell-sub">{p.installment_count} taksit</div></td>
                    <td className="right"><Money value={p.paid_total} /></td>
                    <td className="small nowrap">{next ? <>{formatDate(next.due_date)}<div className="cell-sub">{formatMoney(next.amount)}</div></> : "—"}</td>
                    <td><Badge tone={planStatusTone(p.status)}>{planStatus(p.status)}</Badge></td>
                    <td className="right nowrap"><button className="btn btn--ghost btn--sm" type="button" aria-expanded={open === p.id} onClick={() => setOpen((x) => (x === p.id ? null : p.id))}>Taksitler</button> <Link className="btn btn--sm" to={`/s/${site.slug}/cari/${p.account_id}`}>Cari</Link></td>
                  </tr>
                  {open === p.id && <tr><td colSpan={6}><PlanView p={p} manage={can(P.paymentRecord)} /></td></tr>}
                </Fragment>
              );
            })}</tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}
