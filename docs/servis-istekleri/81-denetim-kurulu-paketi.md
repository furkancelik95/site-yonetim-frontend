# [Servis] Denetim kurulu paketi

Kaynak: Yazılım Dokümanı **RAP-05** (denetim paketi kısmı; planlı rapor e-postası K5 sonrası).

## Ekran
**Denetim Paketi** (`/denetim-paketi`): **Paket hazırla** (ad, dönem başı–sonu, arşivden belgeler); paket kartı: gelir–gider,
bütçe–gerçekleşme, kasa ve banka, karar defteri bağlantıları; dönemdeki kararlar; eklenen belgeler; durum. Denetçi (salt okunur)
**Denetim raporu**nu Belgeler'den seçip not ile ekler → "Denetlendi".

## Uç nokta
- `GET …/audit-packages` · `POST …/audit-packages` — `{ title, from, to, document_ids }`
- `POST …/audit-packages/{id}/report` — `{ document_id, note }` (belgede `POST …/audit-packages`, `…/{pid}/report`)

## İş kuralları
- Paket dönemdeki karar defteri kayıtlarını (istek 77) ve seçilen belgeleri anlık olarak bağlar; finansal tablolar ilgili rapor
  ekranlarına dönemle bağlanır (backend dönem sonu PDF'lerini paket içinde dondurmalı).
- Paketi muhasebe/yönetim hazırlar (`finance.charge.post`); denetçi (`audit.read`) salt okunur görür ve raporunu ekler,
  paket "denetlendi" olur ve arşivlenir; ikinci rapor eklenmez.
- Planlı rapor gönderimi (rapor, periyot, alıcılar, format; yetkisiz alıcı eklenemez) e-posta sağlayıcısı seçilince (K5).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alanlar | 422 `fields.title/from/to` | "Bitiş başlangıçtan önce olamaz." |
| Denetçi değil | 403 `forbidden` | "Denetim raporunu denetçi yükler." |
| Rapor belgesi | 422 `fields.document_id` | … |
| Zaten denetlendi | 409 `invalid_status` | … |

## Yetki
Hazırlama `finance.charge.post`; rapor ekleme `audit.read`.
