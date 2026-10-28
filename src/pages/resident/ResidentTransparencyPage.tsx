import { useState } from "react";
import { FileBarChart } from "lucide-react";
import { useSiteGet } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { TransparencyContentView } from "../../components/TransparencyReport";
import { Empty, ErrorState, Loading, Pager, useDocumentTitle } from "../../components/ui";
import { formatDate } from "../../lib/format";

type Report = Schemas["ResidentTransparencyReportOut"];

/** Şeffaflık raporu (RAP-02, K32): yönetimin onaylayıp yayınladığı aylık gelir–gider özeti.
 * Kişi ve bölüm bilgisi içermez; tek tek gider ve fatura görüntüsü artık sakine açık değil. */
export function ResidentTransparencyPage() {
  useDocumentTitle("Şeffaflık raporu");
  const [page, setPage] = useState(1);
  const q = useSiteGet<Page<Report>>("/resident/transparency-reports", { page, page_size: 6 });
  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}>Şeffaflık raporu</div>
      <p className="small muted">Sitenin aylık gelir–gider özeti. Yönetim kurulunun onayladığı kapsamda yayınlanır; kişi ve bölüm bilgisi içermez.</p>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.items.length === 0 ? (
        <Empty title="Henüz yayınlanmış rapor yok" icon={<FileBarChart aria-hidden="true" />} />
      ) : (
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          {q.data.items.map((r) => (
            <article key={r.id} className="card">
              <div className="card__head"><h2 className="card__title" style={{ margin: 0 }}>{r.period}</h2><span className="card__meta ml-auto">yayın {formatDate(r.published_at)}</span></div>
              <div className="card__body"><TransparencyContentView c={r.content} note={r.note} /></div>
            </article>
          ))}
          <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} />
        </div>
      )}
    </>
  );
}
