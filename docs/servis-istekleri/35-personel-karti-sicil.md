# [Servis] Personel kartına bordro sicil no ve ayrılışta açık işler

Kaynak: Yazılım Dokümanı **IK-01**. İstek 18'in (site personeli) üstüne. Kart–kullanıcı eşleşmesi ve ayrılışta rol
atamalarının kendiliğinden bitmesi **K29**'a bağlı — bu istekte yok.

## Ekran
- **Personel** (`/personel`): formda **Bordro sicil no**; listede sicil no. **Ayrıldı** penceresinde kişinin ileri
  tarihli vardiya sayısı (ilki) ve bekleyen izinleri; "vardiya planından devredin" uyarısı.

## Uç nokta
- `StaffIn` / `StaffOut` alanına `payroll_no` (string | null) — `POST/PATCH …/staff`, `GET …/staff`
- `GET …/staff/{id}/open-items` → `{ "future_shifts": 3, "first_shift": "2026-10-27", "pending_leaves": 0 }`

## İş kuralları
- `payroll_no`: harf, rakam, tire; en fazla 20 karakter; site içinde tekil (409 `payroll_no_taken` önerisi).
  Bordro sistemindeki sicil; T.C. kimlik no **tutulmaz** (KVKK, §9.2).
- Puantaj aktarımı (istek 39) sicil no eksik personel varken başlatılmaz.
- Ayrılış: açık işler yalnız bilgi; ayrılış kaydı engellenmez. Kart silinmez, geçmiş puantaj korunur.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Biçim | 422 `fields.payroll_no` | "Sicil no harf, rakam ve tire; en fazla 20 karakter." |

## Yetki
`staff.manage` (okuma `people.read`).
