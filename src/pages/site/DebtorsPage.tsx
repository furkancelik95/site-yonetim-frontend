import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Bell, CheckCircle2, Clock, Scale, Wallet } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Donut } from "../../components/charts";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Kpi, Loading, Money, PageHead, Pager } from "../../components/ui";
import { formatDate, formatMoney, formatMoneyShort } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { accountKind, letterStatus, overdueTone, planStatus, planStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import Decimal from "decimal.js";

type Debtors = Schemas["DebtorPage"];
type Aging = Schemas["AgingOut"];
type Status = Record<string, Schemas["CollectionFollowUpOut"]>;
/** Blok satırındaki kova tutarı ("0_30" … "90_plus"). */
const bucketOf = (row: Aging["by_block"][number], key: string) => (row as unknown as Record<string, string>)[key] ?? "0";

/** Borç takibi (FIN-12): borçlu hesaplar, yaşlandırma, takip durumu (plan, ihtarname), toplu hatırlatma. */
export function DebtorsPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ q: "", page: "1" });
  const [search, setSearch] = useState(s.q);
  const q = useDebounced(search);
  useEffect(() => {
    if (q !== s.q) set({ q, page: "1" });
  }, [q]);
  const r = useSiteGet<Debtors>("/debtors", { q: s.q, page: s.page, page_size: 50 });
  const aging = useSiteGet<Aging>("/receivables/aging");
  const status = useSiteGet<Status>("/collection-status");
  const sum = r.data?.summary;
  const manage = can(P.paymentRecord);
  const [sel, setSel] = useState<string[]>([]);
  const [channel, setChannel] = useState("app");
  const bulk = useSiteMutation<{ account_ids: string[]; channel: string }, { count: number }>("POST", "/collection-actions/bulk", { onSuccess: () => setSel([]) });
  const items = r.data?.items ?? [];
  const allOn = items.length > 0 && items.every((d) => sel.includes(d.id));

  return (
    <div className="stack">
      <PageHead title="Borçlu hesaplar" subtitle={sum ? `${sum.debtor_count} hesapta açık bakiye var` : undefined} actions={<Link className="btn" to={`/s/${site.slug}/odeme-planlari`}>Ödeme planları</Link>} />

      {sum ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Toplam açık bakiye" tone="danger" icon={<Wallet aria-hidden="true" />} value={formatMoneyShort(sum.total_balance)} note={`${sum.debtor_count} borçlu hesap`} />
          <Kpi label="30 günü aşan" tone="warn" icon={<Clock aria-hidden="true" />} value={sum.over_30_count} note={formatMoneyShort(sum.over_30_days)} />
          <Kpi label="60 günü aşan" tone="danger" icon={<AlertTriangle aria-hidden="true" />} value={sum.over_60_count} note={formatMoneyShort(sum.over_60_days)} />
          <Kpi label="Ortalama borç" icon={<Scale aria-hidden="true" />} small value={formatMoney(sum.average_balance)} note="hesap başına" />
        </div>
      ) : r.isPending ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : null}

      {aging.data && aging.data.by_block.length > 0 && (
        <div className="card">
          <div className="card__head">
            <span className="card__icon card__icon--warn"><Clock aria-hidden="true" /></span>
            <span className="card__title">Yaşlandırma</span>
            <span className="card__meta ml-auto">{formatDate(aging.data.as_of)} itibarıyla</span>
          </div>
          <div className="card__body fin-aging">
            <Donut
              label="Gecikme süresine göre açık bakiye"
              centerSub="açık bakiye"
              center={formatMoneyShort(aging.data.buckets.reduce((s, b) => s.plus(b.amount), new Decimal(0)).toFixed(2))}
              format={(v) => formatMoneyShort(v.toFixed(2))}
              segments={aging.data.buckets.map((b) => ({ label: b.label, value: Number(b.amount) }))}
            />
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Blok bazında borç yaşlandırması</caption>
              <thead><tr><th scope="col">Blok</th>{aging.data.buckets.map((b) => <th key={b.key} scope="col" className="right">{b.label}</th>)}<th scope="col" className="right">Toplam</th></tr></thead>
              <tbody>{aging.data.by_block.map((row) => <tr key={row.block}><td className="cell-main">{row.block}</td>{aging.data!.buckets.map((b) => <td key={b.key} className="right"><Money value={bucketOf(row, b.key)} /></td>)}<td className="right strong"><Money value={row.total} /></td></tr>)}</tbody>
              <tfoot><tr><td>Toplam</td>{aging.data.buckets.map((b) => <td key={b.key} className="right"><Money value={b.amount} /><div className="cell-sub">{b.count} hesap</div></td>)}<td /></tr></tfoot>
            </table></div>
          </div>
        </div>
      )}

      {sum && sum.over_30_count > 0 && (
        <Alert tone="info" title="Gecikme tazminatı hakkında">
          KMK m.20 uyarınca geciken aidat için gecikme tazminatı istenebilir. Site kararıyla açılır (Finans ayarları — varsayılan
          kapalı; oran ve yöntem avukat görüşüne kadar parametre). Deftere işlenmesi sonraki sürümde; şu an bakiyelere eklenmiyor.
        </Alert>
      )}

      {manage && sel.length > 0 && (
        <div className="bulkbar" role="region" aria-label="Seçim">
          <span className="strong">{sel.length} hesap seçili</span>
          <select className="field__input" style={{ width: "auto", minHeight: 36 }} aria-label="Hatırlatma kanalı" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="app">Uygulama bildirimi</option><option value="sms">SMS</option></select>
          <ConfirmButton className="btn btn--sm btn--primary" title="Toplu hatırlatma" confirmLabel="Kaydet" body={`${sel.length} hesap için hatırlatma kaydedilecek. Bildirim/SMS gönderimi servisi (K5) gelene kadar yalnız kayıt tutulur; kişilere siz ulaştırın.`} onConfirm={() => bulk.mutateAsync({ account_ids: sel, channel })}><Bell aria-hidden="true" /> Hatırlatma kaydet</ConfirmButton>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setSel([])}>Seçimi kaldır</button>
        </div>
      )}

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--danger"><AlertTriangle aria-hidden="true" /></span>
          <div>
            <div className="card__title">Borçlu hesaplar</div>
            {r.data && <div className="card__meta">{r.data.total} kayıt</div>}
          </div>
          <div className="card__tools">
            <div className="field fin-search">
              <label className="field__label" htmlFor="debtor-q">Ara</label>
              <input id="debtor-q" className="field__input" type="search" placeholder="Bölüm, kişi ya da referans" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
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
                    {manage && <th scope="col" style={{ width: 44 }}><input type="checkbox" aria-label="Sayfadaki hesapları seç" checked={allOn} onChange={() => setSel(allOn ? sel.filter((id) => !items.some((d) => d.id === id)) : [...new Set([...sel, ...items.map((d) => d.id)])])} /></th>}
                    <th scope="col">Bölüm</th>
                    <th scope="col">Kişi</th>
                    <th scope="col">Hesap</th>
                    <th scope="col">En eski vade</th>
                    <th scope="col" className="right">Gecikme</th>
                    <th scope="col">Takip</th>
                    <th scope="col" className="right">Bakiye</th>
                    <th scope="col"><span className="visually-hidden">İşlem</span></th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.items.map((d) => {
                    const st = status.data?.[d.id];
                    return (
                      <tr key={d.id} className={d.overdue_days > 30 ? "is-overdue" : undefined}>
                        {manage && <td><input type="checkbox" aria-label={`${d.unit_name} ${d.person_name ?? ""} seç`} checked={sel.includes(d.id)} onChange={() => setSel((x) => (x.includes(d.id) ? x.filter((i) => i !== d.id) : [...x, d.id]))} /></td>}
                        <td className="cell-main">{d.unit_name}<div className="cell-sub mono">{d.reference_code}</div></td>
                        <td><div className="cell-person"><Avatar name={d.person_name} size="sm" soft /><span>{d.person_name ?? "—"}</span></div></td>
                        <td><Badge>{accountKind(d.kind)}</Badge></td>
                        <td className="small nowrap">{formatDate(d.oldest_open_due_date)}</td>
                        <td className="right">{d.overdue_days > 0 ? <Badge tone={overdueTone(d.overdue_days)}>{d.overdue_days} gün</Badge> : <span className="subtle">—</span>}</td>
                        <td className="small">
                          {st?.plan_status && <Badge tone={planStatusTone(st.plan_status)}>Plan: {planStatus(st.plan_status)}</Badge>}{" "}
                          {st?.letter_status && <Badge tone={st.letter_status === "served" ? "warn" : "info"}>İhtar: {letterStatus(st.letter_status)}</Badge>}
                          {st && st.reminder_count > 0 && <div className="cell-sub">{st.reminder_count} hatırlatma</div>}
                          {!st && <span className="subtle">—</span>}
                        </td>
                        <td className="right"><Money value={d.balance} tone="balance" /></td>
                        <td className="right nowrap"><Link className="btn btn--sm" to={`/s/${site.slug}/cari/${d.id}`}>Takip</Link> <Link className="btn btn--ghost btn--sm" to={`/s/${site.slug}/belge/ihtar/${d.id}`}>İhtar</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
                {sum && !s.q && new Decimal(sum.total_balance).gt(0) && (
                  <tfoot>
                    <tr>
                      <td colSpan={manage ? 7 : 6}>Toplam</td>
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
            <p className="small muted mb-0">Borçlu bilgisi yalnız yetkili rollerde görünür; sakin ekranlarında hiçbir yerde yer almaz.</p>
          </div>
        )}
      </div>
    </div>
  );
}
