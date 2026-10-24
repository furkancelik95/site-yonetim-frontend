# [Servis] Sipariş ve mal/hizmet kabul

Kaynak: Yazılım Dokümanı **SAT-03** ve **SAT-04**.

## Ekran
- **Talep ayrıntısı → Siparişi oluştur** (onaylı talepte).
- **Satın alma → Siparişler** ve **Sipariş ayrıntısı** (`/satin-alma/siparis/{id}`): kalemler (miktar, birim fiyat, tutar,
  teslim alınan), **Sipariş formu** (yazdır — menü/butonlar gizlenir); **Mal / hizmet kabul** (kalem bazında teslim alınan
  miktar, not, fotoğraf/irsaliye, 1–5 tedarikçi puanı); kabul kayıtları.

## Uç nokta
- `POST …/purchase-orders` — `{ pr_id }` → `{ id, number: "SIP-2026-0001", pr_id, pr_number, vendor_id, vendor_name, category_id, lines: [{ description, qty, unit, unit_price, total, stock_item_id, received }], total, status: "sent|partial|received|closed", created_by, created_at, receipts, invoices }`
- `GET …/purchase-orders` · `GET …/purchase-orders/{id}` · `GET …/purchase-orders/{id}.pdf` (belgede; ekranda yazdır)
- `POST …/purchase-orders/{id}/receipts` — `{ lines: [{ qty }], note, photo, rating }`

## İş kuralları
- **Onaysız sipariş verilemez** (talep `approved` olmalı, 409 `not_approved`); tedarikçi aktif olmalı. Kalem birim fiyatları
  seçilen tekliften; talep `ordered` olur. Siparişin tedarikçiye e-postası K5.
- Kabulde kalan miktardan fazlası girilemez (fazla teslim not olarak yazılır); en az bir kalem > 0. Tümü gelince `received`,
  değilse `partial`.
- **Stoklu kalem** (`stock_item_id`) kabul edilince stok girişi yapılır (not: "SIP-… kabulü"). Bu giriş kabul işleminin
  parçasıdır; **kabulü yapan kullanıcının stok yazma yetkisi aranmamalı** (sahte serviste stok ucu kullanıcının yetkisiyle
  çağrıldığı için muhasebe hesabıyla stok girmedi — backend'de aynı işlem içinde sistem adına yazılmalı).
- Puan tedarikçi ortalamasına girer (istek 62). Fotoğraf belge deposu gelince dosya olarak saklanır.
- Mod K'da sipariş ve kabul Kivi'ye iletilir [KİVİ] (A-01).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Onaysız | 409 `not_approved` | "Onaysız sipariş verilemez." |
| Tedarikçi pasif | 409 `vendor_inactive` | … |
| Kabul miktarı | 422 `fields.lines/lines.{k}` | "Kalan 1; fazla teslim not olarak yazılır." |
| Puan | 422 `fields.rating` | "1–5 puan." |
| Tamamı alınmış | 409 `invalid_status` | … |

## Yetki
Sipariş `expenses.manage`; kabul `expenses.read` + (`requests.assign` ya da `inventory.manage` ya da `expenses.manage`).
