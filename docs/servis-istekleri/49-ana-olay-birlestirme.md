# [Servis] Ana olay ve birleştirme önerisi

Kaynak: Yazılım Dokümanı **HIZ-02**, §12.3. **K27:** `incidents` güvenlik olay kaydı olarak kalır; "ana olay" ayrı ad
alır — öneri: `outages`.

## Ekran
- **Talep ayrıntısı → "Bu talepler aynı arıza olabilir"**: son N saatte aynı kategori ve konumdaki açık talepler ve açık ana
  olaylar; **Ana olay oluştur** (başlık + sakinlerin göreceği genel açıklama) ya da **Bu olaya bağla**; bağlıysa bilgi kutusu.
- **Ana olaylar** (`/talepler/ana-olaylar`): olay, bağlı talep sayısı, durum; **Çözüldü** (çözüm açıklaması).
- **Sakin → Taleplerim**: bağlı talepte ana olayın başlığı ve genel açıklaması.

## Uç nokta
- `GET/POST …/outages` — `{ title, category, location, public_description, request_ids }`
- `POST …/outages/{id}/links` `{ request_id }` · `POST …/outages/{id}/unlink` `{ request_id }`
- `POST …/outages/{id}/resolve` — `{ resolution }`
- `GET  …/requests/{id}/merge-suggestions` → `{ linked_outage, similar: [{ id, number, title, unit_name, location, created_at }], open_outages, window_hours }`

## İş kuralları
- Öneri **kural tabanlı** (yapay zekâ yok): aynı kategori + (aynı konum metni **ya da** ikisi de ortak alan **ya da** aynı
  blok) + `merge_window_hours` (istek 47, varsayılan 24) içinde açılmış, kapanmamış talepler; aynı kategorideki açık ana olaylar.
  Yönetici bağlar ya da yok sayar.
- Bir talep en fazla bir ana olaya bağlı (409 `already_linked`); çözülmüş olaya bağlanamaz.
- **Ana olay çözülünce bağlı tüm talepler `resolved` olur** (çözüm notu = olay çözümü) ve her sakine bildirim gider (K5).
  Atomik olmalı; sahte servis talepleri tek tek günceller.
- Sakin ana olayın genel açıklamasını görür; diğer sakinlerin taleplerini görmez.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.title/category/public_description` | … |
| Zaten bağlı | 409 `already_linked` | "Talep zaten bir ana olaya bağlı." |
| Çözülmüş | 409 `outage_resolved` | "Çözülmüş ana olaya talep bağlanamaz." |

## Yetki
`requests.assign`; sakin yalnız kendi talebindeki özet.

## Kabul kriterleri
- [ ] 12 talebin bağlı olduğu ana olay çözülünce 12 talep `resolved` ve 12 bildirim
- [ ] Öneri yalnız pencere içindeki aynı kategori/konum taleplerini getirir
