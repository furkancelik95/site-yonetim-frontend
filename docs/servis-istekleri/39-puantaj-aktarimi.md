# [Servis] Puantaj aktarımı (Mod P: dosya)

Kaynak: Yazılım Dokümanı **IK-05**. Mod K'da Kivi bordrosuna gönderim [KİVİ] — A-01 sonrası.

## Ekran
- **Puantaj → Aylık aktarım** (`/puantaj?sekme=aktarim`): ay seçimi; kesinleşmemiş günler ve sicil no eksik personel
  uyarısı; personel bazında özet; **Aktarım dosyası** (iner ve ay kilitlenir); aktarım geçmişi (yeniden indir).

## Uç nokta
- `GET  /api/v1/sites/{slug}/timesheet-exports/preview?month=2026-10` → `{ month, rows, missing_days, missing_payroll, exported }`
- `POST …/timesheet-exports` — `{ "month": "2026-10" }`
- `GET  …/timesheet-exports` — geçmiş; `GET …/timesheet-exports/{id}/file`

Satır: `{ staff_id, payroll_no, name, worked_days, worked_hours, overtime_hours, night_hours, absent_days, leave_annual, leave_excuse, leave_sick, leave_unpaid, holiday_hours }`.

## İş kuralları
- Ayın tüm puantaj günleri kesinleşmeden aktarım başlamaz (409 `days_not_final`, günler mesajda). Sicil no eksik
  personel varken 409 `payroll_missing`. Ay bitmeden 409 `month_not_ended`.
- Aktarılan ay **kilitlenir** (409 `already_exported`); düzeltme sonraki dönemde ayrı kayıtla.
- Dosya (CSV, `;`, UTF-8 BOM): Dönem, Bordro sicil no, Ad soyad, Çalışılan gün, Çalışma saati, Fazla mesai saati, Gece
  çalışması saati, Devamsız gün, izin türleri bazında gün, Resmî tatil çalışması. Resmî tatil takvimi (S-03) gelene kadar
  `holiday_hours` 0. Bordro biçimi muhasebe/bordro programına göre netleşecek (K7 ile birlikte).
- Bordro hesabı platformda yapılmaz.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Kesinleşmemiş gün | 409 `days_not_final` | "Kesinleşmemiş günler var: … Aktarım başlatılamaz." |
| Sicil no eksik | 409 `payroll_missing` | "Bordro sicil no eksik: … Personel kartından girin." |
| Zaten aktarıldı | 409 `already_exported` | "Bu ayın puantajı aktarıldı ve kilitli…" |

## Yetki
`staff.manage` (muhasebe de okuyabilmeli — öneri `finance.read` ile okuma). Modül `staff`.
