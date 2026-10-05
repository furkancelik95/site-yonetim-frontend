# [Servis] Tekrarlanan gider

## Ekran
`/s/{slug}/giderler/tekrarlanan` (Gider defterinden "Tekrarlanan" düğmesi). Kullanan: `expenses.manage` olan.
Her ay aynı gelen gider (asansör bakım sözleşmesi, kapıcı maaşı, abonelik) bir kez tanımlanır; her ay seçilen günde
gider defterine kendiliğinden yazılır (Apsiyon: "Tekrarlanan Evrak").

## Uç nokta
- `GET    /api/v1/sites/{slug}/recurring-expenses` — liste (sayfalama gerekmez, site başına az kayıt; istenirse sayfalı)
- `POST   /api/v1/sites/{slug}/recurring-expenses` — tanım ekle
- `PATCH  /api/v1/sites/{slug}/recurring-expenses/{id}` — güncelle / durdur (`is_active`)
- `DELETE /api/v1/sites/{slug}/recurring-expenses/{id}` — tanımı kaldır (oluşturulmuş giderlere dokunmaz)

## İstek
```json
{
  "description": "Asansör bakım sözleşmesi",
  "expense_category_id": "01a0…",
  "amount": "19440.00",
  "vendor": "Asansör Servis A.Ş.",
  "day_of_month": 1,
  "auto_pay": false,
  "cash_account_id": null,
  "is_active": true
}
```
`PATCH` kısmi gövde kabul eder (ör. yalnız `{ "is_active": false }`).

## Beklenen yanıt
Liste `200` (dizi), ekle `201`, güncelle/sil `200` — yazmalarda `{ "data": <nesne>, "message": "…" }`:
```json
{
  "id": "0192…",
  "description": "Asansör bakım sözleşmesi",
  "expense_category_id": "01a0…",
  "amount": "19440.00",
  "vendor": "Asansör Servis A.Ş.",
  "day_of_month": 1,
  "is_active": true,
  "auto_pay": false,
  "cash_account_id": null,
  "next_run_on": "2026-11-01",
  "last_created_on": "2026-10-01",
  "created_at": "2026-10-05T10:12:00Z"
}
```
Mesajlar: ekle → `"\"Asansör bakım sözleşmesi\" her ayın 1. günü kaydedilecek."`, durdur → `"… durduruldu."`,
sil → `"… kaldırıldı. Daha önce oluşturulan giderler yerinde kalır."`

## İş kuralları
- Arka plan işi (otomatik tahakkukla aynı zamanlayıcı): her gün, `day_of_month` bugün olan etkin tanımlar için **normal gider
  kaydı** oluşturulur (mevcut gider servisi; belge yok). Açıklama: `"{description} — {ay}/{yıl}"`.
- `auto_pay = true` → gider "ödendi" olarak, `cash_account_id`'den çıkışla yazılır; değilse "ödenmedi".
- İdempotent: aynı tanım için aynı ay ikinci gider oluşmaz (iş iki kez çalışsa da).
- Açıldığı günden önceki gün geriye dönük oluşturulmaz (otomatik tahakkuktaki kural).
- `next_run_on` Europe/Istanbul yerel tarih; `is_active = false` ise `null`.
- Tanım silinince ya da değişince oluşmuş giderler değişmez (gider defteri değişmezlik kuralı).
- Denetim kaydı: tanım ekleme/değişiklik/silme ve otomatik oluşturulan gider (`actor_name = "Tekrarlanan gider"`).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Açıklama boş | 422 `fields.description` | "Açıklama zorunlu." |
| Tutar ≤ 0 | 422 `fields.amount` | "Tutar sıfırdan büyük olmalı." |
| Gün 1–28 dışı | 422 `fields.day_of_month` | "Gün 1–28 arasında olmalı (her ayda olsun diye)." |
| `auto_pay` ama hesap yok/pasif | 422 `fields.cash_account_id` | "Otomatik ödeme için hesap seçin." |
| Kategori başka sitenin / yok | 422 `fields.expense_category_id` | "Kategori seçin." |
| Tanım yok / başka site | 404 | "Tekrarlanan gider bulunamadı." |

## Yetki
`expenses.read` (liste), `expenses.manage` (yazma). `auto_pay` için ayrıca `finance.cash.manage`.

## Kabul kriterleri
- [ ] İş aynı ay ikinci gider oluşturmuyor
- [ ] `auto_pay` gideri kasa ekstresinde çıkış olarak görünüyor
- [ ] Durdurulan tanım için gider oluşmuyor, `next_run_on: null`
- [ ] Yetkisi olmayan rol 403, başka site 404
