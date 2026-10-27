import { useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Inbox, Info, Landmark, Megaphone, ReceiptText, TrendingUp, Wallet, Wrench } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { useMe } from "../../auth/AuthContext";
import { Donut } from "../../components/charts";
import { Avatar, Badge, ErrorState, Hero, Kpi, Loading, Money, Segmented, todayLong } from "../../components/ui";
import { heroUrl } from "../../lib/cover";
import { formatDate, formatDateTime, formatMoney, formatMoneyShort, formatPercent } from "../../lib/format";
import { accountKind, importance, importanceTone, overdueTone, propertyKind } from "../../lib/labels";
import { M, P, useSite } from "../../site/SiteContext";
import Decimal from "decimal.js";

type Dashboard = Schemas["DashboardOut"];
type Tone = "danger" | "warn" | "info" | "ok";
type Period = "month" | "total";

function rate(collected: string, charged: string): string | null {
  const c = new Decimal(charged);
  return c.isZero() ? null : new Decimal(collected).div(c).mul(100).toFixed(1);
}

const attnIcon = { danger: AlertTriangle, warn: AlertTriangle, info: Info, ok: CheckCircle2 };

/** "Bugün dikkat" kartı: ikon + başlık + açıklama + bağlantı; kartın tamamı tıklanır. */
function Attention({ tone, title, body, to, link }: { tone: Tone; title: string; body: string; to?: string; link?: string }) {
  const Icon = attnIcon[tone];
  const inner = (
    <>
      <span className="attn__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="attn__main">
        <span className="attn__title">{title}</span>
        <span className="attn__body">{body}</span>
        {link && (
          <span className="attn__link">
            {link} <ArrowRight aria-hidden="true" />
          </span>
        )}
      </span>
    </>
  );
  const cls = `attn__card attn__card--${tone}`;
  return to ? (
    <Link className={cls} to={to}>
      {inner}
    </Link>
  ) : (
    <div className={cls} role="status">
      {inner}
    </div>
  );
}

export function DashboardPage() {
  const { site, can, shows } = useSite();
  const me = useMe();
  const q = useSiteGet<Dashboard>("/dashboard");
  const base = `/s/${site.slug}`;
  // Dönem seçici: KPI'lar bu ayın mı yoksa tüm zamanların mı rakamlarını gösteriyor
  const [period, setPeriod] = useState<Period>("month");

  const subtitle = [propertyKind(site.property_kind), [site.district, site.city].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
  const head = (
    <Hero
      eyebrow={todayLong()}
      title={site.name}
      subtitle={subtitle}
      photo={heroUrl(site.id)}
      actions={
        me.can_see_portfolio && me.sites.length > 1 ? (
          <Link className="btn" to="/">
            Portföy
          </Link>
        ) : undefined
      }
    >
      <div className="hero__bar">
        <Segmented
          label="Dönem"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Bu ay" },
            { value: "total", label: "Toplam" },
          ]}
        />
      </div>
    </Hero>
  );

  if (q.isPending) return <div className="stack">{head}<Loading /></div>;
  if (q.isError) return <div className="stack">{head}<ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;

  const d = q.data;
  const f = d.finance;
  const totalRate = f ? rate(f.total_collected, f.total_charged) : null;
  const monthRate = f ? rate(f.month_collected, f.month_charged) : null;
  const shownRate = period === "month" ? monthRate : totalRate;
  const otherRate = period === "month" ? totalRate : monthRate;
  const rateTone = shownRate === null ? undefined : Number(shownRate) >= 90 ? "ok" : Number(shownRate) >= 70 ? "warn" : "danger";
  const charged = f ? (period === "month" ? f.month_charged : f.total_charged) : "0";
  const collected = f ? (period === "month" ? f.month_collected : f.total_collected) : "0";

  // "Bugün ne yapmalıyım?" — panonun tepesinde sayı değil, eylem durur (referans).
  const actions: { tone: Tone; title: string; body: string; to: string; link: string }[] = [];
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

  const openTotal = d.requests ? d.requests.open + d.requests.in_progress + d.requests.waiting : 0;

  return (
    <div className="stack">
      {head}

      {f && (
        <div className="grid grid--kpi rise">
          <Kpi
            label="Tahsilat oranı"
            tone={rateTone}
            icon={<TrendingUp aria-hidden="true" />}
            value={formatPercent(shownRate)}
            delta={otherRate !== null ? { tone: "info", label: `${period === "month" ? "toplam" : "bu ay"} ${formatPercent(otherRate)}` } : undefined}
          />
          <Kpi label="Açık bakiye" tone="danger" icon={<Wallet aria-hidden="true" />} value={formatMoneyShort(f.open_balance)} note={`${f.debtor_count} borçlu hesap`} />
          <Kpi label={period === "month" ? "Bu ay tahakkuk" : "Toplam tahakkuk"} icon={<ReceiptText aria-hidden="true" />} value={formatMoneyShort(charged)} note={`${formatMoneyShort(collected)} tahsil edildi`} />
          {d.cash_balance !== null && d.cash_balance !== undefined ? (
            <Kpi label="Kasa ve banka" tone="accent" icon={<Landmark aria-hidden="true" />} value={formatMoneyShort(d.cash_balance)} note="tüm hesapların toplamı" />
          ) : (
            d.requests && <Kpi label="Açık talep" icon={<Wrench aria-hidden="true" />} value={openTotal} />
          )}
        </div>
      )}

      <div>
        <div className="attn-head">
          <div className="section-title">Bugün ilgilenilmesi gerekenler</div>
          <span className="attn-head__count" aria-label={`${actions.length} madde`}>{actions.length}</span>
        </div>
        <div className="attn rise">
          {actions.length > 0 ? (
            actions.map((a) => <Attention key={a.title} {...a} />)
          ) : (
            <Attention tone="ok" title="Acil ilgilenilmesi gereken bir şey yok" body="Acil talep ve 30 günü aşan borç bulunmuyor." />
          )}
        </div>
      </div>

      <div className="grid grid--main">
        <div className="stack">
          {f && (
            <div className="card">
              <div className="card__head">
                <span className="card__icon card__icon--danger"><AlertTriangle aria-hidden="true" /></span>
                <span className="card__title">En yüksek borçlular</span>
                <Link className="card__more" to={`${base}/borclular`}>Tümü</Link>
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
                              <div className="cell-person">
                                <Avatar name={a.person_name} size="sm" soft />
                                <div>
                                  <div className="cell-main">{a.person_name ?? "—"}</div>
                                  <div className="cell-sub mono">{a.reference_code}</div>
                                </div>
                              </div>
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

          {d.expenses && can(P.expensesRead) && (
            <div className="card">
              <div className="card__head">
                <span className="card__icon card__icon--info"><Inbox aria-hidden="true" /></span>
                <span className="card__title">Son giderler</span>
                <Link className="card__more" to={`${base}/giderler`}>Tümü</Link>
              </div>
              <div className="card__body card__body--flush">
                {d.expenses.length === 0 ? (
                  <p className="small muted" style={{ padding: "var(--s-5)" }}>Henüz gider kaydı yok.</p>
                ) : (
                  <ul className="txn">
                    {d.expenses.map((e) => (
                      <li key={e.id}>
                        <span className={`txn__icon ${e.is_paid ? "txn__icon--ok" : "txn__icon--warn"}`} aria-hidden="true">
                          <Inbox />
                        </span>
                        <div className="txn__main">
                          <div className="txn__title">{e.description}</div>
                          <div className="txn__sub">{formatDate(e.date)} · {e.is_paid ? "Ödendi" : "Ödenmedi"}</div>
                        </div>
                        <span className="txn__amount"><Money value={e.amount} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          {d.requests && (
            <div className="card">
              <div className="card__head">
                <span className="card__icon card__icon--warn"><Wrench aria-hidden="true" /></span>
                <span className="card__title">Talepler</span>
                <Link className="card__more" to={`${base}/talepler`}>Tümü</Link>
              </div>
              <div className="card__body">
                <Donut
                  label="Talep durumları"
                  centerSub="açık talep"
                  segments={[
                    { label: "Açık", value: d.requests.open },
                    { label: "İşlemde", value: d.requests.in_progress },
                    { label: "Beklemede", value: d.requests.waiting },
                  ]}
                />
                {d.requests.urgent > 0 && (
                  <p className="small mb-0 mt-4">
                    <Badge tone="danger">{d.requests.urgent} acil</Badge> <span className="muted">öncelikli talep bekliyor.</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {d.announcements && (
            <div className="card">
              <div className="card__head">
                <span className="card__icon card__icon--accent"><Megaphone aria-hidden="true" /></span>
                <span className="card__title">Duyurular</span>
                <Link className="card__more" to={`${base}/duyurular`}>Tümü</Link>
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
        </div>
      </div>
    </div>
  );
}
