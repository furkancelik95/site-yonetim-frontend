import { useQuery } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { useLocation } from "react-router";
import { get } from "../api/client";
import type { Page, Schemas } from "../api/types";

export type HelpArticle = Schemas["KnowledgeArticleOut"];

/**
 * Ekran anahtarı: site içi yol, baştaki "/s/{slug}/" atılmış hâli ("satin-alma/talepler").
 * Kimlik (uuid) ve sayı parçaları düşer, ayrıntı sayfası üst ekranın makalelerini alır.
 * Backend önek eşleştirir: "satin-alma" makalesi "satin-alma/talepler"de de görünür.
 */
export function useScreenKey(): string | null {
  const { pathname } = useLocation();
  const m = /^\/s\/[^/]+\/(.+?)\/?$/.exec(pathname);
  if (!m) return null;
  const parts = m[1]!.split("/").filter((p) => p && !/^[0-9a-f-]{8,}$/i.test(p) && !/^\d+$/.test(p));
  return parts.length ? parts.join("/") : null;
}

/** Bilgi bankası makaleleri (GET /knowledge-articles?screen=&audience=). Hata sessiz: yardım yoksa hiçbir şey çizilmez. */
export function useHelpArticles(screen: string | null, audience: "staff" | "resident") {
  return useQuery({
    queryKey: ["kb", "context", audience, screen],
    queryFn: async () => (await get<Page<HelpArticle>>("/knowledge-articles", { screen: screen ?? undefined, audience, page_size: 50 })).items,
    enabled: audience === "resident" || !!screen,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Sayfa başlığında "Bu ekran için yardım": yalnız bu ekrana bağlı makale varsa görünür (test raporu #7). */
export function ContextHelp() {
  const screen = useScreenKey();
  const q = useHelpArticles(screen, "staff");
  const items = q.data ?? [];
  if (!screen || items.length === 0) return null;
  return (
    <details className="ctx-help">
      <summary className="ctx-help__toggle">
        <HelpCircle aria-hidden="true" /> Bu ekran için yardım <span className="ctx-help__count">{items.length}</span>
      </summary>
      <div className="ctx-help__panel">
        {items.map((a) => (
          <details key={a.id} className="ctx-help__item">
            <summary>{a.title}</summary>
            <p>{a.body}</p>
          </details>
        ))}
      </div>
    </details>
  );
}
