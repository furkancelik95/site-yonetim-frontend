# [Servis] Kişiler: mükerrer önerisi, birleştirme, malik değişimi (satış / veraset)

Kaynak: Yazılım Dokümanı **YAP-04** (Kişiler ve ilişkiler) S2, S3, S6. Finans sorumlusu ataması (S5) ortak kararı
bekliyor (K22) — bu istekte yok.

## Ekran
- **Kişiler** (`/kisiler`): arama, düzenleme (gerçek `PATCH people/{id}`), özel alanlar; üstte **mükerrer olabilecek
  kayıtlar** kartı — hangi kayıt kalacak seçilir, "Birleştir (geri alınamaz)".
- **Bölüm kartı → Satış / veraset**: neden, devir tarihi, yeni malikler (kayıtlı kişi ara ya da yeni kişi), hisse
  toplamı %100; devir öncesi borç "eski malikte kalır" (tek seçenek, K10).

## Uç nokta
- `GET  /api/v1/sites/{slug}/people/duplicates` — dizi
- `POST /api/v1/sites/{slug}/people/merge`
- `POST /api/v1/sites/{slug}/units/{id}/ownership-transfer`

## İstek / yanıt
Mükerrer grupları:
```json
[{ "key": "+905321112233", "kind": "phone", "people": [PersonOut, PersonOut] }]
```
Birleştirme: `{ "keep_id": "…", "merge_id": "…" }` → `{ data: { kept: PersonOut, merged: PersonOut }, message }`.

Malik değişimi:
```json
{ "reason": "sale", "transfer_date": "2026-11-01", "debt_policy": "stays_with_seller",
  "new_owners": [
    { "person_id": "…", "share_percent": "50.00" },
    { "person": { "first_name": "Test", "last_name": "DENEME", "phone": "+905321112233", "email": null }, "share_percent": "50.00" }
  ] }
```
`reason`: `sale | inheritance`. Yanıt `{ data: UnitDetail, message }`.

## İş kuralları
- Mükerrer önerisi aynı normalize telefon (E.164) ya da aynı küçük harfli e-posta ile; **otomatik birleştirme yok**,
  yönetici seçer. Birleştirme: `merge_id` kişinin tüm ilişkileri (parties), cari hesapları, kayıt başvuruları, belgeleri
  ve geçmişi `keep_id`'ye taşınır; `merge_id` pasif/silinmiş işaretlenir, listelerde görünmez. **Geri alınamaz**,
  denetim kaydına yazılır. Giriş hesabı olan kişi birleştiriliyorsa hesap kalan kişiye bağlanır (iki hesap varsa 409 öner).
- Malik değişimi **tek işlemde (atomik)**: yürürlükteki tüm malik ilişkileri kapanır (bitiş günü dahil sayıldığından
  `end_date = transfer_date − 1 gün`), yeni malikler `start_date = transfer_date` ile `owner` olarak başlar; hisse toplamı
  tam %100 (±0.01). Mevcut "hisse toplamı %100'ü aşamaz" kuralı bu işlemde aynı gün için çakışma saymamalı.
  Kiracı/oturan ilişkileri değişmez.
- `debt_policy` yalnız `stays_with_seller` (K10 — borcun yeni malike devri hukuki teyit bekliyor). Eski malikin cari
  hesabı açık kalır, borç orada durur; yeni malike yeni cari açılır (mevcut parties kuralı).
- Devir tarihi, kapanmış döneme düşemez (istek 19 ile aynı kural: 422 `period_locked`).
- Yeni malik `person_id` ile kayıtlı kişi ya da `person` ile yeni kişi; yeni kişide telefon/e-posta mükerrerse 409 öner
  (`person_exists`, mevcut kişinin id'si ile) — frontend o kişiyi seçtirir.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| İki ayrı kişi seçilmemiş | 422 `validation` | "Birleştirilecek iki ayrı kişi seçin." |
| Hisse toplamı ≠ 100 | 422 `fields.new_owners` | "Yeni maliklerin hisse toplamı tam %100 olmalı (şu an %60,00)." |
| Borç devri istenmiş | 422 `not_supported`, `fields.debt_policy` | "Satış öncesi borcun yeni malike devri hukuki teyit bekliyor (K10)…" |
| Kişi yok | 404 `not_found` | "Kişi bulunamadı." |

## Yetki
Mükerrer/birleştirme: `people.manage`. Malik değişimi: `units.manage` (öneri: onay kuralı `ownership_transfer` ile
onaya düşebilsin — 202 `approval_pending` kalıbı).

## Kabul kriterleri
- [ ] Birleştirme sonrası eski kişinin ilişkileri ve cari hesapları kalan kişide; eski kişi listede yok
- [ ] Devirde eski malik `end_date = transfer_date`, yeni malikler `start_date = transfer_date`, hisse %100
- [ ] Devir sırasında bir adım hata verirse hiçbir ilişki değişmez
- [ ] Başka site 404, yetkisiz 403
