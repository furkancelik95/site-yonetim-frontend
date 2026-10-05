# [Servis] Hizmet sözleşmeleri

## Ekran
- Yönetim → **Sözleşmeler** (`/sozlesmeler`): Geçerli / Arşiv; bitiş tarihine göre sıralı tablo, durum rozeti
  (Yürürlükte / N gün kaldı / Süresi doldu), üstte "işlem gerekiyor" uyarısı. **Sözleşme ekle**, **Düzenle**, **Arşivle**.

Apsiyon: Tanımlar → "Cari ve kira sözleşmeleri".

## Uç nokta
- `GET   /api/v1/sites/{slug}/contracts?archived=true|false` — dizi (az kayıt), `end_date`'e göre artan
- `POST  /api/v1/sites/{slug}/contracts`
- `PATCH /api/v1/sites/{slug}/contracts/{id}` — kısmi; `{ "is_archived": true }` arşive kaldırır

## İstek / yanıt
```json
{ "vendor": "Test DENEME Asansör Ltd.", "subject": "4 asansörün aylık bakımı", "category": "elevator",
  "start_date": "2025-12-09", "end_date": "2026-10-25", "amount": "12500.00", "period": "monthly",
  "notice_days": 30, "auto_renew": false, "note": null }
```
Yanıt aynı alanlar + `id`, `is_archived`, `created_at` ve **sunucuda hesaplanan** `days_left` (bugünden bitişe gün),
`state`: `active | expiring | expired | archived`.

## İş kuralları
- `state`: arşivdeyse `archived`; `days_left < 0` → `expired`; `days_left ≤ notice_days` → `expiring`; aksi `active`.
  Gün hesabı sitenin saat diliminde (Europe/Istanbul).
- Tür: `elevator, cleaning, security, garden, maintenance, insurance, pool, other`.
- `amount` para metni (2 ondalık) ya da null; `period`: `monthly | yearly | once`. Sözleşme kaydı **gider yazmaz** —
  ödeme yine Giderler'den girilir. İleride: sözleşmeden tekrarlanan gider (istek 07) oluşturma bağlantısı.
- Silme yok; arşivleme var.
- Sözleşme belgesi (PDF) yükleme: bu sürümde yok; gider belgesi yükleme altyapısıyla aynı kurallar (uzantı + içerik
  doğrulaması, web kökü dışı) kullanılarak eklenebilir.
- İleride: `expiring` olunca yöneticiye bildirim (K5) ve Bugün ekranına uyarı.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.vendor/subject/category/start_date/end_date/amount/period/notice_days` | "Formda düzeltilmesi gereken alanlar var." |
| Bitiş başlangıçtan önce | 422 `fields.end_date` | "Bitiş, başlangıçtan önce olamaz." |

## Yetki
Okuma: `expenses.read`; yazma: `expenses.manage`. **Öneri:** `contracts.manage`.

## Kabul kriterleri
- [ ] `days_left`/`state` sunucu tarihine göre doğru (saat dilimi testi)
- [ ] Arşivlenen kayıt varsayılan listede yok, `archived=true` ile var
- [ ] Başka site 404, yetkisiz 403
