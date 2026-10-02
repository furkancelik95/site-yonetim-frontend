import { Link } from "react-router";
import { AlertTriangle, CheckCircle2, Inbox, Megaphone, Wrench } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { useMe } from "../../auth/AuthContext";
import { Alert, Badge, ErrorState, Kpi, Loading, Money, PageHead } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, formatMoneyShort, formatPercent } from "../../lib/format";
import { accountKind, importance, importanceTone, overdueTone, propertyKind } from "../../lib/labels";
import { M, P, useSite } from "../../site/SiteContext";
import Decimal from "decimal.js";

type Dashboard = Schemas["DashboardOut"];

function rate(collected: string, charged: string): string | null {
  const c = new Decimal(charged);
  return c.isZero() ? null : new Decimal(collected).div(c).mul(100).toFixed(1);
}

export function DashboardPage() {
  const { site, can, shows } = useSite();
  const me = useMe();
  const q = useSiteGet<Dashboard>("/dashboard");
  const base = `/s/${site.slug}`;

  const subtitle = [propertyKind(site.property_kind), [site.district, site.city].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
  const head = (
    <PageHead
      title={site.name}
      subtitle={subtitle}
      actions={me.can_see_portfolio && me.sites.length > 1 ? <Link className="btn" to="/">Portföy</Link> : undefined}
    />
  );

  if (q.isPending) return <div className="stack">{head}<Loading /></div>;
  if (q.isError) return <div className="stack">{head}<ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;

  const d = q.data;
  const f = d.finance;
  const totalRate = f ? rate(f.total_collected, f.total_charged) : null;
  const monthRate = f ? rate(f.month_collected, f.month_charged) : null;
  const rateTone = totalRate === null ? undefined : Number(totalRate) >= 90 ? "ok" : Number(totalRate) >= 70 ? "warn" : "danger";

  // "Bugün ne yapmalıyım?" — panonun tepesinde sayı değil, eylem durur (referans).
  const actions: { tone: "danger" | "warn" | "info"; title: string; body: string; to: string; link: string }[] = [];
  if (d.requests && d.requests.urgent > 0 && shows(M.requests, P.requestsRead)) {
    actions.push({ tone: "danger", title: `${d.requests.urgent} acil talep var`, body: "Acil öncelikli talepler bekliyor.", to: `${base}/talepler`, link: "Taleplere git" });
  }
  if (f && new Decimal(f.over_30_days).gt(0)) {
    actions.push({
      tone: "warn",
      title: "30 günü aşan borç var",
      body: `Toplam ${formatMoney(f.over_30_days)}. KMK m.20 uyarınca gecikme tazminatı istenebilir.`,
      to: `${base}/borclular`,
      link: "Borçlulara git",
    });
  }
  if (monthRate !== null && Number(monthRate) < 50 && shows(M.announcements, P.announcementsPublish)) {
    actions.push({
      tone: "info",
      title: "Bu ayın tahsilatı henüz yarıyı geçmedi",
      body: `${formatPercent(monthRate)} tahsil edildi. Hatırlatma duyurusu yayınlamak isteyebilirsiniz.`,
      to: `${base}/duyurular`,
      link: "Duyurulara git",
    });
  }

  return (
    <div className="stack">
      {head}

      {actions.length > 0 ? (
        <div>
          <div className="section-title">Bugün ilgilenilmesi gerekenler</div>
          <div className="stack" style={{ gap: "var(--s-3)" }}>
            {actions.map((a) => (
              <Alert key={a.title} tone={a.tone} title={a.title}>
                {a.body} <Link to={a.to}>{a.link}</Link>
              </Alert>
            ))}
          </div>
        </div>
      ) : (
        <Alert tone="ok" title="Acil ilgilenilmesi gereken bir şey yok">
          Acil talep ve 30 günü aşan borç bulunmuyor.
        </Alert>
      )}

      {f && (
        <div className="grid grid--kpi">
          <Kpi label="Tahsilat oranı" tone={rateTone} value={formatPercent(totalRate)} note={`bu ay ${formatPercent(monthRate)}`} />
          <Kpi label="Açık bakiye" tone="danger" value={formatMoneyShort(f.open_balance)} note={`${f.debtor_count} borçlu hesap`} />
          <Kpi label="Bu ay tahakkuk" value={formatMoneyShort(f.month_charged)} note={`${formatMoneyShort(f.month_collected)} tahsil edildi`} />
          {d.cash_balance !== null && d.cash_balance !== undefined ? (
            <Kpi label="Kasa ve banka" tone="accent" value={formatMoneyShort(d.cash_balance)} note="tüm hesapların toplamı" />
          ) : (
            d.requests && <Kpi label="Açık talep" value={d.requests.open + d.requests.in_progress + d.requests.waiting} />
          )}
        </div>
      )}

      <div className="grid grid--2">
        {f && (
          <div className="card">
            <div className="card__head">
              <span className="card__icon card__icon--danger"><AlertTriangle aria-hidden="true" /></span>
              <span className="card__title">En yüksek borçlular</span>
              <Link className="ml-auto small" to={`${base}/borclular`}>Tümü</Link>
            </div>
            <div className="card__body card__body--flush">
              {d.top_debtors.length === 0 ? (
                <div className="empty">
                  <CheckCircle2 aria-hidden="true" />
                  <div className="empty__title">Borçlu yok</div>
                  <div className="small">Tüm hesaplar kapalı.</div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <caption className="visually-hidden">En yüksek bakiyeli borçlu hesaplar</caption>
                    <thead>
                      <tr>
                        <th scope="col">Bölüm</th>
                        <th scope="col">Kişi</th>
                        <th scope="col" className="right">Gecikme</th>
                        <th scope="col" className="right">Bakiye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.top_debtors.map((a) => (
                        <tr key={a.id} className={a.overdue_days > 30 ? "is-overdue" : undefined}>
                          <td>
                            <Link to={`${base}/cari/${a.id}`} className="cell-main">{a.unit_name}</Link>
                            <div className="cell-sub">{accountKind(a.kind)}</div>
                          </td>
                          <td>
                            <div className="cell-main">{a.person_name ?? "—"}</div>
                            <div className="cell-sub mono">{a.reference_code}</div>
                          </td>
                          <td className="right num">
                            {a.overdue_days > 0 ? <Badge tone={overdueTone(a.overdue_days) === "muted" ? "warn" : overdueTone(a.overdue_days)}>{a.overdue_days} gün</Badge> : <span className="subtle">—</span>}
                          </td>
                          <td className="right"><Money value={a.balance} tone="balance" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {d.requests && (
          <div className="card">
            <div className="card__head">
              <span className="card__icon card__icon--warn"><Wrench aria-hidden="true" /></span>
              <span className="card__title">Talepler</span>
              <Link className="ml-auto small" to={`${base}/talepler`}>Tümü</Link>
            </div>
            <div className="card__body">
              <div className="kv"><span className="kv__k">Açık</span><span className="kv__v num">{d.requests.open}</span></div>
              <div className="kv"><span className="kv__k">İşlemde</span><span className="kv__v num">{d.requests.in_progress}</span></div>
              <div className="kv"><span className="kv__k">Beklemede</span><span className="kv__v num">{d.requests.waiting}</span></div>
              <div className="kv">
                <span className="kv__k">Acil</span>
                <span className="kv__v">{d.requests.urgent > 0 ? <Badge tone="danger">{d.requests.urgent} acil</Badge> : <span className="num">0</span>}</span>
              </div>
            </div>
          </div>
        )}

        {d.announcements && (
          <div className="card">
            <div className="card__head">
              <span className="card__icon card__icon--accent"><Megaphone aria-hidden="true" /></span>
              <span className="card__title">Duyurular</span>
              <Link className="ml-auto small" to={`${base}/duyurular`}>Tümü</Link>
            </div>
            <div className="card__body">
              {d.announcements.length === 0 ? (
                <p className="small muted mb-0">Henüz duyuru yok.</p>
              ) : (
                <ul className="timeline">
                  {d.announcements.map((a) => (
                    <li key={a.id} className="is-done">
                      <div className="timeline__title">
                        {a.title} {a.importance !== "normal" && <Badge tone={importanceTone(a.importance)}>{importance(a.importance)}</Badge>}
                      </div>
                      <div className="timeline__meta">{formatDateTime(a.published_at)}{a.is_pinned ? " · Sabitlendi" : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {d.expenses && can(P.expensesRead) && (
          <div className="card">
            <div className="card__head">
              <span className="card__icon card__icon--info"><Inbox aria-hidden="true" /></span>
              <span className="card__title">Son giderler</span>
              <Link className="ml-auto small" to={`${base}/giderler`}>Tümü</Link>
            </div>
            <div className="card__body card__body--flush">
              <div className="table-wrap">
                <table className="data">
                  <caption className="visually-hidden">Son kaydedilen giderler</caption>
                  <thead>
                    <tr>
                      <th scope="col">Gider</th>
                      <th scope="col">Tarih</th>
                      <th scope="col" className="right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.expenses.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div className="cell-main">{e.description}</div>
                          <div className="cell-sub">{e.is_paid ? "Ödendi" : "Ödenmedi"}</div>
                        </td>
                        <td className="small nowrap">{formatDate(e.date)}</td>
                        <td className="right"><Money value={e.amount} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
