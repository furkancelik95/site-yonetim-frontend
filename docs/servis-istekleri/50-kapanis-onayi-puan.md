# [Servis] Sakin kapanış onayı ve memnuniyet puanı; talepte yer seçimi

Kaynak: Yazılım Dokümanı **HIZ-01**, §12.3.

## Ekran
- **Sakin → Taleplerim**: yeni talepte **Yer** (Bölümüm / Ortak alan) ve konum — mevcut `POST …/resident/requests` zaten
  `unit_id` ve `location` alıyor (yalnız form eksikti, bu PR'da eklendi). "Çözüldü" talepte **Sorun çözüldü / Devam ediyor**,
  1–5 puan, yorum; "yanıt vermezseniz … tarihinde kapanır" bilgisi.
- **Talep ayrıntısı (personel)**: "Sakin değerlendirmesi" kartı (puan ≤ eşik kırmızı).

## Uç nokta
- `POST …/resident/requests/{id}/confirm` — `{ "solved": true, "score": 4, "comment": null }` (belgede `/me/requests/{rid}/close-confirmation`)
- `GET  …/resident/requests/extras` → `{ "<request_id>": { outage, rating, quote, auto_close_on } }` (öneri: `RequestOut` alanları)
- `GET  …/requests/{id}/extras` — personel

## İş kuralları
- Yalnız `resolved` talep onaylanır (409 `not_resolved`). `solved=true` → puan 1–5 zorunlu, talep `closed`;
  `solved=false` → açıklama zorunlu, talep yeniden açılır (`open`) ve atanana bildirim.
- `auto_close_days` (istek 47, varsayılan 3) içinde yanıt yoksa gece işi talebi `closed` yapar.
- Puan ≤ `low_rating_threshold` → yöneticiye bildirim.
- Sakin yalnız kendi taleplerini görür.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Çözülmemiş | 409 `not_resolved` | "Yalnız çözüldü durumundaki talep onaylanır." |
| Puan | 422 `fields.score` | "1–5 arası puan verin." |
| Açıklama | 422 `fields.comment` | "Sorunun neden devam ettiğini yazın." |

## Kabul kriterleri
- [ ] 3 gün yanıt verilmeyen çözüldü talep gece işiyle kapanır
- [ ] 2 puan yöneticiye bildirim üretir
