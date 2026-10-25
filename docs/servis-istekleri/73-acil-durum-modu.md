# [Servis] Acil durum modu, durum panosu ve toplanma alanı yoklaması

Kaynak: Yazılım Dokümanı **ILT-04**, **ILT-06** (yoklama) ve **16.2**, **16.4**.

## Ekran
- **Acil Durum** (`/acil-durum`): aktif değilse **Acil durumu başlat** (tür, kapsam: tüm tesis / seçili bloklar, mesaj; onay
  penceresi). Aktifse kırmızı bant; KPI (güvende, toplanma alanında, yardım istiyor, yanıt yok/toplam); **yardım isteyenler**
  en üstte (not, kişi, zaman); blok blok bölüm kutuları (durum renk + metin), duruma göre süz, **Yanıt yok listesi** (CSV);
  kutulara dokunarak seçip **toplanma alanında işaretle**; **Acil durumu bitir**. **Geçmiş** sekmesi: özetler ve silinme tarihi.
- **Sakin**: ana sayfada kırmızı uyarı + **Durumumu bildir**; `/sakin/{slug}/acil-durum`: **Güvendeyim**, toplanma alanı seçip
  **Toplanma alanındayım**, not + **Yardım lazım**; bildirimin alındığı bilgisi; altında acil bilgi kartı (istek 74).

## Uç nokta
- `POST …/emergencies` — `{ kind: "earthquake|fire|flood|gas|other", scope: "all|blocks", block_ids, message }`
- `GET …/emergencies/active` → `{ id, kind, scope, block_ids, message, started_by, started_at, audit, rows: [{ unit_id, unit_name, block_id, block_name, status: "safe|muster|help|none", note, muster_point, by, at }], totals: { total, safe, muster, help, none } }` ya da `null`
- `GET …/emergencies` (geçmiş: özet, `purge_on`) · `POST …/emergencies/{id}/end` (belgede `…/board`, `…/end`)
- `POST …/emergencies/{id}/muster-checks` — `{ unit_ids, muster_point }`
- `GET …/resident/emergency` → `{ id, kind, message, started_at, units: [{ unit_id, unit_name, status }], muster_points }` ya da `null`
- `POST …/resident/emergency/status` — `{ status: "safe|help|muster", note, muster_point }` (belgede `/me/emergencies/{eid}/status`)

## İş kuralları
- Aynı anda tek aktif acil durum. **Başlatma onay gerektirmez, denetim kaydına yazılır** (`audit`). Başlatma yetkisi yönetici
  ve yetki verilmiş güvenlik amiri.
- **Kapsamdaki bölümler başlatma anında sabitlenir** (sakin ve güvenlik bölüm listesini okuyamaz; sahte serviste bu yüzden
  ilk sürümde 500 alındı ve düzeltildi).
- Kapsamdaki herkese (hane üyeleri dahil) **sessiz saat ve bildirim tercihlerini aşan** push + SMS (K5); belge kabulü:
  200 bölüme 30 saniye içinde.
- Sakin yanıtı bölümün tüm kapsamdaki bölümlerine yazılır; son yanıt geçerlidir. "Yardım lazım" panoda en üste çıkar;
  **yardım isteyen bölüm yoklamayla kapanmaz** (ekip yönlendirilir).
- Yoklama yöntemleri: listeden işaretleme (burada) ve sakinin beyanı; sakinin kişisel QR'ı, noktadaki QR/NFC ve çevrimdışı
  toplayıp birleştirme mobil uygulamayla.
- Bitirince özet saklanır; "güvendeyim"/yoklama ayrıntısı **30 gün sonra silinir** (`purge_on`; süre avukat teyidine bağlı,
  A-04). Hassas kişi beyanı (yardıma muhtaç kişi) Faz 2.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Aktif varken başlatma | 409 `already_active` | "Zaten aktif bir acil durum var." |
| Alanlar | 422 `fields.kind/message/block_ids` | "Kapsamda bölüm yok." … |
| Aktif değil | 409 `not_active` | … |
| Yoklama | 422 `fields.unit_ids/muster_point` | … |
| Sakin kapsam dışı | 403 `forbidden` | "Bölümünüz bu acil durumun kapsamında değil." |

## Yetki
Başlatma/bitirme `announcements.publish` ya da `security.incidents`; pano ve yoklama ayrıca `security.visitors`; sakin oturum sahibi.
