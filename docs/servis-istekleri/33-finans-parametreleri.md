# [Servis] Finans parametreleri (versiyonlu)

Kaynak: Yazılım Dokümanı **FIN-16**, §8.7. Yalnız ortak kararı gerektirmeyen parametreler; karar bekleyenler ekranda
salt bilgi olarak listelenir (aidat yöntemi K23, gecikme yöntemi — hukuk, mahsup sırası K24, vade/dönem K25,
kartla tahsilat/komisyon/taksit K1, taksitli ek toplama).

## Ekran
- **Finans ayarları** (`/ayarlar/finans`): hatırlatma kademeleri (3 gün değeri), ihtarname hazırlık günü, ödeme planı
  tolerans günü, "plan süresince gecikme işlemez", kıst (ay/gün bazlı), fark raporu eşiği, banka otomatik eşleşme düzeyi,
  bütçe uyarı eşiği; **yürürlük dönemi**; planlı değişiklik bilgisi; karar bekleyenler tablosu; değişiklik geçmişi.

## Uç nokta
- `GET  /api/v1/sites/{slug}/finance-parameters` → `{ current, current_period, earliest_financial_period, defaults, versions, scheduled }`
- `POST …/finance-parameters/versions` — `{ "effective_period": "2026-11", "values": { …tüm ya da değişen alanlar } }`

Parametreler ve varsayılanlar:
```json
{ "reminder_days": [3, 10, 30], "demand_letter_day": 60, "proration": "monthly", "diff_threshold_percent": 10,
  "bank_auto_match": "high", "plan_tolerance_days": 10, "plan_suspends_late_fee": true, "budget_warn_percent": 90 }
```
Sürüm: `{ id, effective_period, values, changed: ["proration"], changed_by, created_at }`.

## İş kuralları
- Her değişiklik yeni sürümdür; bir dönemde geçerli değer = `effective_period ≤ dönem` olan en son sürüm. Geçmiş dönemler değişmez.
- **Finansal etkili** parametreler (`proration`, `plan_suspends_late_fee`) en erken **bir sonraki dönemden** geçerli
  (422 `period_locked`). Diğerleri içinde bulunulan aydan geçerli olabilir; geçmiş aya yazılamaz.
- Doğrulama: hatırlatma günleri 3 adet, artan, 1–120; ihtarname günü son kademeden büyük, en fazla 365; fark eşiği 1–100;
  tolerans 0–60; bütçe eşiği 50–100.
- Belgede finansal etkili değişiklik "Finans parametresi" onay kuralından geçer — K21.
- Kullananlar: istek 29 (kademeler), 30 (tolerans), 34 (fark eşiği), banka eşleştirme (`bank_auto_match`), bütçe uyarısı,
  tahakkuk (kıst).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.*` | "Formda düzeltilmesi gereken alanlar var." |
| Finansal etkili, erken dönem | 422 `period_locked`, `fields.effective_period` | "Finansal etkili parametreler en erken Kasım 2026 döneminden geçerli olur." |
| Değişiklik yok | 422 `no_change` | "Değişen bir parametre yok." |

## Yetki
Okuma `finance.read`; yazma `finance.charge.post` (öneri: `finance.settings.manage`).

## Kabul kriterleri
- [ ] Kasım'dan geçerli kıst değişikliği Ekim tahakkukunu etkilemez
- [ ] Planlı sürüm, dönemi gelince `current` olur
