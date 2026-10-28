import { Fragment, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, BarChart3, CalendarRange, CheckCircle2, PieChart, Wallet } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import { BarChart, Donut } from "../../components/charts";
import { PlanView, type PaymentPlan } from "../../components/CollectionPanel";
import { Avatar, Badge, Empty, ErrorState, Kpi, Loading, Money, PageHead } from "../../components/ui";
import { formatDate, formatMoney, formatMoneyShort } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { planStatus, planStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

const short = (v: number) => formatMoneyShort(v.toFixed(2));
const monthLabel = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });

/** Yürürlükteki/bozulan planların ödenmemiş taksitleri, vade ayına göre (gecikenler kendi ayında kalır). */
function dueByMonth(plans: PaymentPlan[]) {
  const m = new Map<string, number>();
  for (const p of plans) {
    if (p.status !== "active" && p.status !== "broken") continue;
    for (const i of p.installments) {
      if (i.status === "paid") continue;
      const rest = Number(i.amount) - Number(i.paid);
      if (rest <= 0) continue;
      const k = i.due_date.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + rest);
    }
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 12).map(([k, v]) => ({ label: monthLabel(k), value: v }));
}

/** Ödeme planları (FIN-12): tüm yapılandırmalar; bozulan plan üstte uyarıyla. Plan cari hesap ekranından oluşturulur. */
export function PaymentPlansPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ durum: "" });
  const q = useSiteGet<PaymentPlan[]>("/payment-plans", { status: s.durum || undefined });
  const all = useSiteGet<PaymentPlan[]>("/payment-plans");
  const [open, setOpen] = useState<string | null>(null);
  const plans = all.data ?? [];
  const count = (st: string) => plans.filter((p) => p.status === st).length;
  const remaining = plans.filter((p) => p.status === "active" || p.status === "broken").reduce((t, p) => t + Number(p.total) - Number(p.paid_total), 0);
  const bars = dueByMonth(plans);
  const statusSeg = (["active", "broken", "completed", "cancelled"] as const)
    .map((k) => ({ label: planStatus(k), value: count(k), tone: (k === "active" ? "info" : k === "broken" ? "danger" : k === "completed" ? "ok" : "muted") as "info" | "danger" | "ok" | "muted" }))
    .filter((x) => x.value > 0);

  return (
    <div className="stack">
      <PageHead title="Ödeme planları" subtitle="Borcu taksitlendirilen hesaplar. Yeni plan, borçlu hesabın cari ekranındaki Borç takibi kartından oluşturulur." actions={<Link className="btn" to={`/s/${site.slug}/borclular`}>Borçlular</Link>} />
      {!all.isError && (
        all.data ? (
          <div className="grid grid--kpi rise">
            <Kpi label="Yürürlükte" icon={<CalendarRange aria-hidden="true" />} value={count("active")} note="taksitleri işleyen plan" />
            <Kpi label="Bozuldu" icon={<AlertTriangle aria-hidden="true" />} value={count("broken")} tone={count("broken") ? "danger" : undefined} note="tolerans aşıldı" />
            <Kpi label="Tamamlandı" icon={<CheckCircle2 aria-hidden="true" />} value={count("completed")} tone="ok" note="tüm taksitler ödendi" />
            <Kpi label="Plandaki kalan" icon={<Wallet aria-hidden="true" />} value={short(remaining)} note={formatMoney(remaining.toFixed(2))} />
          </div>
        ) : (
          <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
        )
      )}

      {plans.length > 0 && (
        <div className="grid grid--main">
          <div className="card">
            <div className="card__head">
              <span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span>
              <span className="card__title">Taksit vadeleri</span>
              <span className="card__meta ml-auto">ödenmemiş tutar, vade ayına göre</span>
            </div>
            <div className="card__body fin-chart">
              {bars.length > 0 ? <BarChart label="Ödenmemiş taksitlerin vade ayına göre tutarı" data={bars} format={short} /> : <Empty title="Bekleyen taksit yok" icon={<CheckCircle2 aria-hidden="true" />} />}
            </div>
          </div>
          <div className="card">
            <div className="card__head">
              <span className="card__icon"><PieChart aria-hidden="true" /></span>
              <span className="card__title">Plan durumu</span>
            </div>
            <div className="card__body fin-pie">
              <Donut segments={statusSeg} label="Plan durumları" center={plans.length} centerSub="plan" />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><CalendarRange aria-hidden="true" /></span>
          <div>
            <div className="card__title">Planlar</div>
            {q.data && <div className="card__meta">{q.data.length} kayıt</div>}
          </div>
          <div className="card__tools">
            <div className="field"><label className="field__label" htmlFor="pp-st">Durum</label><select id="pp-st" className="field__input" value={s.durum} onChange={(e) => set({ durum: e.target.value })}><option value="">Tümü</option>{["active", "broken", "completed", "cancelled"].map((k) => <option key={k} value={k}>{planStatus(k)}</option>)}</select></div>
          </div>
        </div>
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Ödeme planı yok" icon={<CalendarRange aria-hidden="true" />}>Borçlu bir hesabın cari ekranından plan oluşturabilirsiniz.</Empty> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Ödeme planları</caption>
              <thead><tr><th scope="col">Bölüm / kişi</th><th scope="col" className="right">Toplam</th><th scope="col" className="right">Ödenen</th><th scope="col">Sıradaki vade</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
              <tbody>{q.data.map((p) => {
                const next = p.installments.find((i) => i.status !== "paid");
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td><div className="cell-person"><Avatar name={p.person_name} size="sm" soft /><div><div className="cell-main">{p.unit_name}</div><div className="cell-sub">{p.person_name ?? "—"} · <span className="mono">{p.reference_code}</span></div></div></div></td>
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
        </div>
      </div>
    </div>
  );
}
