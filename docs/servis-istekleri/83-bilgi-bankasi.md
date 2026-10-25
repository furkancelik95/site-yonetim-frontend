# [Servis] Bilgi bankası ve bağlamsal yardım

Kaynak: Yazılım Dokümanı **PYN-06** ve **19.3** (bilgi bankası).

## Ekran
- **Yardım** (`/yardim`, her site personeli): arama; `?ekran=…` ile o ekranın makaleleri; makale metni; "Faydalı mı? Evet/Hayır".
- **Platform → Bilgi bankası** (`/yonetim/bilgi-bankasi`): makale yaz/düzenle (başlık, okuyucu: personel / sakin SSS, ilgili
  ekranlar, metin); faydalı/faydasız sayıları; faydasız ağır basanlar "Güncellenmeli".

## Uç nokta
- `GET /api/v1/knowledge-articles?q=&screen=&audience=` (belgede `GET /api/v1/knowledge-articles?screen=`)
- `POST /api/v1/knowledge-articles/{id}/feedback` — `{ helpful: bool }`
- `POST /api/v1/platform/knowledge-articles` · `PATCH …/{id}` — `{ title, body, audience: "staff|resident", screens: ["satin-alma", …] }`

## İş kuralları
- Makale tüm tesisler için ortak (platform içeriği). Ekran eşleşmesi yol önekiyle (`satin-alma` → `/s/{slug}/satin-alma…`).
- Başlık ≥ 5, metin ≥ 30 karakter. Rol ve dil varyantı (TR + EN) sonra; sakin SSS bölümü sakin uygulamasında gösterilecek.
- Ekranlarda "?" bağlamsal yardım düğmesi ve "Yenilikler" (sürüm notları), eğitim videoları sonraki adım.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alanlar | 422 `fields.title/body/audience` | "Makale en az 30 karakter." |
| Platform dışı yazma | 404 `not_found` | … |

## Yetki
Okuma tüm kullanıcılar; yazma platform yöneticisi / destek ekibi.
