# [Servis] Ödenecekler listesi ve "ödendi" işareti

Kaynak: Yazılım Dokümanı **SAT-05** (ödenecekler; doğrudan gider mevcut Giderler ekranında).

## Ekran
**Satın alma → Ödenecekler** (`/satin-alma?sekme=odenecek`): KPI (ödenecek fatura, toplam, vadesi geçen, siparişsiz gider
sayısı → Giderler); vadeye göre liste (vadesi geçen işaretli); **Ödendi** (ödeme tarihi, ödenen kasa/banka hesabı).

## Uç nokta
- `GET …/payables` → `{ invoices: [...fatura + overdue], direct_expenses: { count, total }, total }`
- `POST …/vendor-invoices/{id}/mark-paid` — `{ paid_on, cash_account_id }`

## İş kuralları
- Listede yalnız `matched` faturalar (vadeye göre). **Eşleşmeyen fatura listeye giremez**, ödenemez (409 `not_matched`).
- Siparişsiz giderler (elektrik, su…) mevcut Giderler ekranında ödenmemiş olarak durur; burada sayı ve toplamı gösterilir.
  Belgede siparişsiz gider "Gider" onay kuralından geçer (mevcut onay modülündeki `expense` işlem türü).
- **Platform para hareketi başlatmaz**: site bankadan öder, burada işaretlenir. "Ödendi" ile backend aynı işlemde:
  gider kaydı (kategori = talebin kategorisi, tedarikçi, belge no = fatura no, tutar) + seçilen hesaptan çıkış hareketi
  (mevcut `expenses` + `…/pay` mantığı) oluşturmalı; muhasebe fişleri aktarım kuyruğuna (istek 32), bütçe gerçekleşmesi güncellenir.
- Ödeme banka ekstresindeki çıkışla banka içe aktarımında eşleştirilir. Dekont eki belge deposuyla.
- Ödeme tarihi bugünden ileri olamaz.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Eşleşmemiş / ödenmiş | 409 `not_matched` | "Eşleşmeyen fatura ödenemez." / "Fatura zaten ödendi." |
| Alanlar | 422 `fields.paid_on/cash_account_id` | … |

## Yetki
`expenses.manage`.
