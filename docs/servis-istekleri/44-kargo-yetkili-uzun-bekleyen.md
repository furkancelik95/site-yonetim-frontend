# [Servis] Kargo: teslim yetkilisi ve uzun bekleyen kargolar

Kaynak: Yazılım Dokümanı **GUV-05**. Mevcut `packages` uçlarına ek. Kabulde fotoğraf zorunluluğu belge/dosya modülüyle gelecek.

## Ekran
- **Sakin → Ziyaretçiler → Kargo teslim yetkilisi**: en fazla 3 kişi ekle/kaldır.
- **Güvenlik → teslim penceresi**: bölümün teslim yetkilileri ipucu olarak.
- **Kapı ekranı → Uzun bekleyen kargolar**: ayardaki günden eski bekleyenler, bekleme günü, yetkililer.

## Uç nokta
- `GET  /api/v1/sites/{slug}/resident/parcel-delegates` · `POST …` `{ name }` · `POST …/{id}/remove`  (belgede `/me/parcel-delegates`)
- `GET  …/units/{id}/parcel-delegates` — görevli; yalnız ad
- `GET  …/packages/long-waiting` → `{ days, items: [{ id, unit_name, carrier, received_at, waiting_days, delegates }] }`

## İş kuralları
- Yetkili kişi kargoyu sakinin teslim koduyla alır (öneri: yetkiliye ayrı kod — SMS K5 ile). Teslim kaydında `delivered_to`
  yetkilinin adı olur.
- Uzun bekleme günü istek 40 ayarı (varsayılan 5). Günlük iş: sakine hatırlatma, yönetime rapor (K5).
- Teslim doğrulaması ayarı (`code|qr|both`): QR, sakin uygulamasında teslim kodunun QR'ı (`MyPackage.pickup_code`).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Ad | 422 `fields.name` | "Yetkili kişinin adını yazın." |
| Sınır | 409 `delegate_limit` | "En fazla 3 teslim yetkilisi tanımlanabilir." |

## Yetki
Sakin uçları oturum sahibi; görevli `security.packages`.
