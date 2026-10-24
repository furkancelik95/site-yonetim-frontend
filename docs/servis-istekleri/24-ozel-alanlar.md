# [Servis] Özel alanlar (bölüm ve kişi kartına ek alan)

Kaynak: Yazılım Dokümanı **YAP-10** (Özel alanlar).

## Ekran
- **Özel alanlar** (`/ayarlar/ozel-alanlar`): bölüm / kişi sekmesi; ekle, düzenle, arşivle (silme yok); arşivdekileri göster.
  Tip, KVKK kategorisi, görebilen/düzenleyebilen roller, zorunlu, sakin görür/düzenler.
- **Bölüm kartı → Özel alanlar** sekmesi ve **Kişiler → düzenle** formunda değer girişi (rol yetkisine göre).

## Uç nokta
- `GET  /api/v1/sites/{slug}/custom-fields?entity=unit|person&archived=false` — dizi
- `POST /api/v1/sites/{slug}/custom-fields`, `PATCH …/custom-fields/{id}`, `POST …/custom-fields/{id}/archive`
- `GET/PUT /api/v1/sites/{slug}/units/{id}/custom-values`, `GET/PUT …/people/{id}/custom-values`

## İstek / yanıt
Alan:
```json
{ "entity": "unit", "label": "Evcil hayvan", "type": "select", "options": ["Yok", "Kedi", "Köpek"],
  "required": false, "kvkk_category": "other",
  "view_roles": ["Yönetici", "Güvenlik"], "edit_roles": ["Yönetici"],
  "resident_can_view": true, "resident_can_edit": true, "sort_order": 1, "acknowledge_sensitive": false }
```
Yanıt: + `id`, `key` (etiketten üretilen, değişmez), `is_archived`. `type`: `text | number | date | bool | select`;
`kvkk_category`: `identity | contact | finance | location_plate | other`.

Değerler: `GET` → `{ "values": { "evcil_hayvan": "Kedi" } }`; `PUT` aynı şekil (yalnız gönderilen anahtarlar değişir,
boş değer siler).

## İş kuralları
- Tesis başına nesne türünde en fazla **30** etkin alan (409 `field_limit`). Tip sonradan değişmez (422); etiket değişir,
  `key` sabit kalır.
- **Özel nitelikli veri koruması (KVKK m.6):** etikette sağlık, din, etnik köken, siyasi, sendika, cinsel, ceza/sabıka,
  biyometrik/genetik, kan grubu çağrışımı varsa 422 `sensitive_label`; `acknowledge_sensitive=true` ile gerekçeyle geçilir,
  bu da denetim kaydına yazılır.
- Görünürlük rol bazlı: `view_roles` dışındaki roller alanı yanıtta görmez; `edit_roles` dışındakiler PUT'ta 403.
  Sakin: `resident_can_view/edit` (`resident_can_edit` ⇒ `view`).
- `required` yeni kayıtta zorunlu; mevcut boş kayıtlarda yalnız uyarı (engel yok).
- Değer doğrulama tipe göre (sayı, tarih `YYYY-MM-DD`, select listeden). Değer değişiklikleri denetim kaydına yazılır.
- Arşivlenen alan formlardan kalkar; değerleri saklama süresi boyunca durur (K8). Silme yok.
- Excel aktarımı ve listelerde sütun olarak görünme bir sonraki adım (istek 25'e ek).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.label/type/options/kvkk_category/view_roles` | "Formda düzeltilmesi gereken alanlar var." |
| Özel nitelikli çağrışım | 422 `sensitive_label`, `fields.label` | "Bu alan özel nitelikli kişisel veri içeriyor olabilir. …" |
| Sınır | 409 `field_limit` | "Özel alan sınırına ulaşıldı (30)." |
| Tip değişimi | 422 `fields.type` | "Tip sonradan değiştirilemez; yeni alan açın." |
| Değer doğrulama | 422 `fields.{key}` | "Evcil hayvan için listeden seçin." |

## Yetki
Tanım: `modules.manage`. Değer: `units.read/manage` ve `people.read/manage` + alan rolleri; sakin bayrakları.

## Kabul kriterleri
- [ ] 31. alan 409; arşivlenen alan sınıra sayılmaz
- [ ] "Sağlık durumu" etiketi 422; `acknowledge_sensitive` ile geçer ve denetimde görünür
- [ ] Rolü `view_roles` dışında olan kullanıcı alanı ve değerini görmez
- [ ] Sakin yalnız `resident_can_view` alanları görür, `resident_can_edit` olanları değiştirir
