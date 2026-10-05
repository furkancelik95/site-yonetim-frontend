# [Servis] Site personeli

## Ekran
- Yönetim → **Personel** (`/personel`): Çalışan / Ayrılan; ad, görev ve vardiya, kadro (site kadrosu ya da taşeron firma),
  telefon, çalışma tarihi. **Personel ekle**, **Düzenle**, **Ayrıldı** (ayrılış tarihi).
- Not: sisteme giriş yetkisi ayrı — Kullanıcılar ekranından (istek 12) verilir. Personel kaydı hesap açmaz.

Apsiyon: Site → "Personel" (bordro dökümü ve eğitim formları bu isteğin dışında).

## Uç nokta
- `GET   /api/v1/sites/{slug}/staff?active=true|false` — dizi
- `POST  /api/v1/sites/{slug}/staff`
- `PATCH /api/v1/sites/{slug}/staff/{id}` — kısmi; `{ "end_date": "2026-10-05" }` ayrılış

## İstek / yanıt
```json
{ "full_name": "Test DENEME", "position": "Kapı görevlisi", "employer": "contractor", "contractor_name": "Test DENEME Güvenlik A.Ş.",
  "phone": "+905321112233", "start_date": "2026-10-05", "end_date": null, "shift": "Hafta içi 08:00–17:00" }
```
Yanıt aynı alanlar + `id`.

## İş kuralları
- **KVKK — veri minimizasyonu:** yalnız iş için gerekenler. T.C. kimlik no, maaş, bordro, adres, sağlık bilgisi
  **tutulmaz** (bordro muhasebe tarafında; açık karar K7).
- Ad 3–60 karakter, harf; telefon isteğe bağlı, E.164 `+905XXXXXXXXX`.
- `employer = contractor` ise `contractor_name` zorunlu; ileride sözleşmeler (istek 16) ile bağlanabilir.
- Silme yok; ayrılış tarihi girilir. `active=true` → ayrılışı olmayan ya da ayrılışı bugün/ileride olanlar.
- Ayrılan personelin verisi için saklama süresi açık karar **K8**.
- Telefon numarasını kimin göreceği: `people.read` olanlar. Güvenlik rolü göremez.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.full_name/position/employer/contractor_name/phone/start_date/end_date` | "Formda düzeltilmesi gereken alanlar var." |
| Ayrılış başlangıçtan önce | 422 `fields.end_date` | "Ayrılış tarihi başlangıçtan önce olamaz." |

## Yetki
Okuma: `people.read`; yazma: `people.manage`. **Öneri:** `staff.manage`.

## Kabul kriterleri
- [ ] `active` süzgeci bugünün tarihine göre doğru
- [ ] Taşeronda firma adı zorunlu
- [ ] Başka site 404, yetkisiz 403
