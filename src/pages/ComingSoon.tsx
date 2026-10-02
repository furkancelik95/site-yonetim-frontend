import { Hammer } from "lucide-react";
import { Empty, PageHead } from "../components/ui";

/** Henüz yapılmamış ekran. Menüdeki bağlantı boşa çıkmasın diye ne olduğunu söyler. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="stack">
      <PageHead title={title} />
      <div className="card">
        <Empty title="Bu ekran hazırlanıyor" icon={<Hammer aria-hidden="true" />}>
          Servisi hazır; arayüzü sıradaki geliştirme adımında eklenecek.
        </Empty>
      </div>
    </div>
  );
}
