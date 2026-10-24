# [Servis] Ücretli hizmet: tarife, teklif, sakin onayı

Kaynak: Yazılım Dokümanı **HIZ-04**, §12.2. Ücret, dönem dışı ücret (istek 31, kaynak `service`) olarak cariye yansır.

## Ekran
- **Talep ayarları → Hizmet tarifesi**: kalem, birim, birim fiyat.
- **Talep ayrıntısı → Ücretli hizmet** (yalnız bölüm içi talep): tarifeden ya da serbest kalemlerle **teklif** → sakine;
  sakin onaylayınca **İş tamamlandı** (gerçekleşen tutar); durum rozeti.
- **Sakin → Taleplerim**: teklif kartı (kalemler, toplam, **Onaylıyorum / Reddediyorum**); gerçekleşen teklifi aşarsa
  **ek tutar onayı**.

## Uç nokta
- `GET/POST …/service-tariffs`, `PATCH …/service-tariffs/{id}` — `{ name, unit, price, is_active }`
- `POST …/requests/{id}/quotes` — `{ lines: [{ description, qty, unit_price }], note }`
- `POST …/resident/quotes/{id}/decision` — `{ decision: "accept|reject" }` (belgede `/me/quotes/{qid}/decision`)
- `POST …/quotes/{id}/complete` — `{ actual_total }`

Teklif: `{ id, request_id, unit_id, lines, total, note, status: "pending|accepted|rejected|extra_pending|billed", actual_total, billed_total, created_by, created_at }`.

## İş kuralları
- Yalnız `unit_id` olan (bölüm içi) talepte (409 `not_unit_request`); talepte tek açık teklif (409 `quote_open`).
- **Sakin onayı olmadan ücret yansımaz.** Ret → iş ücretsiz yapılmaz, talep "sakin reddetti" ile kapanabilir.
- Tamamlamada gerçekleşen ≤ teklif → `billed` (gerçekleşen tutar); > teklif → `extra_pending`: sakin ek tutarı onaylarsa
  gerçekleşen, reddederse teklif tutarı faturalanır.
- Faturalama: bölümün oturan hesabına (yoksa açık hesabına) dönem dışı ücret; yansıma kaynağın ayarına göre (istek 31).
  Hesap teklif anında belirlenir.
- Tarife değişikliği onay kuralından geçer (K21). Malzeme stoktan çıkıyorsa stok maliyeti / satış fiyatı tesis ayarı (OPS-02 ile).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Ortak alan talebi | 409 `not_unit_request` | "Ücretli hizmet yalnız bölüm içi taleplerde verilir." |
| Açık teklif | 409 `quote_open` | "Bu talepte açık bir teklif var." |
| Kalem | 422 `fields.lines` | "En az bir kalem girin." / "Miktar ve birim fiyat sıfırdan büyük olmalı." |
| Yanlış durum | 409 `invalid_status` | … |

## Yetki
Teklif ve tamamlama `requests.assign`; tarife yönetimi aynı (öneri `requests.settings`); karar oturum sahibi sakin.

## Kabul kriterleri
- [ ] 850 teklif, 1.500 gerçekleşen, sakin ek tutarı reddeder → 850 dönem dışı ücret
- [ ] Sakin teklifi reddederse ücret oluşmaz
