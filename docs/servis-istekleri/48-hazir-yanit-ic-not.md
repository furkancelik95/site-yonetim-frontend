# [Servis] Hazır yanıt şablonları ve iç not

Kaynak: Yazılım Dokümanı **HIZ-02**, §12.3. Açık karar **K26** (talep yorumu ile iç not): mevcut yorumlar sakine de
görünüyor; iç not bu istekle **ayrı kayıt** olarak eklenir, sakin kanalında hiç dönmez.

## Ekran
- **Talep ayrıntısı**: yorum kutusunun üstünde **Hazır yanıt** seçimi (kategoriye uygun şablonlar; değişkenler doldurulur);
  **İç notlar** kartı ("İç not" etiketli, "sakin görmez").
- **Talep ayarları → Hazır yanıtlar**: başlık, kategori (boş = tümü), metin, etkin.

## Uç nokta
- `GET/POST …/reply-templates`, `PATCH …/reply-templates/{id}` — `{ title, category, body, is_active }`
- `GET/POST …/requests/{id}/internal-notes` — `{ body }` → `{ id, body, by, at }`

## İş kuralları
- Değişkenler: `{{sakin.ad}}`, `{{talep.no}}`, `{{talep.konu}}` — şablon seçilince ekranda doldurulur, personel düzenleyip
  gönderir (yorum olarak). Dil varyantı çeviri modülüyle.
- **İç not:** yalnız personel rolleri okur/yazar; `resident/*` uçlarında, bildirimlerde ve sakin PDF'inde **hiç dönmez**;
  personel PDF'inde "İç not" etiketiyle ayrışır. Denetim kaydına yazılır, silinmez.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Şablon alanları | 422 `fields.title/body/category` | "Formda düzeltilmesi gereken alanlar var." |
| Boş not | 422 `fields.body` | "Not yazın." |

## Yetki
İç not ve şablon kullanımı `requests.assign`; şablon yönetimi `requests.assign` (öneri `requests.settings`).
