# [Servis] Bildirim ve duyuru şablonları

Kaynak: Yazılım Dokümanı **ILT-02**.

## Ekran
**Bildirim Şablonları** (`/bildirim-sablonlari`): şablon kartları (ad, kanal, sürüm, "Sistem/Özelleştirildi", dil metinleri ve
SMS karakter/parça sayısı); **Düzenle**: değişken listesi (zorunlular işaretli), TR ve EN metin, canlı SMS sayacı (standart /
Türkçe karakterli), örnek verili önizleme; **Kaydet (yeni sürüm)**, **Sistem metnine dön**, sürüm geçmişi.

## Uç nokta
- `GET …/notification-templates` → `[{ code, name, channel: "push|sms|email", variables, required, variants: [{ lang, subject, body }], version, history: [{ version, at, by }], customized, sms: [{ lang, encoding, chars, segments }] | null }]`
- `PUT …/notification-templates/{code}` — `{ variants: [{ lang: "tr|en", subject, body }] }` (belgede `GET|PUT …/notification-templates/{code}`)
- `POST …/notification-templates/{code}/reset`

## İş kuralları
- Sistem şablonları (aidat hatırlatma, tahsilat alındı, talep durumu, ziyaretçi geldi, kargo geldi, okuma onayı yedeği,
  acil durum) site için kopyalanarak özelleştirilir; Türkçe metin zorunlu, İngilizce isteğe bağlı (7 dil altyapısı sonra).
- Değişken biçimi `{{ad}}`. **Zorunlu değişken eksikse** ya da **tanımsız değişken** varsa kaydedilmez.
- SMS: GSM-7 alfabesinde 160 (çok parçada 153), Türkçe/Unicode karakter varsa 70 (67) karakterde bir parça; en fazla 3 parça.
- Her kayıt yeni sürümdür; yeni gönderimler son sürümü kullanır, gönderim kaydı hangi sürümle gittiğini tutar.
- Duyuru şablonları (hazır duyuru metinleri) aynı yapıyla eklenebilir.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Türkçe yok | 422 `fields.variants` | "Türkçe metin zorunlu." |
| Değişken | 422 `fields.variants.{lang}` | "Zorunlu değişken eksik: {{tutar}}" / "Tanımsız değişken: …" |
| SMS uzunluğu | 422 `fields.variants.{lang}` | "SMS en fazla 3 parça olabilir." |

## Yetki
`announcements.publish`.
