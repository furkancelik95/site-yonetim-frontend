# [Servis] İade (alacaklı bakiyenin sakine geri ödenmesi)

## Ekran
Cari ekstre → **Hesap işlemleri** → "İade" (yalnız hesabın alacak bakiyesi varken açık). Kullanan: Yönetici, Muhasebe.
Kullanım: fazla ödeme, taşınma; sakine para geri verilir (Apsiyon: "İade Makbuzu").

## Uç nokta
`POST /api/v1/sites/{slug}/refunds`

## İstek
```json
{
  "ledger_account_id": "01a0…",
  "amount": "250.00",
  "date": "2026-10-02",
  "cash_account_id": "01a0…",
  "reason": "Taşınma, fazla ödeme iadesi"
}
```
`Idempotency-Key` zorunlu (para çıkışı).

## Beklenen yanıt
`201`:
```json
{
  "data": { "id": "0192…", "ledger_account_id": "01a0…", "amount": "250.00", "date": "2026-10-02", "cash_account_id": "01a0…", "reason": "Taşınma, fazla ödeme iadesi" },
  "message": "250,00 TL iade kaydedildi."
}
```

## İş kuralları
- Yalnız alacaklı bakiye iade edilir: `amount ≤ -balance`.
- Tek transaction: cari defterde **borç** hareketi (bakiyeyi sıfıra doğru çeker, kaynak `refund` — yeni tür) +
  kasa/bankada **çıkış** hareketi (`CashSource` → `refund`).
- Değişmez; geri almak ters kayıtla.
- Avans mahsubu (açık karar K4) kararı ne olursa olsun iade ayrı bir işlem.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alacak bakiyesi yok | 409 `no_credit` | "Bu hesabın alacak bakiyesi yok; iade yapılamaz." |
| Tutar alacağı aşıyor | 422, `fields.amount` | "En fazla 1.250,00 TL iade edilebilir." |
| Gerekçe boş | 422, `fields.reason` | "Gerekçe zorunlu." |
| Kasa hesabı pasif/başka site | 422 / 404 | |

## Yetki
`finance.payment.record` + `finance.cash.manage`.

## Kabul kriterleri
- [ ] Cari ekstrede iade satırı, kasa ekstresinde çıkış satırı; ikisi aynı transaction
- [ ] Alacağı aşan tutar 422 ve `fields.amount`
- [ ] Aynı Idempotency-Key ile ikinci istek ikinci iade oluşturmaz
- [ ] Yetkisi olmayan rol 403, başka site 404
