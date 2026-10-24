# [Servis] Rezervasyon günlük listesi, kullanım doğrulama, no-show ve kullanım raporu

Kaynak: Yazılım Dokümanı **REZ-03**.

## Ekran
**Rezervasyon** (`/rezervasyon`, yönetim ve güvenlik):
- **Günlük liste**: bugünse üstte **Rezervasyon kodu** kutusu (sakinin söylediği ya da QR'dan okunan 6 hane → **Doğrula ve giriş
  kaydet**); tarih ve alan süzgeci; KPI (rezervasyon, gelen, bekleme listesi); satırlarda saat, alan, bölüm/kişi, ücret, durum,
  **Geldi** (listeden elle giriş; doğrulama "görevli onayı" olan alanlarda asıl yol), **İptal**; günün bekleme listesi. 30 saniyede bir yenilenir.
- **Kullanım raporu**: son 30 gün alan bazında rezervasyon, iptal, gelmedi (oran), doluluk, borca yansıyan ücret.

Sakin tarafında kod/QR: doğrulama `code` ise 6 hane, `qr` ise ayrıca `SY-REZ:{code}` içerikli QR gösterilir; `staff` ve
`none` için kod gösterilmez.

## Uç nokta
- `POST …/reservations/check-in-code` — `{ code }` → giriş kaydı (bugünkü onaylı rezervasyon)
- `POST …/reservations/{id}/check-in` — listeden "geldi"
- `GET …/reservations/report?to=YYYY-MM-DD` (from = to − 29 gün) → `{ from, to, rows: [{ area_id, area_name, total, cancelled, checked_in, no_show, no_show_rate, occupancy, revenue }] }`

## İş kuralları
- Giriş yalnız **bugün** ve `approved` rezervasyona; ikinci kez kaydedilmez. Kaydeden personel ve zaman tutulur.
- **Zamanlanmış iş** (sahte serviste okuma anında): bitiş saati geçmiş `approved` rezervasyon, alanın doğrulama yöntemi `none`
  ise `completed`, değilse **`no_show`**. No-show sayısı kurala ulaşınca kısıt (istek 60, madde 2) ve sakine bildirim (K5).
  No-show'da ücret iade edilmez.
- Doluluk = (onaylı + gelen + tamamlanan + gelmeyen) / (saat sayısı × kapasite × gün) × 100.
- `no_show_rate` doğrulama yöntemi `none` olan alanda `null`.
- `revenue` = borca yansımış ve iptal edilmemiş rezervasyon ücretleri (geç iptalde iade edilmeyenler dahil).
- Güvenlik ve ilgili görevliye günlük liste bildirimi (K5); QR'ı sakinin alandaki QR'ı okutması (alan QR'ı) sonraki adım.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Kod biçimi | 422 `fields.code` | "6 haneli kodu girin." |
| Kod yok | 404 `not_found` | "Bugün için bu kodla rezervasyon yok." |
| Zaten girildi | 409 `already` | "Giriş zaten kaydedildi (…)." |
| Bugün değil | 409 `not_today` | "Rezervasyon bugün için değil." |
| Yanlış durum | 409 `invalid_status` | "Yalnız onaylı rezervasyona giriş yapılır." |

## Yetki
Günlük liste ve giriş `requests.assign` ya da `security.visitors`; rapor `requests.assign`.
