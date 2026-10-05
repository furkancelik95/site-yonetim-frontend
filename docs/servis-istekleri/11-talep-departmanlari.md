# [Servis] Talep departmanları

## Ekran
- Talepler → **Departmanlar** düğmesi: departman ekle / yeniden adlandır / pasifleştir.
- Talep ayrıntısı → **Departman** seçimi.
- Talep listesi ve **pano**: departmana göre süzme (`?departman=` adreste).

Apsiyon: İş takibi → "Departmanlar", "Departmana Göre Görevler".

## Uç nokta
- `GET   /api/v1/sites/{slug}/departments` — dizi
- `POST  /api/v1/sites/{slug}/departments` — `{ "name": "Peyzaj" }`
- `PATCH /api/v1/sites/{slug}/departments/{id}` — `{ "name"?: …, "is_active"?: false }`
- `POST  /api/v1/sites/{slug}/requests/{id}/department` — `{ "department_id": "…" | null }`
- **Mevcut uçlara ek:** `GET …/requests` ve `GET …/requests/{id}` yanıtına `department_id`, `department_name`;
  `GET …/requests?department_id=` süzgeci.

## Beklenen yanıt
```json
[ { "id": "0192…", "name": "Teknik", "is_active": true, "request_count": 3 } ]
```
Talep yanıtında:
```json
{ "id": "…", "number": 6, "title": "Bahçe sulama sistemi arızalı", "…": "…", "department_id": "0192…", "department_name": "Teknik" }
```
Yazmalarda `{ "data": …, "message": "Talep \"Teknik\" departmanına yönlendirildi." }`.

## İş kuralları
- Site kurulumunda varsayılan departmanlar: Teknik, Temizlik, Güvenlik, Bahçe, Yönetim (öneri).
- Ad site içinde benzersiz (Türkçe büyük/küçük harf duyarsız) → 409.
- Silme yok; **pasifleştirme** var. Pasif departmana yeni talep atanamaz, eskiler yerinde kalır.
- Departman ataması talep geçmişine olay olarak yazılır (`assigned` türü ya da yeni `department_changed`).
- Kişiye atama (`assignee`) ayrı kalır; ikisi birlikte kullanılabilir.
- İleride: departmana göre otomatik yönlendirme (kategori → departman), departman bazlı SLA — şimdilik yok.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Ad < 2 karakter | 422 `fields.name` | "Departman adı en az 2 karakter." |
| Aynı ad var | 409 `already_exists` | "\"Teknik\" adında bir departman var." |
| Pasif/başka sitenin departmanı | 422 `fields.department_id` | "Geçerli bir departman seçin." |

## Yetki
Liste: `requests.read`. Ekle/düzenle ve atama: `requests.assign`.

## Kabul kriterleri
- [ ] `department_id` süzgeci sayfalamayla doğru çalışıyor
- [ ] Pasif departmana atama 422
- [ ] Yetkisi olmayan rol 403, başka site 404
