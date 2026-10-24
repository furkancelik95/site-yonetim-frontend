# [Servis] Devriye: kontrol noktaları, tur planı, yürütme ve sapma raporu

Kaynak: Yazılım Dokümanı **GUV-09**, §10.3. NFC okuma/eşleme ve çevrimdışı kuyruk mobil uygulamayla; web'de nokta
etiketindeki kod girilir.

## Ekran
- **Devriye** (`/devriye`, yönetim): **Takvim ve rapor** (günün planlı turları: sırada / başlamalı / sürüyor / süre aşıldı /
  tamamlandı / sapmalı / başlamadı; yürütülen turlar, nokta sayısı, süre, sapma), **Kontrol noktaları** (ad, alan, konum,
  etiket QR/NFC, 6 haneli kod; **QR etiketleri** yazdır), **Tur planları** (noktalar ve sırası, sıralı mı, başlangıç
  saatleri, izin verilen süre, atanan rol/kişi).
- **Güvenlik → Devriye** (görevli): tur seç → başlat → nokta kodu gir/okut (+ not) → bitir; bugünkü turlar.

## Uç nokta
- `GET/POST …/patrol-points`, `PATCH …/patrol-points/{id}` — `{ name, location, area, tag: "qr|nfc|both", is_active }` (kod sunucu üretir)
- `GET/POST …/patrol-plans`, `PATCH …/patrol-plans/{id}` — `{ name, point_ids, ordered, start_times: ["22:00"], allowed_minutes, assignee, is_active }`
- `GET  …/patrol-schedule?date=` → `[{ plan_id, plan_name, slot, status, run_id, report }]`
- `GET  …/patrol-runs?date=` · `POST …/patrol-runs` `{ plan_id, slot? }` · `POST …/patrol-runs/{id}/scans` `{ code, note }` · `POST …/patrol-runs/{id}/finish`

Rapor: `{ missed: [ad], out_of_order: [ad], duration_minutes, overtime, late_start_minutes, total_points, scanned_points, ok }`.

## İş kuralları
- Nokta kodu 6 hane, tesis içinde tekil; QR içeriği `SY-DEVRIYE:{kod}` (öneri: imzalı). Okutmada yalnız o anki zaman
  (mobilde o anki konum) kaydedilir; **sürekli konum takibi yok**.
- Okutma: plana ait olmayan nokta 409 `not_in_plan`; aynı nokta ikinci kez 409 `already_scanned`; sıralı turda beklenen
  dışı nokta `out_of_order` işaretlenir (kabul edilir). Bir planın aynı anda tek açık yürütmesi (409 `run_open`).
- Takvim (5 dakikada bir iş): başlangıçtan 15 dk sonra başlamayan tur `not_started` → **yöneticiye anında kritik bildirim**;
  süre aşımı `overdue` → bildirim. Tur bitince sapma özeti yöneticiye (K5).
- Tur sırasında olay kaydı (istek 09) açılabilir; devriye tamamlama oranı güvenlik firması sözleşmesinin KPI'ı olabilir.
- Tarih süzgeci tesis yerel saatine göre.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Kod yok | 422 `fields.code` | "Bu kodla nokta yok." |
| Turda yok | 409 `not_in_plan` | "… bu turda yok." |
| Tekrar | 409 `already_scanned` | "… zaten okutuldu." |
| Açık tur | 409 `run_open` | "Bu turun bitmemiş bir yürütmesi var." |
| Plan alanları | 422 `fields.point_ids/start_times/allowed_minutes` | … |

## Yetki
Kurulum `modules.manage`; yürütme `security.incidents`; rapor site yöneticisi.

## Kabul kriterleri
- [ ] 6 noktalı turda 5 nokta okutulup bitirilince eksik nokta raporda, yöneticiye özet
- [ ] Başlamayan tur 15 dk sonra `not_started`
