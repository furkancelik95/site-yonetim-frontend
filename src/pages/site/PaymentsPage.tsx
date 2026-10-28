import { useState } from "react";
import { Link } from "react-router";
import { Banknote, CreditCard, Landmark, Search, Wallet } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Avatar, Empty, ErrorState, IconChip, Loading, Money, PageHead, Pager } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { accountKind, paymentMethod } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { CollectionChart, CollectionKpis, type Collections } from "./CollectionStats";

type Account = Schemas["site_yonetim__api__v1__payments__AccountOut"];
type Payment = Schemas["PaymentListItem"];

/** Ödeme yöntemi ikonu (dekoratif; yöntem adı yanında yazılı) */
function MethodIcon({ method }: { method: string }) {
  const Icon = method === "cash" ? Banknote : method === "credit_card" ? CreditCard : method === "bank_transfer" ? Landmark : Wallet;
  return <Icon aria-hidden="true" />;
}

export function PaymentsPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ from: "", to: "", page: "1" });
  const payments = useSiteGet<Page<Payment>>("/payments", { from: s.from, to: s.to, page: s.page, page_size: 50 });
  const showStats = can(P.financeRead);
  const coll = useSiteGet<Collections>("/reports/collections", {}, { enabled: showStats });
  const canFind = can(P.paymentRecord);

  return (
    <div className="stack">
      <PageHead
        title="Tahsilat"
        subtitle="Tahsilat girmek için hesabı bulun; tutar en eski borçtan başlayarak kapatılır."
        band
        actions={canFind && <>{can(P.cashManage) && <Link className="btn" to={`/s/${site.slug}/banka-aktarim`}>Banka ekstresinden aktar</Link>}<Link className="btn btn--primary" to={`/s/${site.slug}/tahsilat/toplu`}>Toplu tahsilat</Link></>}
      />

      {showStats && !coll.isError && <CollectionKpis data={coll.data} />}

      {showStats && coll.data && coll.data.periods.length > 0 ? (
        <div className="grid grid--main">
          <CollectionChart data={coll.data} />
          {canFind && <AccountFinder slug={site.slug} />}
        </div>
      ) : (
        canFind && <AccountFinder slug={site.slug} />
      )}

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--ok"><Wallet aria-hidden="true" /></span>
          <div>
            <div className="card__title">Son tahsilatlar</div>
            {payments.data && <div className="card__meta">{payments.data.total} kayıt</div>}
          </div>
          <div className="card__tools">
            <div className="field">
              <label className="field__label" htmlFor="p-from">Başlangıç</label>
              <input id="p-from" className="field__input" type="date" value={s.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="field">
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
                    <th scope="col" className="hide-sm">Kaydeden</th>
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
                      <td><div className="cell-person"><Avatar name={p.person_name} size="sm" soft /><span>{p.person_name ?? "—"}</span></div></td>
                      <td className="small">
                        <div className="cell-person">
                          <IconChip tone="ok"><MethodIcon method={p.method} /></IconChip>
                          <div>
                            {paymentMethod(p.method)}
                            {p.reference && <div className="cell-sub">{p.reference}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="small hide-sm">{p.created_by_name ?? "—"}</td>
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
      <div className="card__head">
        <span className="card__icon card__icon--accent"><Search aria-hidden="true" /></span>
        <span className="card__title">Hesap bul ve tahsilat gir</span>
      </div>
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
