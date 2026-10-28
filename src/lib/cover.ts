/**
 * Site kapak ve başlık fotoğrafları. Backend'de siteye bağlı görsel alanı yok; her site
 * kimliğinden kararlı bir seçim yapılır, böylece Portföy kartı ile sitenin Bugün ekranı
 * aynı fotoğrafı gösterir.
 *
 * Fotoğraflar Unsplash (Unsplash License — ticari kullanım dahil serbest):
 *   1: Scott Webb — photo-1570129477492-45c003edd2be
 *   2: Vita Vilcina — photo-1564013799919-ab600027ffc6
 *   3: Daniel Barnes — photo-1580587771525-78b9dba3b914
 * Dosyalar: public/img/hero-N.webp (1600×720), public/img/cover-N.webp (900×500).
 */
const COUNT = 3;

function pick(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % COUNT) + 1;
}

/** Bugün ekranındaki geniş başlık bandı fotoğrafı */
export function heroUrl(siteId: string): string {
  return `/img/hero-${pick(siteId)}.webp`;
}

/** Portföy kartı kapak fotoğrafı */
export function coverUrl(siteId: string): string {
  return `/img/cover-${pick(siteId)}.webp`;
}
