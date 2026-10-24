# [Servis] Dönem dışı ücretler

Kaynak: Yazılım Dokümanı **FIN-06**. Aidat tahakkuku (işletme projesi, K23) bu istekten etkilenmez.

## Ekran
- **Dönem dışı ücretler** (`/ek-ucretler`): ücret ekle (bölüm, malik/oturan hesabı, kaynak, tutar, vade, açıklama),
  liste (durum: cariye yazıldı / sonraki tahakkukta / iptal), iptal (gerekçe), **kaynak bazında yansıma** ayarı.

## Uç nokta
- `GET/PUT /api/v1/sites/{slug}/settings/ad-hoc-charges` — `{ "sources": { "reservation": { "mode": "immediate|next_period", "due_days": 10 }, "service": …, "renovation": …, "penalty": …, "other": … } }`
- `GET  …/ad-hoc-charges?status=posted|waiting_next_run|cancelled`
- `POST …/ad-hoc-charges` — `{ "unit_id", "account_kind": "owner|occupant", "source", "description", "amount", "due_date": null }`
- `POST …/ad-hoc-charges/{id}/cancel` — `{ "reason" }`
- İç servis (rezervasyon, ücretli hizmet, tadilat modülleri gelince): `createAdHocCharge(source, unit, amount, dueRule)`

## İş kuralları
- `immediate`: ücret bölümün seçilen cari hesabına **tek kalem borç** olarak yazılır (öneri: yeni ledger kaynağı
  `ad_hoc_charge`); vade = `due_date` ya da bugün + `due_days`.
- `next_period`: "bekleyen ek kalem"; bir sonraki tahakkuk koşusunda o hesaba "ek kalemler" başlığıyla eklenir.
- İptal silmez: yazılmış ücret ters kayıtla kapanır; bekleyen ücret tahakkuka eklenmez.
- Hesap seçilen türde açık değilse 422 `no_account`.
- Muhasebe fişi kaynağıdır (istek 32). Belgede elle ücret "Dönem dışı ücret" onay kuralından geçer — K21.
- Sahte servis ücreti cariye yazmıyor; ekran bunu açıkça söylüyor.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.unit_id/account_kind/source/description/amount/due_date` | "Formda düzeltilmesi gereken alanlar var." |
| Hesap yok | 422 `no_account` | "Bu bölümde açık oturan hesabı yok." |
| Zaten iptal | 409 `already_cancelled` | "Ücret zaten iptal edilmiş." |

## Yetki
Okuma `finance.read`; yazma `finance.charge.post`.

## Kabul kriterleri
- [ ] `immediate` ücret ekstrede kendi vadesiyle görünür, bakiyeye eklenir
- [ ] `next_period` ücret bir sonraki tahakkukta "ek kalemler" başlığında
- [ ] İptal ters kayıt üretir, orijinal satır durur
