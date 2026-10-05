# [Servis] Kayıp eşya

## Ekran
Güvenlik → **Kayıp eşya** sekmesi (`/s/{slug}/guvenlik?sekme=kayip`). Kullanan: Güvenlik görevlisi, Yönetici.
Bulunan eşyanın kaydı ve sahibine teslimi (Apsiyon: Güvenlik → "Kayıp Eşya").

## Uç nokta
- `GET  /api/v1/sites/{slug}/lost-items?status=waiting|returned|disposed&page=&page_size=`
- `POST /api/v1/sites/{slug}/lost-items`
- `POST /api/v1/sites/{slug}/lost-items/{id}/return` — teslim et ya da elden çıkar

## İstek
```json
{ "description": "Siyah sırt çantası", "location": "Havuz kenarı", "found_by": "Recep Er", "found_at": "2026-10-05T09:00:00Z" }
```
Teslim: `{ "returned_to": "Ayşe Demir" }` · Elden çıkarma (bağış/imha, bekleme süresi dolunca): `{ "disposed": true }`.

## Beklenen yanıt
```json
{
  "id": "0192…", "number": 1, "found_at": "2026-10-05T09:00:00Z", "description": "Siyah sırt çantası", "location": "Havuz kenarı",
  "found_by": "Recep Er", "status": "waiting", "returned_to": null, "returned_at": null, "recorded_by": "Recep Er", "created_at": "2026-10-05T09:01:00Z"
}
```
Mesajlar: `"Kayıp eşya #1 kaydedildi."` · `"Kayıp eşya #1 Ayşe Demir kişisine teslim edildi."` · `"… elden çıkarıldı olarak işaretlendi."`

## İş kuralları
- `number` site bazında artan; kayıt silinmez.
- Yalnız `waiting` durumundaki eşya teslim edilir ya da elden çıkarılır (409).
- Bekleme süresi (ör. 30 gün) ve elden çıkarma kuralı ürün kararı — şimdilik elle.
- Denetim kaydına yazılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Tarif boş | 422 `fields.description` | "Eşyayı tarif edin." |
| Yer boş | 422 `fields.location` | "Bulunduğu yeri yazın." |
| Teslim alan boş | 422 `fields.returned_to` | "Teslim alanın adını yazın." |
| Zaten teslim edildi | 409 `not_waiting` | "Bu eşya zaten teslim edildi ya da elden çıkarıldı." |

## Yetki
`security.incidents` (istek 09 ile aynı izin önerisi).

## Kabul kriterleri
- [ ] Durum filtresi, sayfalı liste
- [ ] Teslim edilen eşya tekrar teslim edilemiyor
- [ ] Yetkisi olmayan rol 403, başka site 404
