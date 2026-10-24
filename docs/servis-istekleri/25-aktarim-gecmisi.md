# [Servis] Aktarım geçmişi, araç ve açılış bakiyesi aktarımı, geri alma

Kaynak: Yazılım Dokümanı **YAP-06** (Toplu veri aktarımı) S3, S4, S5. Bölüm aktarımı (`imports/units`) zaten var.

## Ekran
- **İçeri aktarım** (`/iceri-aktar`): sekmeler **Bölümler ve kişiler** (mevcut), **Araçlar**, **Açılış bakiyeleri**
  (şablon indir → yükle → önizleme → onay; açılış bakiyesinde **eski sistem toplamı** girilir, tutmazsa aktarılmaz).
  Altta **Aktarım geçmişi**: tür, dosya, satır → kayıt, yapan, durum, **Geri al** (7 gün).

## Uç nokta
- `GET  /api/v1/sites/{slug}/imports` — dizi (geçmiş), bölüm aktarımları dahil
- `POST /api/v1/sites/{slug}/imports/vehicles` — multipart `file` (.xlsx ya da .csv)
- `POST /api/v1/sites/{slug}/imports/opening-balances` — multipart `file`
- `POST /api/v1/sites/{slug}/imports/{id}/confirm` — gövde `{ "reconciliation_total": "123456.78" }` (yalnız açılış bakiyesi)
- `POST /api/v1/sites/{slug}/imports/{id}/rollback`
- Şablonlar: `GET …/imports/vehicles/template.xlsx`, `GET …/imports/opening-balances/template.xlsx` (frontend şimdilik CSV
  şablonu kendi üretiyor)

## İstek / yanıt
Önizleme (iki tür için ortak):
```json
{ "import_id": "…", "type": "opening_balances", "total_rows": 120, "importable_count": 118, "total_amount": "245300.00",
  "issues": [{ "row_number": 7, "column": "Referans", "message": "Hesap bulunamadı: X", "severity": "error" }],
  "rows": [{ "row_number": 2, "account_id": "…", "reference_code": "…", "unit_name": "A-4", "person_name": "Test DENEME",
             "amount": "1250.00", "direction": "debit", "date": "2026-10-01", "ok": true }],
  "expires_at": "2026-10-24T15:00:00Z" }
```
Araç satırı: `{ row_number, unit_id, unit_name, plate, plate_display, brand_model, color, ok }`.

Onay yanıtı: `{ data: { created: 118, skipped: ["7. satır (…)"], total_amount }, message }`.

Geçmiş kaydı:
```json
{ "id": "…", "type": "units | vehicles | opening_balances", "file_name": "…", "status": "imported | rolled_back",
  "row_count": 120, "created_count": 118, "total_amount": null, "created_by": "Test DENEME", "created_at": "…",
  "rollback_until": "…", "rollback_blocked_by": null, "can_rollback": true }
```

## İş kuralları
- Sütunlar — araç: `Bölüm | Plaka | Marka | Renk`; açılış bakiyesi: `Referans | Tutar | Tarih` (tutar borç +, alacak −;
  TR biçimi `1.250,00` kabul). İlk satır başlık; hatalı satır aktarılmaz (araç), açılış bakiyesinde **hiç hata olmamalı**
  (409 `rows_invalid`).
- **Mutabakat (YAP-06 S4):** açılış bakiyesi onayında `reconciliation_total` zorunlu; yüklenen toplamla kuruşuna kadar
  eşit değilse 409 `reconciliation_mismatch` (fark mesajda). Her satır `POST accounts/{id}/opening-balance` ile aynı
  deftere yazılır (açıklama "Açılış bakiyesi aktarımı (dosya)"), satır başına idempotent anahtar
  `import-{import_id}-{row}`.
- Aktarım araçları `addVehicle` kuralından geçer (plaka biçimi, sınır); başka bölümde etkin plaka aktarımda `force` sayılır.
- **Geri alma:** onaydan sonra 7 gün; o aktarımın oluşturduğu kayıtlar kaldırılır (araç → pasif, bölüm → silinir/pasif,
  açılış bakiyesi → ters kayıt). Kayıtlara sonradan hareket girildiyse (tahsilat, tahakkuk) geri alma engellenir
  (`rollback_blocked_by` açıklamayla). Geri alma denetim kaydına yazılır.
- Önizleme 6 saat geçerli; süre dolunca dosya yeniden yüklenir.
- Mevcut `imports/units/{id}/confirm` de geçmişe yazılmalı (`type=units`).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Dosya tipi | 422 `invalid_file_type` | "Yalnız .xlsx ya da .csv yüklenebilir." |
| Sütun eksik | 422 `invalid_file_content` | "Başlıkta Referans kodu ve Tutar sütunları gerekli." |
| Hatalı satır (bakiye) | 409 `rows_invalid` | "Bakiye aktarımında tüm satırlar temiz olmalı; …" |
| Toplam tutmuyor | 409 `reconciliation_mismatch` | "Yüklenen toplam (…) eski sistem toplamıyla (…) tutmuyor; fark … ₺." |
| Önizleme yok/doldu | 404 `not_found` | "Önizleme bulunamadı ya da süresi doldu; dosyayı yeniden yükleyin." |
| Geri alma süresi | 409 `rollback_expired` | "Geri alma süresi (7 gün) doldu." |
| Geri alma engelli | 409 `rollback_blocked` | `rollback_blocked_by` metni |

## Yetki
Araç aktarımı: `units.manage`. Açılış bakiyesi: `finance.manage` (öneri: onay kuralı ile 202). Geri alma: aynı izinler.

## Kabul kriterleri
- [ ] Toplam 1 kuruş farklıysa 409; eşitse tüm satırlar deftere girer, ekstrelerde görünür
- [ ] Aynı önizleme iki kez onaylanamaz (idempotent)
- [ ] 7 gün içinde geri alma kayıtları kaldırır; hareket girilmiş hesapta engellenir
- [ ] Geçmişte bölüm aktarımları da listelenir
