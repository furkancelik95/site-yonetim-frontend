# [Servis] Vardiya şablonları ve haftalık plan

Kaynak: Yazılım Dokümanı **IK-02**. Personelin mobilde "Vardiyam"ı ve değişiklik bildirimi personel hesabına (K29) ve
bildirim servisine (K5) bağlı.

## Ekran
- **Vardiya planı** (`/vardiya`): **Haftalık plan** — personel × 7 gün ızgarası; hücrede vardiya ekle/kaldır; onaylı izin
  günleri gri; çakışmalar kırmızı (nedeni üzerinde); "önceki haftayı kopyala"; **Yayınla** (çakışma varsa onayla);
  durum Taslak / Yayında, yayından sonra değişen atama sayısı. **Vardiya şablonları** — ad, başlangıç–bitiş (gece
  ertesi güne taşar), mola, görev, kapı/yer, etkin.

## Uç nokta
- `GET  /api/v1/sites/{slug}/shift-templates`; `POST …/shift-templates`; `PATCH …/shift-templates/{id}`
- `GET  …/shift-plans?from=2026-10-12&to=2026-10-18` → `{ from, to, staff, templates, assignments, leaves, conflicts, published, changed_after_publish }`
- `POST …/shift-plans/assignments` — `{ "staff_id", "date", "template_id" }` (yanıtta o atamanın `conflicts`'i)
- `DELETE …/shift-plans/assignments/{id}`
- `POST …/shift-plans/copy-week` — `{ "from_week": "2026-10-05", "to_week": "2026-10-12" }` (pazartesiler)
- `POST …/shift-plans/publish` — `{ "week": "2026-10-12", "acknowledge_conflicts": true }`

Şablon: `{ id, name, start: "08:00", end: "16:00", break_minutes: 60, position, location, is_active }`.
Atama: `{ id, staff_id, date, template_id, changed_after_publish }`. Çakışma: `{ assignment_id, kind: "overlap|leave|rest", message }`.

## İş kuralları
- `end ≤ start` → vardiya ertesi güne taşar. Mola 0–180 dk. Şablon adı tekil. Kapalı şablon yeni atamada çıkmaz.
- Çakışma kontrolleri: aynı kişiye zamanı çakışan vardiya; onaylı izin günü (istek 37); iki vardiya arası **11 saatten az
  dinlenme** [belge: ÖNERİ — iş mevzuatı teyidi]. Çakışma atamayı ve yayını **engellemez**; yayında
  `acknowledge_conflicts` ister (409 `conflicts`).
- Aynı kişi + gün + şablon ikinci kez atanamaz (409 `duplicate`). Puantajı kesinleşmiş günün ataması kaldırılamaz
  (409 `timesheet_final`).
- Yayından sonra eklenen/değişen atama `changed_after_publish`; personel bildirimi K29/K5 ile.
- Kopyalama var olan atamaları korur, yalnız eksikleri ekler.
- Plan; puantajın (istek 38), devriye turu ve görevli görevlerinin (sonraki paketler) kaynağıdır.

## Yetki
`staff.manage`; okuma `people.read`. Modül `staff`.

## Kabul kriterleri
- [ ] İzinli personele o gün vardiya atanınca çakışma `leave` döner
- [ ] Gece 00–08 ardından 16–24 (aynı gün) → dinlenme 8 saat, `rest` uyarısı
- [ ] Çakışmalı hafta `acknowledge_conflicts` olmadan yayınlanmaz
