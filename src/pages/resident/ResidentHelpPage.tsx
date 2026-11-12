import { HelpCircle } from "lucide-react";
import { useHelpArticles } from "../../components/ContextHelp";
import { ResidentHead } from "../../components/ResidentHead";
import { Empty, ErrorState, Loading, useDocumentTitle } from "../../components/ui";

/** Sıkça sorulanlar (test raporu #7): bilgi bankasındaki sakin makaleleri (audience=resident). */
export function ResidentHelpPage() {
  useDocumentTitle("Sıkça sorulanlar");
  const q = useHelpArticles(null, "resident");
  return (
    <>
      <ResidentHead icon={<HelpCircle />} title="Sıkça sorulanlar" sub="Site ve uygulamayla ilgili sık sorulan sorular ve yanıtları. Cevabını bulamadığınız konu için Taleplerim'den yazabilirsiniz."
        stats={q.data && [{ label: "Soru", value: q.data.length }]} />
      <div className="r-wide stack" style={{ gap: "var(--s-3)" }}>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? (
          <Empty title="Henüz soru eklenmedi" icon={<HelpCircle aria-hidden="true" />}>Yönetim sık sorulan soruları eklediğinde burada görünür.</Empty>
        ) : q.data.map((a) => (
          <details key={a.id} className="card">
            <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">{a.title}</span></summary>
            <div className="card__body"><p className="mb-0" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{a.body}</p></div>
          </details>
        ))}
      </div>
    </>
  );
}
