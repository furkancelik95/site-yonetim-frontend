# [Servis] Endeksli fiyat artışı ve endeks değerleri

Kaynak: Yazılım Dokümanı **15.3** ve **SAT-06** (endeksli artış ve yenileme akışı).

## Ekran
- **Sözleşme ayrıntısı → Fiyat artışı**: kural (artış yok / TÜFE / ÜFE / TÜFE+ÜFE ortalaması / sabit oran), dönem (yıllık /
  6 aylık), tavan (%); sıradaki artış kartı: tarih, kalan gün, endeks dönemi ve oranı (tavan uygulanmışsa ikisi), eski → yeni
  bedel, yıllık bütçe etkisi; **Yeni bedeli onayla / Bedel değişmesin** (retde görüşme notu zorunlu); artış geçmişi.
- **Platform → Endeks değerleri** (`/yonetim/endeksler`, platform yöneticisi): dönem, TÜFE yıllık %, ÜFE yıllık %; tablo.

## Uç nokta
- `POST …/contracts/{id}/escalation` — `{ decision: "approve|reject", note }`
- Önizleme `GET …/contracts/{id}/performance` içinde `escalation_preview`: `{ status: "none|not_due|missing_index|due|approved|rejected", date, days_left, index_period, rate, capped_rate, old_amount, new_amount, annual_effect, record }`
- `GET /api/v1/platform/index-values` · `PUT /api/v1/platform/index-values/{YYYY-MM}` — `{ tufe, ufe }` (belgede `GET|POST /api/v1/platform/index-values`)

## İş kuralları
- Artış tarihi = başlangıç + n × (12 ya da 6 ay); bitişten sonraysa artış yok.
- Endeks dönemi = artış tarihinden önceki ay; değer o dönem için girilmiş olmalı (TÜİK'in açıkladığı yıllık % değişim).
  Ortalama = (TÜFE + ÜFE) / 2. Tavan varsa oran tavanla sınırlanır.
- **Artış tarihinden 30 gün önce** hesap açılır (`due`), yöneticiye onay görevi düşer (onay kuralı işlem türü önerisi:
  `contract_escalation`); endeks yoksa `missing_index` ve **platform yöneticisine "endeks değeri eksik" uyarısı** (K5).
- Bütçe etkisi = (yeni − eski) × yıldaki dönem sayısı (aylık 12, yıllık 1) — bütçe gerçekleşmesi (8.10) ekranında da görünmeli.
- Onayda yeni bedel **artış tarihinden itibaren** geçerli: backend'de sözleşmeye bedel geçmişi (`amount`, `effective_from`)
  tutulmalı; sahte servis bugünkü bedeli doğrudan güncelliyor (`PATCH /contracts/{id}`). Çerçeve sözleşme gider taslakları
  yeni bedelle üretilir. Ret → bedel değişmez, görüşme notu kaydedilir.
- Endeks değerleri tüm tesisler için ortak tablo; yalnız platform yöneticisi yazar (diğerine 404). Dönem geçmiş ya da bu ay;
  aynı dönem yeniden yazılabilir (düzeltme), kim girdiği tutulur. TÜİK'ten otomatik çekme Faz 2.
- Yenileme: bitişten 60 ve 30 gün önce hatırlatma (sözleşme kartında mevcut `notice_days`), son 12 ay karnesiyle.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Onay bekleyen artış yok | 409 `not_due` | "Onay bekleyen artış yok (artış tarihinden 30 gün önce açılır)." / "Endeks değeri girilmemiş; …" |
| Ret notu | 422 `fields.note` | "Tedarikçiyle görüşme notunu yazın." |
| Bedel güncellenemedi | `contract_update_failed` | … |
| Endeks alanları | 422 `fields.period/tufe/ufe` | "Geçmiş ya da bu ay olmalı." … |

## Yetki
Artış kararı `contracts.manage`; endeks değerleri platform yöneticisi.
