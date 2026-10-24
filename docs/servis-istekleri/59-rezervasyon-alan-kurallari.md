# [Servis] Rezervasyon alanları ve kuralları

Kaynak: Yazılım Dokümanı **REZ-01** (ayarlar: Bölüm 14.2).

## Ekran
**Rezervasyon → Alanlar ve kurallar** (`/rezervasyon/alanlar`): Yapı → Ortak alanlar'da "rezerve edilebilir" işaretli her alan
için kural özeti ve **Kuralları düzenle** formu: açık/kapalı, açılış–kapanış, süre (30/60/90/120/180/240 dk), kapasite (aynı
saatte kaç rezervasyon), en fazla kişi ve misafir, bölüm başına haftalık sınır, son iptal (saat), ücret tipi ve tutarı, geç
iptalde iade, kanal, onay, girişte doğrulama, bekleme listesi ve teklif süresi, no-show kuralı.

## Uç nokta
- `GET …/reservable-areas` → `[{ id, name, kind, block_name, rules }]` (ortak alanlardan `is_reservable && is_active`)
- `PUT …/reservable-areas/{id}/rules` — kurallar nesnesinin tamamı:

```json
{ "enabled": true, "open_from": "09:00", "open_to": "22:00", "slot_minutes": 60, "capacity": 1,
  "max_people": 10, "max_guests": 5, "weekly_limit": 2, "cancel_hours": 24, "late_cancel_refund": false,
  "fee_type": "free|fixed|hourly|per_guest", "fee_amount": "250.00",
  "channel": "resident|staff|both", "approval": "auto|manual", "verify": "none|qr|code|staff",
  "waitlist": true, "waitlist_minutes": 30,
  "noshow": { "enabled": false, "months": 3, "count": 2, "block_days": 14 } }
```

Kuralı hiç kaydedilmemiş alan bu varsayılanlarla döner.

## İş kuralları
- Kapanış > açılış; süre açık saatlere sığmalı; kapasite 1–200; haftalık sınır 0 = sınırsız.
- Ücret tipi ücretsiz değilse tutar > 0. Saat başı ücret = tutar × süre/60; misafir başı = tutar × misafir.
- **No-show açık ve doğrulama "yok" ise kaydedilmez** ("No-show kuralı için kullanım doğrulaması gerekir.").
- Onay "yönetici" ise belgede onay kuralı "Rezervasyon"a bağlanır (K21); karar gelene kadar onay Rezervasyon ekranından verilir.
- Belgede düzey "Tesis veya alan"; şimdilik alan düzeyi.
- Aylık misafir hakkı (belgede "aylık misafir hakkı") ve kısmi geç iptal iadesi sonraki adım.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan yok / işaretsiz | 404 `not_found` | "Rezerve edilebilir alan bulunamadı (Yapı → Ortak alanlar'da işaretleyin)." |
| Alan hatası | 422 `fields.open_to/slot_minutes/capacity/max_people/max_guests/weekly_limit/cancel_hours/fee_amount/waitlist_minutes` | … |
| No-show + doğrulama yok | 422 `fields.noshow` | "No-show kuralı için kullanım doğrulaması gerekir." |

## Yetki
Okuma `requests.assign` ya da `security.visitors`; yazma `modules.manage`.
