# [Servis] Tedarikçi faturası ve üçlü eşleşme (Mod P)

Kaynak: Yazılım Dokümanı **SAT-05** (fatura ve üçlü eşleşme).

## Ekran
- **Sipariş ayrıntısı → Tedarikçi faturası** (kabulden sonra; geçerli bir fatura varsa gizli): fatura no, tarih, vade, belge
  adı; kalem bazında faturadaki miktar ve birim fiyat (siparişten dolu gelir); toplam. Fatura kartında eşleşme sonucu,
  farklar ve (başka yetkili için) **Farkı onayla / İtiraz et** + zorunlu gerekçe.
- **Satın alma → Faturalar**: durum süzgeci, liste.

## Uç nokta
- `POST …/vendor-invoices` — `{ order_id, number, date, due_date, lines: [{ qty, unit_price }], file_name }`
- `GET …/vendor-invoices?status=` · `POST …/vendor-invoices/{id}/decide` — `{ decision: "approve|reject", note }`

Fatura: `{ id, order_id, order_number, vendor_id, vendor_name, number, date, due_date, lines, total, expected_total, diffs: [string], status: "matched|diff_pending|disputed|paid", decision, file_name, paid_on, cash_account_id, created_by, created_by_id, created_at }`.

## İş kuralları
- Fatura no büyük harfe çevrilir, aynı tedarikçide benzersiz; tarih bugünden ileri olamaz; vade ≥ tarih.
- Teslim alınmamış siparişe fatura eşleştirilmez (409 `no_receipt`).
- **Eşleşme**: her kalemde faturadaki miktar = teslim alınan (tolerans yok); birim fiyat siparişle karşılaştırılır;
  toplam, `expected = Σ teslim alınan × sipariş birim fiyatı` ile tolerans (ayar, varsayılan %1) içinde olmalı. Onaylı ceza
  kesintisi varsa beklenen tutar kesinti kadar düşer (sözleşme performansı isteğiyle).
- Miktar farkı ya da tolerans dışı toplam → `diff_pending`: **ödenecekler listesine giremez**; fark onayı (onay kuralı
  işlem türü önerisi: `expense` ya da yeni `invoice_difference`) **faturayı girenden başka** yetkili tarafından, gerekçeyle.
  Onay → `matched`; ret → `disputed` (tedarikçiye bildirim taslağı, K5).
- Toplam tolerans içindeyse birim fiyat sapması eşleşmeyi bozmaz ve `diffs`'e yazılmaz; fark onayına düşen faturada ise
  birim fiyat farkları da listelenir.
- Eşleşme sonrası sipariş tamamen teslim alındıysa `closed`.
- PDF / e-Fatura XML yükleme belge deposuyla (RAP); e-Fatura gelen kutusu Faz 2. Mod K'da fatura Kivi'de [KİVİ].

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alanlar | 422 `fields.order_id/number/date/due_date/lines` | "Bu tedarikçinin bu numaralı faturası kayıtlı." … |
| Kabul yok | 409 `no_receipt` | "Teslim alınmamış sipariş için fatura eşleştirilemez; …" |
| Kendi girdiği farkı onaylama | 403 `self_approval` | "Faturayı giren kişi farkı onaylayamaz." |
| Gerekçe | 422 `fields.note` | "Gerekçe zorunlu." |
| Yanlış durum | 409 `invalid_status` | … |

## Yetki
`expenses.manage`.
