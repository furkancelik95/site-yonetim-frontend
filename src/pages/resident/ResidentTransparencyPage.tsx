import { useState } from "react";
import { Link, useParams } from "react-router";
import { FileBarChart } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { ResidentHead } from "../../components/ResidentHead";
import { TransparencyContentView } from "../../components/TransparencyReport";
import { Empty, ErrorState, Loading, Pager, useDocumentTitle } from "../../components/ui";
import { useSite } from "../../site/SiteContext";
import { formatDate } from "../../lib/format";

type Report = Schemas["ResidentTransparencyReportOut"];

/** Şeffaflık raporu (RAP-02, K32): yönetimin onaylayıp yayınladığı aylık gelir–gider özeti.
 * Kişi ve bölüm bilgisi içermez; tek tek gider ve fatura görüntüsü artık sakine açık değil. */
export function ResidentTransparencyPage() {
  useDocumentTitle("Şeffaflık raporu");
  const { site } = useSite();
  const [page, setPage] = useState(1);
  const q = useSiteGet<Page<Report>>("/resident/transparency-reports", { page, page_size: 6 });
  return (
    <>
      <ResidentHead icon={<FileBarChart />} title="Şeffaflık raporu" sub="Sitenin aylık gelir–gider özeti. Yönetim kurulunun onayladığı kapsamda yayınlanır; kişi ve bölüm bilgisi içermez."
        stats={q.data && [
          { label: "Yayınlanan rapor", value: q.data.total },
          { label: "Son dönem", value: q.data.items[0]?.period ?? "—" },
        ]} />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.items.length === 0 ? (
        <div className="r-wide"><Empty title="Henüz yayınlanmış rapor yok" icon={<FileBarChart aria-hidden="true" />}>Yönetim bir aylık rapor yayınladığında burada görünür.</Empty></div>
      ) : (
        <div className="r-wide stack" style={{ gap: "var(--s-3)" }}>
          {q.data.items.map((r) => (
            <article key={r.id} className="card">
              <div className="card__head"><h2 className="card__title" style={{ margin: 0 }}><Link to={`/sakin/${site.slug}/seffaflik/${r.id}`}>{r.period}</Link></h2><span className="card__meta ml-auto">yayın {formatDate(r.published_at)}</span></div>
              <div className="card__body"><TransparencyContentView c={r.content} note={r.note} /></div>
            </article>
          ))}
          <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} />
        </div>
      )}
    </>
  );
}

/** Tek rapor (GET /resident/transparency-reports/{id}); bildirimdeki bağlantı buraya gelir. Yayında değilse 404. */
export function ResidentTransparencyReportPage() {
  const { reportId = "" } = useParams();
  const { site } = useSite();
  const q = useSiteGet<Report>(`/resident/transparency-reports/${reportId}`);
  useDocumentTitle(q.data ? `Şeffaflık raporu · ${q.data.period}` : "Şeffaflık raporu");
  return (
    <div className="r-wide stack" style={{ gap: "var(--s-3)" }}>
      <Link className="small" to={`/sakin/${site.slug}/seffaflik`}>Tüm raporlar</Link>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <article className="card">
          <div className="card__head"><h1 className="card__title" style={{ margin: 0 }}>{q.data.period}</h1><span className="card__meta ml-auto">yayın {formatDate(q.data.published_at)}</span></div>
          <div className="card__body"><TransparencyContentView c={q.data.content} note={q.data.note} /></div>
        </article>
      )}
    </div>
  );
}
