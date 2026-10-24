// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Şu an sahte uç yok: servis istekleri 01–18 backend'de (01–05: #24–#28, 06–18: #35–#46).
import type { RequestHandler } from "msw";

export const handlers: RequestHandler[] = [];
