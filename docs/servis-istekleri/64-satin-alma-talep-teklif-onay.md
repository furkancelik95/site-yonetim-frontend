# [Servis] Satın alma talebi, teklif (tedarikçi linki dahil) ve onay

Kaynak: Yazılım Dokümanı **SAT-01** ve **SAT-02**.

## Ekran
- **Satın alma → Talepler** (`/satin-alma`): durum süzgeci; liste (numara, konu, kategori, bütçe aşımı, tahmini tutar,
  teklif sayısı / gereken, durum, sipariş no); **Satın alma talebi** formu (konu, kategori, gerekçe, kalemler: açıklama,
  miktar, birim, tahmini birim fiyat, stok kartı).
- **Talep ayrıntısı** (`/satin-alma/{id}`): kalemler; bütçe ve kural; **teklif karşılaştırma** tablosu (tedarikçi, kalem
  bazında birim fiyat, toplam — en düşük işaretli —, teslim, vade, geçerlilik, tedarikçi puanı, "Tedarikçi girdi" etiketi);
  **Teklifi ben gireyim** ve **Tedarikçiye link gönder** (link kopyala, link durumları); seçim (eksik teklifte gerekçe);
  onay kartı (talep eden için "kendi talebinizi onaylayamazsınız"); **Talebi iptal et**.
- **Tedarikçi teklif formu** (`/teklif/{token}`, oturumsuz): site adı, talep no ve konusu, kalemler; birim fiyatlar, teslim
  süresi, geçerlilik, ödeme koşulu, not, belge; onay kutusu (teklifin doğruluğu + aydınlatma metni linki, yeni sekme).

## Uç nokta
- `GET …/purchase-requests?status=` · `GET …/purchase-requests/{id}` (teklifler, linkler, sipariş no ile)
- `POST …/purchase-requests` — `{ title, reason, category_id, items: [{ description, qty, unit, est_unit_price, stock_item_id }], request_number? }`
- `POST …/purchase-requests/{id}/quotes` — `{ vendor_id, lines: [{ unit_price }], delivery_days, payment_terms, valid_until, note, file_name }`
- `POST …/purchase-requests/{id}/quote-links` — `{ vendor_id }` → `{ token, expires_at, vendor_name }`
- `GET /public/v1/quote-links/{token}` · `POST /public/v1/quote-links/{token}` — teklif alanları + `terms_ack: true`
  (sahte serviste `/api/v1/public/quote-links/{token}`)
- `POST …/purchase-requests/{id}/select-quote` — `{ quote_id, exception_reason? }`
- `POST …/purchase-requests/{id}/decide` — `{ decision: "approve|reject", note }` · `POST …/purchase-requests/{id}/cancel`

Talep: `{ id, number: "ST-2026-0001", title, reason, category_id, category_name, items, estimated_total, budget, over_budget, required_quotes, status: "quoting|exception_pending|approval_pending|approved|rejected|ordered|cancelled", selected_quote_id, exception_reason, decisions: [{ stage, decision, by, at, note }], reject_reason, created_by, created_by_id, created_at, quotes, links: [{ token, vendor_name, expires_at, used_at, state }], order_id, order_number }`.

## İş kuralları
- Tahmini toplam = Σ miktar × tahmini birim fiyat; `required_quotes` ayardaki eşiklerden; açılışta bütçe anlık görüntüsü ve
  `over_budget` (istek 63).
- Teklif yalnız `quoting` durumunda; tedarikçi aktif olmalı; bir tedarikçiden tek teklif. Teklif toplamı kalem birim
  fiyatlarından hesaplanır (sipariş ve üçlü eşleşme kalem bazında yapılır).
- **Teklif linki**: tek talebe bağlı, `link_days` gün geçerli, **tek kullanımlık**; aynı tedarikçiye açık link varken yenisi
  verilmez. Tedarikçi yalnız kalem açıklaması/miktar/birim görür (tahmini fiyat, bütçe, diğer teklifler görünmez). Gönderilince
  teklif `source: vendor_link` ("Tedarikçi girdi") olarak kaydedilir ve link kapanır. Kullanılmış, süresi dolmuş ya da talep
  teklif aşamasından çıkmışsa 410 "Bu bağlantının süresi doldu veya kullanıldı." Token tahmin edilemez (≥ 128 bit); public uçta
  hız sınırı. Link e-postası K5.
- **Seçim**: teklif sayısı gerekenin altındaysa gerekçe (≥ 10 karakter) zorunlu → `exception_pending` (onay kuralı işlem türü
  **`quote_exception`**); yeterliyse → `approval_pending` (işlem türü **`purchase_request`**, koşullar: tutar eşiği + bütçe aşımı).
- **Onay**: **talep eden kendi talebini onaylayamaz** (403 `self_approval`). İstisna reddi → `quoting`'e döner (seçim
  temizlenir); satın alma reddi → `rejected`, gerekçe zorunlu, talep edene bildirim. Sahte serviste karar bu ekrandan verilir;
  backend'de mevcut onay modülü (`request_approval`) bu iki işlem türüyle bağlanmalı, karar Onaylar ekranından da verilebilmeli.
- İptal: sipariş/ret/iptal dışındaki durumlarda; açık linkler kapanır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Talep alanları | 422 `fields.title/reason/category_id/items/items.{k}.qty/items.{k}.est_unit_price` | … |
| Teklif alanları | 422 `fields.vendor_id/lines/lines.{k}/delivery_days/payment_terms/valid_until/terms_ack` | … |
| Açık link var | 409 `link_open` | "Bu tedarikçiye gönderilmiş açık link var." |
| Zaten teklif var | 409 `quoted` / 422 `fields.vendor_id` | … |
| Link kapalı | 410 `link_closed` | "Bu bağlantının süresi doldu veya kullanıldı." |
| Eksik teklif gerekçesi | 422 `quote_exception` + `fields.exception_reason` | "2 teklif gerekiyor, 1 var. …" |
| Kendi talebini onaylama | 403 `self_approval` | "Kendi talebinizi onaylayamazsınız." |
| Ret gerekçesi | 422 `fields.note` | "Ret gerekçesi yazın." |
| Yanlış durum | 409 `invalid_status` | … |

## Yetki
Talep açma `expenses.read` + (`requests.assign` ya da `expenses.manage`); onay `expenses.manage` (ileride onay kuralındaki rol);
public uç oturumsuz, yalnız token.
