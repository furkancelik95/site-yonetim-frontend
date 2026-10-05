import { useState } from "react";
import { Link } from "react-router";
import { Search, Wallet } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Empty, ErrorState, Loading, Money, PageHead, Pager } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { accountKind, paymentMethod } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Account = Schemas["site_yonetim__api__v1__payments__AccountOut"];
type Payment = Schemas["PaymentListItem"];

export function PaymentsPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ from: "", to: "", page: "1" });
  const payments = useSiteGet<Page<Payment>>("/payments", { from: s.from, to: s.to, page: s.page, page_size: 50 });

  return (
    <div className="stack">
      <PageHead title="Tahsilat" subtitle="Tahsilat girmek için hesabı bulun; tutar en eski borçtan başlayarak kapatılır." actions={can(P.paymentRecord) && <><Link className="btn" to={`/s/${site.slug}/banka-aktarim`}>Banka ekstresinden aktar</Link><Link className="btn" to={`/s/${site.slug}/tahsilat/toplu`}>Toplu tahsilat</Link></>} />

      {can(P.paymentRecord) && <AccountFinder slug={site.slug} />}

      <div className="card">
        <div className="card__head">
          <span className="card__title">Son tahsilatlar</span>
          <div className="filters ml-auto" style={{ gap: "var(--s-2)" }}>
            <div className="field" style={{ minWidth: "9rem" }}>
              <label className="field__label" htmlFor="p-from">Başlangıç</label>
              <input id="p-from" className="field__input" type="date" value={s.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="field" style={{ minWidth: "9rem" }}>
              <label className="field__label" htmlFor="p-to">Bitiş</label>
              <input id="p-to" className="field__input" type="date" value={s.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="card__body card__body--flush">
          {payments.isPending ? (
            <Loading />
          ) : payments.isError ? (
            <div className="card__body"><ErrorState error={payments.error} onRetry={() => payments.refetch()} /></div>
          ) : payments.data.items.length === 0 ? (
            <Empty title="Bu aralıkta tahsilat yok" icon={<Wallet aria-hidden="true" />} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Tahsilatlar</caption>
                <thead>
                  <tr>
                    <th scope="col">Tarih</th>
                    <th scope="col">Bölüm</th>
                    <th scope="col">Kişi</th>
                    <th scope="col">Yöntem</th>
                    <th scope="col">Kaydeden</th>
                    <th scope="col" className="right">Tutar</th>
                    <th scope="col"><span className="visually-hidden">Makbuz</span></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.items.map((p) => (
                    <tr key={p.id}>
                      <td className="small nowrap">{formatDate(p.date)}</td>
                      <td>
                        <Link className="cell-main" to={`/s/${site.slug}/cari/${p.ledger_account_id}`}>{p.unit_name}</Link>
                        <div className="cell-sub mono">{p.reference_code}</div>
                      </td>
                      <td>{p.person_name ?? "—"}</td>
                      <td className="small">
                        {paymentMethod(p.method)}
                        {p.reference && <div className="cell-sub">{p.reference}</div>}
                      </td>
                      <td className="small">{p.created_by_name ?? "—"}</td>
                      <td className="right"><Money value={p.amount} /></td>
                      <td className="right"><Link className="btn btn--ghost btn--sm" to={`/s/${site.slug}/makbuz/${p.id}`}>Makbuz</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {payments.data && (
          <div className="card__foot">
            <Pager page={payments.data.page} pageSize={payments.data.page_size} total={payments.data.total} onPage={(p) => set({ page: String(p) })} />
          </div>
        )}
      </div>
    </div>
  );
}

function AccountFinder({ slug }: { slug: string }) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const r = useSiteGet<Page<Account>>("/accounts", { q, page_size: 10 }, { enabled: q.length >= 1 });

  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Hesap bul</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <div className="field">
          <label className="field__label" htmlFor="acc-q">Bölüm, kişi ya da referans kodu</label>
          <div className="field__wrap">
            <input id="acc-q" className="field__input" type="search" placeholder="ör. A-4, Yılmaz, A4-O" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </div>
        </div>
        {q && r.data && (
          r.data.items.length === 0 ? (
            <p className="small muted mb-0">Uyan hesap yok.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Arama sonucu cari hesaplar</caption>
                <tbody>
                  {r.data.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="cell-main">{a.unit_name} · {accountKind(a.kind)}</div>
                        <div className="cell-sub">{a.person_name ?? "—"} · <span className="mono">{a.reference_code}</span></div>
                      </td>
                      <td className="right"><Money value={a.balance} tone="balance" /></td>
                      <td className="right"><Link className="btn btn--sm" to={`/s/${slug}/cari/${a.id}`}>Tahsilat gir</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {!q && <p className="small muted mb-0"><Search aria-hidden="true" size={14} style={{ verticalAlign: "-2px" }} /> Aramaya başlayın.</p>}
      </div>
    </div>
  );
}
