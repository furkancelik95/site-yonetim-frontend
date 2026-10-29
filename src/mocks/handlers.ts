// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Şu an sahte uç yok: bütün paketler (servis istekleri 01–84, P03b finans motoru) backend'de.
// Kapı/plaka sahte uçlarının kullandığı ortak alan ve araç önbelleği de kaldırıldı (29.10.2026).
import type { RequestHandler } from "msw";

export const handlers: RequestHandler[] = [];
