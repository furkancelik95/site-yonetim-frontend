# [Servis] Genel kurul tutanağı ve karar defteri

Kaynak: Yazılım Dokümanı **TOP-04**.

## Ekran
- **Genel kurul → Tutanak**: oylama sonuçlarından otomatik taslak (site, tür, tarih, yer, format; hazirun cümlesi: kişi, arsa
  payı, vekil sayısı, nisap); açılış/divan notu; her madde için karar türü, kişi ve pay sayıları, sonuç, düzenlenebilir görüşme
  notu ve karar metni; **Taslağı kaydet**, **Tutanağı kesinleştir**; sonra **Yazdır / PDF**, imzalı tutanak kaydı; imza alanları.
- **Karar Defteri** (`/karar-defteri`): sıra no, tarih, toplantı ve madde, karar türü, karar metni; yazdır.

## Uç nokta
- `PUT …/meetings/{id}/assembly/minutes` — `{ notes: { [itemId]: text }, decisions: { [itemId]: text }, opening }`
- `POST …/meetings/{id}/assembly/minutes/finalize` · `POST …/meetings/{id}/assembly/minutes/signed` — `{ file_name }`
- `GET …/decision-book` → `[{ no, meeting_id, meeting_title, date, item_title, decision, result, type_name }]`
- Belgede: `GET …/minutes/draft` · `POST …/minutes/finalize` · `POST …/minutes/signed` · `GET …/decision-book`

## İş kuralları
- Taslakta **sonuç ve oy sayıları düzenlenemez**; yalnız notlar ve karar metni.
- Kesinleştirme için tüm maddelerin oylaması kapanmış olmalı. Kesinleşince: mevcut `POST /meetings/{id}/decisions` ucuna
  sonuç (kabul/ret), kişi bazında oy sayıları, karar metni ve katılım notu yazılır (toplantı "yapıldı" olur); **kabul edilen
  kararlar karar defterine site bazında artan sıra numarasıyla** eklenir. Sonra hiçbir şey değişmez.
- Tutanak PDF'i belge arşivine; imzalı tutanak PDF/görsel olarak yüklenir (belge deposu gelince dosya; şimdilik dosya adı).
- Malik ve kiracılara karar özeti duyurusu taslağı hazırlanır (Duyurular'dan yayın).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Kapanmamış madde | 422 `items_open` | "Oylaması kapanmamış madde: …" |
| Kesinleşmiş | 409 `finalized` | "Tutanak kesinleşti; sonuç ve oy sayıları değiştirilemez." |
| İmzalı dosya | 422 `fields.file_name` / 409 `not_finalized` | … |

## Yetki
`meetings.manage`; karar defteri okuma toplantı okuma yetkisi.
