# [Servis] Otomatik aylık tahakkuk

## Ekran
Tahakkuk sayfası → **Otomatik aylık tahakkuk** kartı. Kullanan: `finance.charge.post` izni olan.
Kullanım: yönetici her ay elle "Tahakkuku kaydet"e basmak zorunda kalmasın (Apsiyon: "Otomatik Borçlandırma").

## Uç nokta
- `GET /api/v1/sites/{slug}/charge-schedule`
- `PUT /api/v1/sites/{slug}/charge-schedule`

## İstek (`PUT`)
```json
{ "enabled": true, "charge_day": 1, "due_days": 14, "notify_on_run": true }
```

## Beklenen yanıt
`GET` → `200` (ayar hiç kaydedilmediyse varsayılan: kapalı, gün 1, vade 14):
```json
{
  "enabled": true,
  "charge_day": 1,
  "due_days": 14,
  "notify_on_run": true,
  "next_run_on": "2026-11-01",
  "last_run": { "run_id": "0192…", "period": "10/2026", "ran_at": "2026-10-01T03:00:00Z", "status": "posted", "message": null }
}
```
`last_run.status`: `posted` | `skipped` (dönem zaten kesilmiş, proje yok…) | `failed`.
`PUT` → `200`, `{ "data": <aynı nesne>, "message": "Otomatik tahakkuk açıldı; her ayın 1. günü kesilecek." }`

## İş kuralları
- Arka plan işi (docs/02 §6): her gün çalışır, `charge_day` bugün olan ve açık siteler için tahakkuk keser.
- **Elle kaydetmeyle aynı servis** kullanılır: önizleme kuralları, aynı döneme ikinci tahakkuk yok (o ay `skipped`),
  kesinleşmiş işletme projesi yoksa `skipped` + mesaj.
- `charge_date` = o ayın `charge_day`'i, `due_date` = `charge_date + due_days`.
- İdempotent: iş iki kez çalışırsa ikinci koşu `skipped`.
- Önizlemede uyarı varsa (ödeyen yok, ağırlık verisi eksik) kesilir mi? → öneri: **kesilmez**, `skipped` +
  uyarı metni; yönetici elle bakar. Ürün kararı.
- `notify_on_run`: koşu sonucu yöneticilere bildirim (bildirim sağlayıcısı gelene kadar yalnız kayıt — K5).
- Ayar değişikliği denetim kaydına yazılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| `charge_day` 1–28 dışı | 422, `fields.charge_day` | "Gün 1–28 arasında olmalı (her ayda olsun diye)." |
| `due_days` 0–60 dışı | 422, `fields.due_days` | "Vade 0–60 gün olmalı." |

## Yetki
`finance.read` (GET), `finance.charge.post` (PUT). Finans modülü kapalıysa 404.

## Kabul kriterleri
- [ ] Ayar kaydı ve `next_run_on` hesabı (yerel saat, Europe/Istanbul)
- [ ] İş, dönem zaten kesilmişse ikinci tahakkuk üretmiyor
- [ ] `last_run` son koşuyu doğru gösteriyor
- [ ] Yetkisi olmayan rol 403, başka site 404
