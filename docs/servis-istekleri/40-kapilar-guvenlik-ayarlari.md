# [Servis] Kapılar ve güvenlik ayarları

Kaynak: Yazılım Dokümanı **GUV-08**, §10.2.

## Ekran
- **Güvenlik ayarları** (`/ayarlar/guvenlik`): kapılar (ad, tip araç/yaya/servis, bağlı bloklar, 7/24, etkin);
  habersiz ziyaretçi yöntemi (bilgi bildirimi / sakin onayı + bekleme süresi) ve kapı bazında istisna; kargo teslim
  doğrulaması; uzun bekleyen kargo günü; ziyaretçi verisi saklama süresi; ziyaretçiden alınacak alanlar; misafir parkı kapasitesi.

## Uç nokta
- `GET/POST /api/v1/sites/{slug}/gates`, `PATCH …/gates/{id}` — `{ name, kind: "vehicle|pedestrian|service", block_ids, always_open, is_active }`
- `GET/PUT …/settings/security`
```json
{ "unannounced_method": "info", "approval_timeout_seconds": 90, "gate_methods": { "<gate_id>": "approval" },
  "parcel_method": "both", "visitor_fields": { "plate": true, "phone": false, "id_seen": false },
  "retention_months": 6, "parcel_long_wait_days": 5, "guest_parking_capacity": 10 }
```

## İş kuralları
- Habersiz ziyaretçi: `info` → görevli kaydeder, ziyaretçi girer, sakine bilgi; `approval` → istek 42. Kapı istisnası site ayarını ezer.
- `approval_timeout_seconds` 30–600 (varsayılan 90). `parcel_method`: `code | qr | both` (varsayılan ikisi).
- **Saklama:** platform üst sınırı 24 ay (422 `retention_limit`); süre dolan ziyaretçi ve plaka kayıtları gece işiyle
  anonimleşir. Tam T.C. kimlik no hiçbir seçenekte tutulmaz; "kimlik görüldü" yalnız işaret. Süreler hukuk onayı bekliyor (K8).
- Ayarlar versiyonlanır; kapı ekranlarına hemen yansır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Saklama > 24 ay | 422 `retention_limit` | "Saklama süresi en fazla 2 yıl (24 ay) olabilir." |
| Alan hatası | 422 `fields.*` | "Formda düzeltilmesi gereken alanlar var." |

## Yetki
`modules.manage` (site yöneticisi); okuma güvenlik rolünde de (kapı listesi ve yöntem).
