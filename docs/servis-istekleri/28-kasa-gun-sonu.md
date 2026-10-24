# [Servis] Kasa gün sonu sayımı

Kaynak: Yazılım Dokümanı **FIN-11**. Mevcut `cash-accounts` uçlarına ek.

## Ekran
- **Kasa ekstresi** (`/kasa/{id}`, yalnız `kind=cash`): **Gün sonu sayımı** kartı — kapanmamış hareketli günler, gün seçimi,
  sayılan nakit, fark varsa gerekçe; kapanan günler tablosu (sistem, sayım, fark, kapatan).

## Uç nokta
- `GET  /api/v1/sites/{slug}/cash-accounts/{id}/days` → `{ kind, open_days: ["2026-09-24"], closed: [CashDay] }`
- `POST …/cash-accounts/{id}/days/close` — `{ "date": "2026-09-24", "counted": "2400.00", "reason": null }`

CashDay: `{ date, system_balance, counted, difference, reason, closed_by, closed_at }`.

## İş kuralları
- `system_balance` = o günün sonundaki ekstre bakiyesi; `difference = counted − system_balance`.
- Fark ≠ 0 ise gerekçe zorunlu (en az 10 karakter) → 422 `difference_reason`. Belgede fark "kasa farkı" onay kuralından
  geçer (K21'e bağlı); o zamana kadar gerekçeli kapanış.
- Kapanan gün değişmez; o güne tarihli yeni kasa hareketi 422 `cash_day_closed` (düzeltme ertesi gün fişle).
- Gelecek gün kapatılamaz; aynı gün iki kez kapatılamaz (409 `day_closed`). Banka hesabında 409 `not_cash`.
- Açık (hareketli, kapanmamış) kasa günü dönem kapanışını engeller (istek 27, `cash_days`).
- `open_days`: son 60 günde hareketi olup kapanmamış günler, eskiden yeniye.
- Birden fazla kasa: her kasa ayrı sayılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Fark var, gerekçe yok | 422 `difference_reason`, `fields.reason` | "Sayım sistem bakiyesinden 50,00 ₺ eksik. Farkın gerekçesini yazın." |
| Gün kapalı | 409 `day_closed` | "Bu gün zaten kapatılmış; hata ertesi gün düzeltme fişiyle giderilir." |
| Banka hesabı | 409 `not_cash` | "Gün sonu sayımı yalnız kasa hesaplarında yapılır…" |
| Kapalı güne hareket | 422 `cash_day_closed` | "Bu kasa günü kapatıldı; hareketi bugüne girin." |

## Yetki
Okuma `finance.cash.read`; kapatma `finance.cash.manage`.

## Kabul kriterleri
- [ ] Sistem 2.400, sayım 2.350 → gerekçesiz 422, gerekçeyle kapanır, fark −50,00
- [ ] Kapanan güne tarihli kasa hareketi reddedilir
