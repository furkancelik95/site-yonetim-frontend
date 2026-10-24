# [Servis] Denetim (kontrol) listeleri

Kaynak: Yazılım Dokümanı **OPS-03**.

## Ekran
**Denetim Listeleri** (`/denetimler`): sekmeler **Yeni denetim** (şablon, konum, maddeler: evet/hayır, sayı (min–maks), puan
1–5; fotoğraf zorunlu maddeler; olumsuz maddeler için otomatik talep), **Geçmiş** (skor, olumsuz sayısı, açılan
talepler, fotoğraflar), **Şablonlar** (ekle/düzenle/pasifleştir).

## Uç nokta
- `GET …/checklist-templates` · `POST` · `PATCH …/{id}` — `{ name, items: [{ text, type: "yesno|number|score", photo_required, min, max }], is_active }`
- `GET …/inspections` · `POST …/inspections` — `{ template_id, location, answers: [{ value, photo }], open_requests: true }`

Denetim: `{ id, template_id, template_name, location, answers: [{ text, type, value, ok, photo }], score (0–100), failed, opened_request_ids, by, at }`.

## İş kuralları
- Varsayılan şablonlar: Temizlik kalitesi, Havuz hijyeni (klor 1–3 ppm, pH 7,2–7,8), Taşınma hasar kontrolü.
- Uygunluk: evet/hayır → "evet"; sayı → min/maks aralığında; puan → ≥ 3. Skor = uygun madde oranı.
- `open_requests` (varsayılan true; ekran göndermiyor) true ise her olumsuz madde için **ortak alan talebi** açılır (başlık "Denetim: madde", açıklamada şablon,
  konum ve değer); talep kimlikleri denetime bağlanır.
- Fotoğraf: şimdilik küçültülmüş görsel (veri adresi); belge modülü gelince dosya deposuna yüklenip adres saklanmalı.
- Taşınma hasar kontrolü tadilat/taşınma (istek 52) tamamlamasına bağlanabilir (sonraki adım).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Şablon/konum | 422 `fields.template_id/location` | … |
| Yanıtsız madde | 422 `fields.answers.{i}` | "Yanıtlayın." |
| Fotoğraf zorunlu | 422 `fields.answers.{i}` | "Bu madde için fotoğraf zorunlu." |
| Şablon alanları | 422 `fields.name/items` | … |

## Yetki
`requests.assign`.
