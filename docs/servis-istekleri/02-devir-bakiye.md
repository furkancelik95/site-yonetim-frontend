# [Servis] Devir bakiye (cari hesap açılış bakiyesi)

## Ekran
Cari ekstre → **Hesap işlemleri** → "Devir bakiye". Kullanan: Yönetici, Muhasebe.
Kullanım: site sisteme geçerken önceki yönetimden/programdan kalan borç ya da alacak tek tek girilir
(Apsiyon: "Devir Bakiye Girişi"). Toplu giriş için ileride Excel aktarımına sütun eklenebilir.

## Uç nokta
`POST /api/v1/sites/{slug}/accounts/{account_id}/opening-balance`

## İstek
```json
{ "amount": "1500.00", "direction": "debit", "date": "2026-10-01", "description": "2025 yönetiminden devir" }
```
`direction`: `debit` (sakin borçlu) | `credit` (sakin alacaklı). `description` isteğe bağlı.
`Idempotency-Key` kabul etmeli.

## Beklenen yanıt
`201`:
```json
{
  "data": { "id": "0192…", "amount": "1500.00", "direction": "debit", "date": "2026-10-01", "description": "2025 yönetiminden devir" },
  "message": "1.500,00 TL devir borç olarak işlendi."
}
```

## İş kuralları
- Defter hareketi olarak yazılır, **yeni kaynak türü `opening`** (`LedgerSource`'a eklenir). docs/03 (kasa hareketleri) "açılış
  bakiyesi de bir harekettir (`source = opening`)" kuralının cari hesap karşılığı.
- `debit` → vadeli borç gibi FIFO mahsuba girer (`due_date` = `date`); `credit` → avans.
- Hesap başına **bir kez** (409). Düzeltme: mevcut ters kayıt mekanizmasıyla (`adjustment`).
- Özet bakiye tablosu aynı transaction'da güncellenir.
- Ekstrede açıklama: "Devir bakiye — {description}".

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Bu hesaba daha önce girilmiş | 409 `already_exists` | "Bu hesaba devir bakiye daha önce girildi. Düzeltmek için ters kayıt kullanın." |
| Tutar ≤ 0 | 422, `fields.amount` | "Tutar sıfırdan büyük olmalı." |
| Tarih gelecekte | 422, `fields.date` | "Devir tarihi bugünden sonra olamaz." |

## Yetki
`finance.payment.record`.

## Kabul kriterleri
- [ ] Ekstrede `source: "opening"` satırı görünür, yürüyen bakiye doğru
- [ ] Borçlular listesine ve gecikme gününe girer (`due_date` = devir tarihi)
- [ ] İkinci deneme 409
- [ ] Yetkisi olmayan rol 403, başka site 404
