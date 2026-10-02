import { FlaskConical } from "lucide-react";

/**
 * Ekranın kullandığı servis henüz backend'de yoksa (MSW ile taklit ediliyorsa) bunu açıkça söyler.
 * Yalnız geliştirmede görünür; servis gelince kullanıldığı yerden kaldırılır.
 */
export function MockBadge({ request }: { request: string }) {
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === "false") return null;
  return (
    <span className="badge badge--warn" title={`Servis isteği ${request} — backend'de henüz yok, sahte servisle çalışıyor`}>
      <FlaskConical aria-hidden="true" /> Sahte servis · {request}
    </span>
  );
}
