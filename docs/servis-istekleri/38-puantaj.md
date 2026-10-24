# [Servis] Günlük puantaj ve istisna düzeltme

Kaynak: Yazılım Dokümanı **IK-04**. QR/konum doğrulamalı vardiya giriş-çıkışı (`POST /me/attendance-events`) personel
hesabına (K29) bağlı — bu istekte yok; puantaj yalnız plandan ve İK düzeltmesinden.

## Ekran
- **Puantaj → Günlük puantaj** (`/puantaj`): gün seçimi; satırlar (personel, vardiya, durum Çalıştı / Gelmedi / İzinli,
  çalışma süresi, gece süresi, istisna); **Düzelt** (durum, geç gelme, erken çıkış, fazla mesai dakikası, **gerekçe zorunlu**);
  **Günü kesinleştir**.

## Uç nokta
- `GET   /api/v1/sites/{slug}/timesheets?date=2026-10-12` → `{ date, is_final, finalized_by, finalized_at, rows }`
- `PATCH …/timesheets/{assignment_id}` — `{ "status": "worked|absent", "late_minutes", "early_leave_minutes", "overtime_minutes", "reason" }`
- `POST  …/timesheets/finalize` — `{ "date" }`

Satır: `{ id, staff_id, staff_name, position, payroll_no, template, planned_minutes, night_minutes, status, leave_type, late_minutes, early_leave_minutes, overtime_minutes, worked_minutes, reason, fixed_by, is_exception }`.

## İş kuralları
- Beklenen çalışma = vardiya süresi − mola. Onaylı izin günü → `leave` (türüyle); vardiyası olmayan izinli personel de satır.
- `worked_minutes = planned − geç − erken + fazla mesai`. Gece çalışması: 22:00–06:00 arasına düşen dakikalar.
- Belgede gece 01:00'de önceki günün puantajı üretilir; giriş-çıkış doğrulaması açıksa (K29 sonrası) kayıtlarla
  karşılaştırılıp istisnalar (tolerans dakikası tesis ayarı) işaretlenir.
- Düzeltme gerekçeli ve denetim kayıtlı. Kesinleşen gün değişmez (409 `timesheet_final`); o günün vardiya ataması
  kaldırılamaz, izni iptal edilemez.
- İçinde bulunulan ya da gelecek gün kesinleştirilemez (409 `day_not_ended`).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Gerekçe yok | 422 `fields.reason` | "Düzeltme gerekçesi zorunlu." |
| Dakika aralığı | 422 `fields.late_minutes` … | "0–960 dakika." |
| Kesin gün | 409 `timesheet_final` | "Bu günün puantajı kesinleşti; düzeltme yapılamaz." |
| Gün bitmedi | 409 `day_not_ended` | "Gün bitmeden puantaj kesinleşmez." |

## Yetki
`staff.manage`. Modül `staff`.

## Kabul kriterleri
- [ ] 08:00–16:00, 60 dk mola, 20 dk geç → 6 sa 40 dk
- [ ] 16:00–00:00 vardiyada gece çalışması 2 saat
- [ ] Kesinleşen güne düzeltme 409
