# [Servis] Sayaçlar ve okuma

Kaynak: Yazılım Dokümanı **OPS-05**.

## Ekran
- **Sayaçlar** (`/sayaclar`): dönem seçimi; sayaç listesi (tip, seri no, bölüm / ortak alan, önceki endeks, bu dönem okuma);
  **Oku** (endeks, fotoğraf, "okunamadı" + neden, sayaç değişimi); anormal okumalar için **Onayla** / **Yeniden oku**;
  sayaç ekle/düzenle.
- **Sakin → Emanet ve sayaçlar**: bölümüne bağlı sayaçlar, dönem dönem endeks, tüketim, fotoğraf.

## Uç nokta
- `GET …/meters` · `POST` · `PATCH …/{id}` — `{ kind: "cold_water|hot_water|heat|electric|gas|common", serial, unit_id | area, unit_label, multiplier, installed_on, status }`
- `GET …/meter-readings?period=YYYY-MM` · `POST …/meter-readings` — `{ meter_id, period, value | unreadable_reason, photo, replacement: { old_final, new_serial, new_initial } }`
- `POST …/meter-readings/{id}/approve|reread`
- `GET …/resident/meter-readings` → `[{ meter, readings: [...] }]`

Okuma: `{ id, meter_id, period, value, consumption, prev_value, status: "ok|anomaly|approved|unreadable|reread", reason, photo, by, at, anomaly_percent }`.

## İş kuralları
- Seri no aktif sayaçlar içinde benzersiz; sayaç bölüme ya da ortak alana bağlı olmalı.
- Tüketim = (endeks − önceki endeks) × çarpan. **Endeks düşemez** (sayaç değişimi işaretlenmedikçe).
- Tüketim önceki dönem tüketiminden **%50'den fazla** sapıyorsa `anomaly`; onaylanana ya da yeniden okunana kadar
  dağıtıma girmez. Yeniden okumada eski kayıt `reread` olur.
- Okunamadı (`unreadable_reason` dolu) → endeks girilmez, eksik okumalarda listelenir; dağıtımda tahmin kuralı K23 kapsamında.
- Okumalar tüketime dayalı dağıtıma (FIN-08) girdi olur; dosyadan toplu okuma içe aktarımı (YAP-08) sonraki adım.
- Sakin okumaya itirazı talep olarak açar.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Sayaç alanları | 422 `fields.kind/serial/unit_id` | "Bu seri no kayıtlı." … |
| Dönem | 422 `fields.period` | "Dönem seçin." |
| Okunmuş dönem | 409 `already_read` | "Bu dönem okunmuş." |
| Endeks düştü | 422 `index_decreased` | "Endeks önceki okumadan (…) küçük olamaz; …" |
| Yanlış durum | 409 `invalid_status` | "Yalnız anormal okuma onaylanır ya da yeniden okunur." |

## Yetki
`units.manage`; sakin oturum sahibi (yalnız kendi bölümleri).
