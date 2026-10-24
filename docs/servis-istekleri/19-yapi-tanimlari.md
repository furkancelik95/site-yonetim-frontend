# [Servis] Yapı tanımları: ortak alanlar, bölüm tipi, yürürlük tarihli öznitelik, toplu düzenleme, yapı özeti

Kaynak: Yazılım Dokümanı **YAP-02** (Yapı tanımları), YAP-03 S4 (bölüm düzenleme), YAP-02 S5 (toplu düzenleme).

## Ekran
- **Yapı** (`/yapi`): üstte yapı özeti (blok, bölüm, arsa payı toplamı/payda, maliksiz bölüm, hissesi eksik bölüm);
  sekmeler **Bloklar** (gerçek `blocks` uçları), **Bölüm tipleri** (ekle/düzenle), **Ortak alanlar** (ekle/düzenle).
- **Daireler** (`/daireler`): yapı kontrolü uyarısı (maliksiz bölüm, arsa payı uyuşmazlığı); satır seçimi → **Toplu düzenle**
  (tip, kullanım, durum).
- **Bölüm kartı → Düzenle**: *Kimlik bilgileri* gerçek `PATCH units/{id}`; *Ölçü, arsa payı ve tip* **yürürlük tarihli**
  (bu istek). **Geçmiş** sekmesi öznitelik değişikliklerini listeler.

## Uç nokta
- `GET   /api/v1/sites/{slug}/common-areas` — dizi
- `POST  /api/v1/sites/{slug}/common-areas`, `PATCH …/common-areas/{id}`
- `POST  /api/v1/sites/{slug}/unit-types`, `PATCH …/unit-types/{id}` (GET zaten var)
- `PATCH /api/v1/sites/{slug}/units/{id}/attributes` — yürürlük tarihli ölçü/pay/tip
- `GET   /api/v1/sites/{slug}/units/{id}/attribute-history` — dizi, yeniden eskiye
- `POST  /api/v1/sites/{slug}/units/bulk-update`
- `GET   /api/v1/sites/{slug}/structure/summary`

## İstek / yanıt
Ortak alan:
```json
{ "name": "Kapalı havuz", "kind": "pool", "block_id": null, "is_reservable": true, "is_active": true, "note": null }
```
`kind`: `pool | hall | gym | garden | playground | parking | technical | roof | other`. Yanıt: aynı alanlar + `id`, `block_name`.

Bölüm tipi: `{ "name": "3+1", "weight": "1.25", "sort_order": 3 }` → `UnitTypeOut`.

Yürürlük tarihli öznitelik:
```json
{ "effective_from": "2026-11-01", "gross_area": "142.50", "net_area": "118.00",
  "land_share_numerator": 12, "land_share_denominator": 1000, "unit_type_id": "…" }
```
Yalnız gönderilen alanlar değişir. Yanıt `{ data: UnitDetail, message }`. Geçmiş kaydı:
```json
{ "id": "…", "effective_from": "2026-11-01", "changes": { "gross_area": { "from": "140.00", "to": "142.50" } },
  "changed_by": "Test DENEME", "created_at": "2026-10-24T09:00:00Z", "applied": true }
```
Toplu düzenleme: `{ "unit_ids": ["…"], "changes": { "unit_type_id": "…", "usage": "commercial", "is_active": true } }`
→ `{ data: { updated: 12, failed: [{ unit_id, message }] }, message }`.

Yapı özeti:
```json
{ "unit_count": 120, "active_unit_count": 118, "block_count": 3,
  "land_share_sum": 998, "land_share_denominator": 1000, "land_share_mismatch": true, "units_without_land_share": 2,
  "units_without_owner": [{ "id": "…", "display_name": "B-7" }],
  "units_shares_incomplete": [{ "id": "…", "display_name": "A-4", "total": "50.00" }],
  "common_area_count": 4 }
```

## İş kuralları
- Ortak alan adı site içinde tekil; `block_id` boşsa tüm siteye ait. Rezerve edilebilir alanlar rezervasyon modülüne bağlanacak (modül sonra).
- Bölüm tipi adı tekil; `weight` ondalık (varsayılan 1), aidat kuralında tipe göre dağıtımda katsayı.
- **Yürürlük tarihli öznitelikler (YAP-02 S3):** m², arsa payı ve tip geçmişi tutulur; tahakkuk, hesapladığı dönemin
  yürürlükteki değerini kullanır. `effective_from` **kapanmış döneme düşemez** (en erken içinde bulunulan ayın başı →
  422 `period_locked`). İleri tarih kabul edilir, `applied=false`; tarih gelince uygulanır (zamanlanmış iş).
  Geçmiş tahakkuklar değişmez. Pay ve payda birlikte gönderilir.
- Toplu düzenleme yalnız tip / kullanım / durum; m² ve arsa payı toplu değişmez (yürürlük tarihi ister).
  Satır satır uygulanır; başarısızlar `failed` ile döner, diğerleri geri alınmaz.
- Yapı özeti `land_share_denominator`: etkin bölümlerde en sık kullanılan payda; `mismatch` = toplam pay ≠ payda.
  Uyarı kayıt engellemez; canlıya geçiş kontrol listesi (istek 26) bu özetten beslenir.
- Hepsi denetim kaydına yazılır (`entity=units|common_areas|unit_types`).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.*` | "Formda düzeltilmesi gereken alanlar var." |
| Kapanmış döneme yürürlük | 422 `period_locked`, `fields.effective_from` | "Yürürlük tarihi geçmiş bir döneme düşemez; en erken 01.10.2026." |
| Değişen alan yok | 422 `no_change` | "Değişen bir alan yok." |
| Ortak alan / tip adı mükerrer | 422 `fields.name` | "Bu adla bir … var." |
| Toplu düzenlemede bölüm yok | 422 `fields.unit_ids` | "En az bir bölüm seçin." |

## Yetki
Okuma: `units.read`; yazma: `units.manage`.

## Kabul kriterleri
- [ ] Ay başından önceki `effective_from` reddedilir; ileri tarih planlanır ve tarihinde uygulanır
- [ ] Değişiklik sonrası geçmiş dönem tahakkuku değişmez; sonraki tahakkuk yeni değeri kullanır
- [ ] Özet: maliksiz bölüm ve hisse toplamı ≠ %100 olan bölümler doğru listelenir
- [ ] Toplu düzenlemede kısmi hata diğer satırları etkilemez
- [ ] Başka site 404, yetkisiz 403
