# [Servis] Banka hareketi aktarımı ve eşleştirme

## Ekran
`/s/{slug}/banka-aktarim` (menü: Banka Aktarımı; Tahsilat sayfasından da bağlantı). Kullanan: Yönetici, Muhasebe.
Muhasebeci bankanın internet şubesinden hesap hareketlerini Excel/CSV indirir, yükler; gelen havaleler cari
hesaplarla eşleştirilir; onayladıkları tahsilat olarak işlenir (Apsiyon: "Excel ile Banka Hareketleri Yükleme" +
"Banka Hareketleri"). Banka API'si gerekmez; ileride API gelirse aynı önizleme/onay akışı kullanılır.

## Uç nokta
- `POST /api/v1/sites/{slug}/bank-imports` — dosyayı yükle, önizleme (hiçbir şey yazılmaz)
- `POST /api/v1/sites/{slug}/bank-imports/{import_id}/confirm` — seçilen satırları tahsilat olarak işle

Excel'den daire aktarımıyla (`imports/units`) aynı kalıp: önizleme kısa süre saklanır, onayla yazılır.

## İstek
`POST …/bank-imports` — `multipart/form-data`: `file` (.xlsx, .xls, .csv; en fazla 5 MB), `cash_account_id` (banka hesabı).

`POST …/confirm`:
```json
{ "rows": [ { "row_number": 1, "ledger_account_id": "01a0…" }, { "row_number": 4, "ledger_account_id": "01a0…" } ] }
```
Kullanıcı öneriyi değiştirebilir ya da eşleşmeyen satıra elle hesap seçebilir; bu yüzden hesap satır başına gelir.

## Beklenen yanıt
Önizleme `200`:
```json
{
  "import_id": "0192…",
  "file_name": "ekstre-ekim.xlsx",
  "cash_account_id": "01a0…",
  "expires_at": "2026-10-05T20:40:00Z",
  "row_count": 8,
  "matched_count": 3,
  "suggested_count": 2,
  "unmatched_count": 1,
  "ignored_count": 2,
  "total_in": "31764.37",
  "rows": [
    {
      "row_number": 1,
      "date": "2026-10-03",
      "description": "FAST Mehmet ERDOĞAN A1-K EKIM AIDAT",
      "amount": "11618.90",
      "direction": "in",
      "bank_reference": "FT2600002",
      "status": "matched",
      "suggestion": {
        "ledger_account_id": "01a0…", "reference_code": "A1-K", "unit_name": "A-1", "person_name": "Mehmet ERDOĞAN",
        "balance": "11618.90", "confidence": "high", "reason": "Açıklamada referans kodu var (A1-K)"
      }
    },
    { "row_number": 6, "date": "2026-10-03", "description": "HAVALE 1234567 NOLU HESAPTAN", "amount": "3500.00", "direction": "in", "bank_reference": "HV5512001", "status": "unmatched", "suggestion": null },
    { "row_number": 7, "date": "2026-10-04", "description": "ELEKTRIK FATURASI OTOMATIK ODEME", "amount": "32319.00", "direction": "out", "bank_reference": null, "status": "ignored", "suggestion": null }
  ]
}
```
`status`: `matched` (yüksek güven, ekranda işaretli gelir) · `suggested` (orta güven, işaretsiz, kullanıcı bakar) ·
`unmatched` · `ignored` (çıkış hareketi, aktarılmaz) · `duplicate` (aynı hareket daha önce aktarıldı).

Onay `200`:
```json
{ "data": { "created_payments": 3, "total_amount": "12595.87", "skipped": [] }, "message": "3 banka hareketi tahsilat olarak işlendi (12.595,87 TL)." }
```

## İş kuralları
- **Okuma:** sütun adları bankaya göre değişir (Tarih / İşlem Tarihi, Açıklama, Tutar ya da Borç/Alacak ayrı). En azından
  tarih + açıklama + tutar sütunları başlıktan tanınmalı; tanınmazsa 422 + hangi sütunun bulunamadığı. Tutar tr-TR biçiminde
  gelebilir ("1.234,56"). Yön: tutar işareti ya da ayrı Borç/Alacak sütunu.
- **Eşleştirme sırası:** (1) açıklamada hesabın `reference_code`'u geçiyorsa `matched`/high; (2) gönderen adı tek bir hesabın kişi
  adıyla aynıysa (Türkçe büyük/küçük harf ve aksan duyarsız) `suggested`/medium; (3) yoksa `unmatched`. Birden çok hesap aday
  ise öneri yok (`unmatched`), uydurulmaz.
- **Mükerrer:** aynı banka hesabında aynı `(tarih, tutar, bank_reference)` daha önce aktarıldıysa `duplicate`. `bank_reference`
  boşsa `(tarih, tutar, açıklama)`.
- **Onay:** her satır mevcut tahsilat servisiyle işlenir (FIFO mahsup, kasa hareketi, defter) — tek transaction ya da satır
  satır; hangisi seçilirse `skipped` dolu döner. `method = bank_transfer`, `reference = bank_reference`, `note = açıklama`.
- `ignored`/`duplicate` satır onayda gelirse atlanır (`skipped`).
- Önizleme 6 saat saklanır (daire aktarımı gibi); süresi geçmişse 404. Aynı önizleme ikinci kez onaylanamaz (409).
- Dosya diske kalıcı yazılmaz; aktarım kaydı (dosya adı, kim, ne zaman, kaç satır) denetim kaydına girer.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Uzantı/boyut | 422 `fields.file` | "Yalnız .xlsx, .xls ya da .csv yüklenebilir." / "Dosya en fazla 5 MB olabilir." |
| Sütun tanınmadı | 422 `fields.file` | "Tutar sütunu bulunamadı. Beklenen başlıklar: …" |
| Banka hesabı seçilmedi / pasif / kasa | 422 `fields.cash_account_id` | "Banka hesabını seçin." |
| Önizleme süresi doldu | 404 | "Aktarım bulunamadı ya da süresi doldu; dosyayı yeniden yükleyin." |
| Zaten onaylandı | 409 `already_confirmed` | "Bu aktarım zaten onaylandı." |

## Yetki
`finance.payment.record` + `finance.cash.manage`.

## Kabul kriterleri
- [ ] En az iki bankanın gerçek ekstre biçimi okunuyor (örnek dosyalar test verisine)
- [ ] Referans kodlu satır `matched`, adı tutan `suggested`, birden çok aday `unmatched`
- [ ] Aynı dosya ikinci kez yüklenince satırlar `duplicate`
- [ ] Onay sonrası cari ekstrede tahsilat, kasa ekstresinde giriş görünüyor
- [ ] Yetkisi olmayan rol 403, başka site 404
