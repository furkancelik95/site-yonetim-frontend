# [Servis] Araçlar: plaka kaydı, ayarlar, sakin "Araçlarım"

Kaynak: Yazılım Dokümanı **YAP-05** (Araçlar).

## Ekran
- **Araçlar** (`/araclar`): ara (plaka/bölüm/kişi), durum süzgeci; araç ekle (bölüm seç, plaka, marka, renk, kalıcı/misafir,
  geçerlilik); onayla / pasif yap / yeniden etkinleştir; **Araç ayarları** (bölüm başına plaka sınırı, sakin kaydı onay
  gerektirir). Excel/CSV aktarımı istek 25.
- **Bölüm kartı → Araçlar** sekmesi: aynı liste bölüme süzülü.
- **Sakin → Araçlarım** (`/sakin/{slug}/araclar`): ekle / kaldır; sınır ve onay bilgisi.
- Güvenlik kapı ekranında plaka araması: mevcut `units/lookup?q=` ucuna plaka eşleşmesi eklenmesi **önerilir**
  (yanıt yine yalnız bölüm + oturan adı).

## Uç nokta
- `GET/PUT /api/v1/sites/{slug}/settings/vehicles`
- `GET  /api/v1/sites/{slug}/vehicles?unit_id=&status=&q=` — dizi (sayfalama gerekirse `Page`)
- `POST /api/v1/sites/{slug}/vehicles`, `PATCH …/vehicles/{id}`
- `GET  /api/v1/sites/{slug}/resident/vehicles`, `POST …/resident/vehicles`, `POST …/resident/vehicles/{id}/remove`

## İstek / yanıt
Ayar: `{ "plate_limit_per_unit": 2, "approval_required": false }`.

Araç:
```json
{ "unit_id": "…", "plate": "34ABC123", "brand_model": "Renault Clio", "color": "Beyaz",
  "kind": "permanent", "valid_until": null, "force": false }
```
Yanıt: + `id`, `plate_display` ("34 ABC 123"), `unit_name`, `owner_person_id`, `owner_name`, `status`
(`active | pending | inactive`), `created_at`. `PATCH`: `brand_model`, `color`, `valid_until`, `status`.

Sakin: `GET` → `{ "limit": 2, "approval_required": false, "items": [Vehicle] }`; `POST` aynı gövde (`unit_id` isteğe bağlı,
çok bölümlü sakin için; `force` yok).

## İş kuralları
- Plaka normalize: büyük harf, boşluksuz; `^(0[1-9]|[1-7]\d|8[01])[A-Z]{1,3}\d{2,5}$`. Gösterim `34 ABC 123`.
- Bölüm başına **kalıcı** plaka sınırı ayardan (1–10, varsayılan 2); misafir aracı sınıra girmez ama `valid_until` zorunlu.
- Aynı plaka başka bölümde etkinse 409 `plate_active_elsewhere`; personel `force=true` ile yine de ekler (örn. aynı aracı
  iki daire kullanıyor), sakin ekleyemez ("site yönetimine başvurun"). Aynı bölümde aynı plaka 409 `already_registered`.
- Sakin kaydı: `approval_required` açıksa `pending`, yönetici onaylar; kapalıysa doğrudan `active`.
- Kaldırma/pasif silmez; `inactive` geçmişte kalır (kapı ekranında görünmez).
- Plaka kişisel veridir (KVKK): kimin görebileceği `units.read`; güvenlik kapı ekranı yalnız eşleşme sonucu görür.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Plaka biçimi | 422 `fields.plate` | "Plakayı 34 ABC 123 biçiminde yazın." |
| Misafirde tarih yok | 422 `fields.valid_until` | "Misafir aracı için geçerlilik tarihi zorunlu." |
| Sınır | 422 `plate_limit` | "Bölümünüz için plaka sınırına ulaştınız (2)." |
| Başka bölümde etkin | 409 `plate_active_elsewhere` | "34 ABC 123 plakası A-7 bölümünde kayıtlı. …" |
| Aynı bölümde var | 409 `already_registered` | "Bu plaka bu bölümde zaten kayıtlı." |
| Ayar aralığı | 422 `fields.plate_limit_per_unit` | "1–10 arası." |

## Yetki
Okuma: `units.read`; yazma ve ayar: `units.manage`; sakin uçları: oturum sahibi sakin.

## Kabul kriterleri
- [ ] 3. kalıcı plaka 422 (sınır 2); misafir aracı sınıra sayılmaz
- [ ] Sakin başka bölümde kayıtlı plakayı ekleyemez; personel `force` ile ekler
- [ ] `approval_required` açıkken sakin kaydı `pending`, onayla `active`
- [ ] Başka site 404, yetkisiz 403
