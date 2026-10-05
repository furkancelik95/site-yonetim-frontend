# [Servis] Güvenlik olay kaydı

## Ekran
Güvenlik → **Olaylar** sekmesi (`/s/{slug}/guvenlik?sekme=olay`). Kullanan: Güvenlik görevlisi, Yönetici.
Hırsızlık, hasar, gürültü, su baskını gibi olayların kaydı ve kapanışı (Apsiyon: Güvenlik → "Olaylar").

## Uç nokta
- `GET  /api/v1/sites/{slug}/incidents?status=open|closed&page=&page_size=` — yeni üstte, sayfalı
- `POST /api/v1/sites/{slug}/incidents` — olay kaydet
- `POST /api/v1/sites/{slug}/incidents/{id}/close` — kapat (not zorunlu)

## İstek
```json
{ "kind": "damage", "location": "A blok giriş", "description": "Giriş kapısının camı kırık bulundu", "occurred_at": "2026-10-05T08:30:00Z", "unit_id": null }
```
`kind`: `theft` · `damage` · `noise` · `fire` · `water_leak` · `suspicious` · `accident` · `other`. `occurred_at` boşsa şimdi.
Kapat: `{ "note": "Cam değiştirildi" }`.

## Beklenen yanıt
```json
{
  "id": "0192…", "number": 1, "occurred_at": "2026-10-05T08:30:00Z", "kind": "damage", "location": "A blok giriş",
  "description": "Giriş kapısının camı kırık bulundu", "unit_id": null, "unit_name": null,
  "status": "open", "closed_note": null, "closed_at": null, "recorded_by": "Recep Er", "created_at": "2026-10-05T08:31:00Z"
}
```
Yazmalarda `{ "data": …, "message": "#1 numaralı olay kaydedildi." }` / `"#1 numaralı olay kapatıldı."`

## İş kuralları
- `number` site bazında artan.
- Kayıt değiştirilemez, silinmez; yalnız kapatılır. Kapanış notu zorunlu.
- `unit_id` verilirse bölüm aynı sitenin olmalı; `unit_name` yanıtta doldurulur.
- KVKK: açıklamaya kişisel veri yazılabilir; saklama süresi açık karar K8'e eklenmeli.
- Denetim kaydına yazılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Tür geçersiz | 422 `fields.kind` | "Olay türünü seçin." |
| Yer boş | 422 `fields.location` | "Olayın yerini yazın." |
| Açıklama < 5 karakter | 422 `fields.description` | "Ne olduğunu kısaca yazın." |
| Kapanış notu boş | 422 `fields.note` | "Ne yapıldığını yazın." |
| Zaten kapalı | 409 `already_closed` | "Olay zaten kapatıldı." |

## Yetki
Yeni izin önerisi `security.incidents` (Güvenlik, Yönetici; Denetçi okuyabilir). Modül: `visitors` ya da yeni `incidents` — karar Furkan'ın.

## Kabul kriterleri
- [ ] Sayfalı liste, durum filtresi
- [ ] Kapalı olay yeniden kapatılamıyor (409)
- [ ] Yetkisi olmayan rol 403, başka site 404
