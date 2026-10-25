# [Servis] Acil bilgi kartı (çevrimdışı) ve toplanma alanları

Kaynak: Yazılım Dokümanı **ILT-06** ve **16.4**.

## Ekran
- **Acil Durum → Acil bilgi kartı**: toplanma alanları (ad, tarif, kroki fotoğrafı), acil telefonlar (ad, numara), kısa
  talimatlar (deprem, yangın, su baskını, gaz kaçağı), blok tahliye notları; **Kartı yayınla**; son yayın sürümü ve kişi.
- **Sakin → Acil durum bilgileri** (`/sakin/{slug}/acil-durum`): tek dokunuşla arama düğmeleri, toplanma alanları ve krokiler,
  talimatlar, blok notları. Kart cihaza kaydedilir; internet yokken "cihazdaki kopya" gösterilir.

## Uç nokta
- `GET/PUT …/emergency-info-card` — `{ muster_points: [{ id, name, directions, map }], phones: [{ label, number }], instructions: { earthquake, fire, flood, gas }, block_notes: [{ block_id, block_name, note }] }` → `+ { version, updated_at, updated_by }`
- `GET …/resident/emergency-info-card`
- Belgede ayrıca `GET|POST …/muster-points` (QR/NFC noktası tanımı) — mobil yoklamayla birlikte.

## İş kuralları
- En az bir toplanma alanı; telefon 3–13 hane (`112`, `187` gibi kısa numaralar geçerli). Kroki şimdilik küçültülmüş görsel;
  belge deposu gelince dosya.
- Her yayın sürümü artırır; sakin uygulaması kartı arka planda yeniler. Web'de kart `localStorage`'a yazılıyor; tam çevrimdışı
  açılış için PWA servis çalışanı bu sayfayı ve kart verisini önbelleğe almalı (mobil uygulamada cihaz deposu).
- Dil varyantı (TR/EN) belge gereği; şimdilik TR.
- Toplanma alanı adları acil durum ekranında yoklama ve sakin beyanında seçenek olur (istek 73).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan yok | 422 `fields.muster_points` | "En az bir toplanma alanı tanımlayın." |
| Alan adı / kroki | 422 `fields.muster_points.{i}.name/map` | … |
| Telefon | 422 `fields.phones.{i}.label/number` | "Geçerli bir numara yazın." |

## Yetki
Yazma `announcements.publish`; okuma personel ve sakin.
