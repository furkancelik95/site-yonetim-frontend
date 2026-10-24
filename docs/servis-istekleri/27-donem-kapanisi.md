# [Servis] Dönem kapanışı ve kilit

Kaynak: Yazılım Dokümanı **FIN-13**.

## Ekran
- **Dönem kapanışı** (`/donem-kapanisi`): yıl seçimi, ay ay dönem listesi (Açık / Kapanışta / Kilitli / Süreli açık),
  seçili dönemin **kontrol listesi** (her eksik maddede "Git" ve gerekçeli istisna alanı), **Kapanışı başlat**,
  **Kilitle**, **Açığa al**, **Kilidi süreli aç**, geçmiş.

## Uç nokta
- `GET  /api/v1/sites/{slug}/fiscal-periods?year=2026` — dizi, yeniden eskiye (içinde bulunulan ay dahil)
- `GET  …/fiscal-periods/{period}/close-checklist` — `period` = `YYYY-MM`
- `POST …/fiscal-periods/{period}/start-close` — `{ "exceptions": { "cash_days": "gerekçe…" } }`
- `POST …/fiscal-periods/{period}/lock`
- `POST …/fiscal-periods/{period}/reopen` — kapanıştan açığa
- `POST …/fiscal-periods/{period}/unlock-requests` — `{ "reason": "…", "hours": 4 | 24 | 72 }`

## Yanıt
```json
{ "period": "2026-09", "label": "Eylül 2026", "status": "closing", "is_past": true,
  "exceptions": { "cash_days": "…" }, "closing_started_by": "Test DENEME", "locked_by": null, "locked_at": null,
  "unlock_until": null, "history": [{ "at": "…", "by": "…", "action": "start_close", "note": null }] }
```
Kontrol listesi: `{ period, items: [{ key, label, ok, detail, link, required, exception }] }`. Maddeler:
`charge` (dönem tahakkuku kesinleşti, zorunlu) · `cash_days` (hareketli kasa günleri sayımla kapandı — istek 28, zorunlu) ·
`approvals` (bekleyen onay talebi yok, zorunlu) · `expenses` (ödenmemiş gider, uyarı) · `bank` (eşleşmeyen banka hareketi,
uyarı — kuyruk henüz yok) · `accounting` (aktarılmamış muhasebe fişi yok — istek 32, zorunlu).

## İş kuralları
- Durumlar: Açık → Kapanışta → Kilitli; Kilitli → (istisnai) Süreli açık → Kilitli.
- İçinde bulunulan ya da gelecek ay kapanışa alınamaz (409 `period_not_ended`).
- Kapanış: zorunlu maddeler `ok` olmalı ya da her biri için en az 10 karakterlik gerekçeli istisna
  (409 `checklist_incomplete`). İstisnalar kapanış raporunda listelenir.
- **İki kişi kuralı:** kilitleme, kapanışı başlatan kişiden farklı bir yetkili tarafından yapılır (409 `four_eyes`).
  Belgede bu "dönem kilidi" onay kuralı; onay mekanizmasına bağlanması K21'e bağlı — o zamana kadar iki kişi kuralı.
- **Kilitli dönemde hiçbir finansal kayıt eklenemez/değişmez:** tahsilat, tahakkuk, gider, kasa hareketi, iade, açılış
  bakiyesi, ters kayıt — tarihi kilitli döneme düşen her yazma 422 `period_locked` (mesajda en erken açık dönem).
  Kapanışta durumundayken yeni işlem bir sonraki açık döneme yönlendirilir (tarih önerisi).
- Süreli açma: gerekçe en az 20 karakter; süre bitince kendiliğinden yeniden kilitlenir; açıkken yapılan işlemler denetim
  kaydına `period_unlocked` etiketiyle yazılır. Öneri: YK onayına bağlanır (K21).
- Her durum değişikliği denetim kaydına yazılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Ay bitmedi | 409 `period_not_ended` | "İçinde bulunulan ya da gelecek dönem kapatılamaz." |
| Eksik madde | 409 `checklist_incomplete` | "Eksik maddeler var: …" |
| Aynı kişi kilitliyor | 409 `four_eyes` | "Kilitleme, kapanışı başlatan kişiden farklı bir yetkili tarafından yapılmalı (iki kişi kuralı)." |
| Yanlış durum | 409 `invalid_status` | … |
| Kilitli döneme yazma | 422 `period_locked` | "Tarih kilitli döneme düşüyor; en erken Ekim 2026." |

## Yetki
Okuma: `finance.read`; kapanış/kilit/açma: `finance.charge.post` (öneri: ayrı `finance.period.close`).

## Kabul kriterleri
- [ ] Kapanmamış kasa günü varken gerekçesiz kapanış 409
- [ ] Başlatan kişi kilitleyemez; ikinci yetkili kilitler
- [ ] Kilitli döneme tarihli tahsilat 422 `period_locked`
- [ ] Süreli açma süresi dolunca dönem yeniden kilitli
