import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Printer } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, ErrorState, Loading, Money, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";
import { accountKind, paymentMethod } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Receipt = Schemas["ReceiptOut"];

/** Borçsuzluk belgesi — `GET …/clearance-certificates/{id}` (servis isteği 01, backend #24). */
export type Certificate = Schemas["CertificateOut"];

function PrintBar({ back, children }: { back: string; children?: ReactNode }) {
  return (
    <div className="row row--between print-hide" style={{ gap: "var(--s-2)" }}>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <Link className="btn" to={back}>Geri</Link>
        {children}
      </div>
      <button className="btn btn--primary" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır / PDF</button>
    </div>
  );
}

/** Tahsilat makbuzu — GET /payments/{id} (backend'de var). Numara henüz yok (açık karar K15). */
export function ReceiptPage() {
  useDocumentTitle("Tahsilat makbuzu");
  const { paymentId = "" } = useParams();
  const { site } = useSite();
  const q = useSiteGet<Receipt>(`/payments/${paymentId}`);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const address = [r.site.address, r.site.district, r.site.city].filter(Boolean).join(", ");

  return (
    <div className="stack page--narrow">
      <PrintBar back={`/s/${site.slug}/cari/${r.account.id}`} />
      {!r.receipt_number && (
        <Alert tone="info" title="Makbuz numarası yok">
          Numaralandırma kuralı mali müşavir kararını bekliyor (açık karar K15). Belge, tahsilatın kaydını gösterir.
        </Alert>
      )}
      <article className="card doc-print">
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <header className="row row--between" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="strong">{r.site.name}</div>
              {address && <div className="small muted">{address}</div>}
            </div>
            <div className="right">
              <div className="section-title" style={{ margin: 0 }}>Tahsilat makbuzu</div>
              <div className="mono small">{r.receipt_number ?? "—"}</div>
              <div className="small">{formatDate(r.payment.date)}</div>
            </div>
          </header>

          <div>
            <div className="kv"><span className="kv__k">Ödeyen</span><span className="kv__v">{r.account.person_name ?? "—"}</span></div>
            <div className="kv"><span className="kv__k">Bölüm / hesap</span><span className="kv__v">{r.account.unit_name} · {accountKind(r.account.kind)} <span className="mono">{r.account.reference_code}</span></span></div>
            <div className="kv"><span className="kv__k">Ödeme yöntemi</span><span className="kv__v">{paymentMethod(r.payment.method)}{r.payment.reference ? ` · ${r.payment.reference}` : ""}</span></div>
            <div className="kv"><span className="kv__k strong">Tutar</span><span className="kv__v strong"><Money value={r.payment.amount} /></span></div>
          </div>

          <div>
            <div className="section-title">Kapatılan borçlar</div>
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Bu tahsilatla kapatılan borç kayıtları</caption>
                <thead><tr><th scope="col">Açıklama</th><th scope="col">Vade</th><th scope="col" className="right">Tutar</th></tr></thead>
                <tbody>
                  {r.allocations.length === 0 && <tr><td colSpan={3} className="small muted">Açık borç yoktu; tutarın tamamı avans.</td></tr>}
                  {r.allocations.map((a) => (
                    <tr key={a.ledger_entry_id}><td>{a.description}</td><td className="small nowrap">{formatDate(a.due_date)}</td><td className="right"><Money value={a.amount} /></td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={2}>Borca sayılan</td><td className="right"><Money value={r.applied} /></td></tr>
                  {Number(r.unapplied) > 0 && <tr><td colSpan={2}>Avans (sonraki borca sayılır)</td><td className="right"><Money value={r.unapplied} /></td></tr>}
                </tfoot>
              </table>
            </div>
          </div>

          <footer className="row row--between small muted">
            <span>Kaydeden: {r.payment.created_by_name ?? "—"} · {formatDateTime(r.payment.created_at)}</span>
            <span>Bu belge elektronik ortamda düzenlenmiştir.</span>
          </footer>
        </div>
      </article>
    </div>
  );
}

/** Borçsuzluk belgesi — servis isteği 01. Belge değişmez; bakiye belge anındaki defterden. */
export function ClearanceCertificatePage() {
  useDocumentTitle("Borçsuzluk belgesi");
  const { certificateId = "" } = useParams();
  const { site } = useSite();
  const q = useSiteGet<Certificate>(`/clearance-certificates/${certificateId}`);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;

  return (
    <div className="stack page--narrow">
      <PrintBar back={`/s/${site.slug}/cari/${c.account.id}`} />
      <article className="card doc-print">
        <div className="card__body stack" style={{ gap: "var(--s-5)" }}>
          <header className="row row--between" style={{ alignItems: "flex-start" }}>
            <div className="strong">{c.site.name}</div>
            <div className="right">
              <div className="mono small">{c.number}</div>
              <div className="small">{formatDate(c.as_of)}</div>
            </div>
          </header>
          <h1 style={{ textAlign: "center", margin: 0 }}>Borçsuzluk Belgesi</h1>
          <p style={{ lineHeight: 1.8 }}>
            {c.site.name} <strong>{c.account.unit_name}</strong> numaralı bağımsız bölümün{" "}
            <strong>{accountKind(c.account.kind).toLocaleLowerCase("tr-TR")}</strong> hesabının (
            <span className="mono">{c.account.reference_code}</span>
            {c.account.person_name ? `, ${c.account.person_name}` : ""}) {formatDate(c.as_of)} tarihi itibarıyla site yönetimine
            borcu bulunmamaktadır. Hesap bakiyesi: <strong>{formatMoney(c.balance)}</strong>.
          </p>
          <p className="small muted mb-0">
            Bu belge {formatDate(c.valid_until)} tarihine kadar geçerlidir. Belge tarihinden sonra tahakkuk eden borçları kapsamaz.
          </p>
          <footer className="row row--between" style={{ marginTop: "var(--s-8)" }}>
            <span className="small">Düzenleyen: {c.issued_by}<br />{formatDateTime(c.issued_at)}</span>
            <span className="small" style={{ borderTop: "1px solid var(--line-strong)", paddingTop: "var(--s-2)", minWidth: "12rem", textAlign: "center" }}>
              Site Yönetimi<br />İmza / Kaşe
            </span>
          </footer>
        </div>
      </article>
    </div>
  );
}
