# [Servis] Muhasebe aktarımı (Mod P): hesap kodu eşlemesi ve fiş dosyası

Kaynak: Yazılım Dokümanı **FIN-14** (Mod P), §8.4. Açık karar **K7**: dosya biçimi ve hesap planı mali müşavirle netleşecek.

## Ekran
- **Muhasebe aktarımı** (`/muhasebe-aktarimi`): dönem seçimi, aktarılmamış fiş önizlemesi (sayı, tutar, daha önce
  aktarılan), eksik eşleme uyarısı, **Dosyayı üret** (iner ve kilitlenir), **Hesap kodu eşlemesi**, **Aktarım geçmişi**
  (yeniden indir).

## Uç nokta
- `GET/PUT /api/v1/sites/{slug}/accounting/mappings` — `{ "items": [{ "key", "label", "debit_account", "credit_account" }] }`
- `GET  …/accounting/exports/preview?period=2026-09` → `{ period, vouchers: [Voucher], already_exported, total, missing_mappings: [] }`
- `POST …/accounting/exports` — `{ "period": "2026-09" }` → ExportBatch
- `GET  …/accounting/exports` — geçmiş; `GET …/accounting/exports/{id}/file` — dosyayı yeniden indir

Voucher: `{ key, source, source_id, date, description, debit_account, credit_account, amount }`.
Eşleme anahtarları: `charge`, `ad_hoc_charge`, `payment_cash`, `payment_bank_transfer`, `payment_credit_card`,
`payment_other`, `expense` (sonra: `refund`, `opening_balance`, `cash_movement`, `late_fee`, tedarikçi faturası).

## İş kuralları
- Fiş kaynakları (dönem içi): kesinleşmiş tahakkuk koşusu (koşu başına bir fiş), tahsilat (yöntem bazında; ters
  kaydedilenler hariç), ödenmiş gider (`paid_on` dönemde), dönem dışı ücret. Her fiş tek borç + tek alacak satırı.
- **Her fiş bir kez aktarılır ve kilitlenir**; düzeltme ters fişle (yeni dosyada). Aynı dönem ikinci kez aktarılırsa yalnız
  yeni fişler gelir.
- Eşlemesi eksik işlem tipi varsa aktarım başlatılmaz (409 `mapping_missing`). Eşleme değişikliği yalnız sonraki dosyaları
  etkiler (versiyonlu).
- Dosya biçimi: şimdilik genel CSV (`;`, UTF-8 BOM; sütunlar: Fiş tarihi, Kaynak, Kaynak no, Açıklama, Borç hesabı,
  Alacak hesabı, Tutar). Kivi/Logo/Mikro biçimi K7 kararından sonra `AccountingExportAdapter` ile eklenir. Ekrandaki
  varsayılan kodlar (120/600/100/102/108/770) yalnız öneridir — mali müşavir teyidi gerekir.
- Üretilen dosya saklanır; denetim kaydına yazılır. Aktarılmamış fiş dönem kapanışını engeller (istek 27).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Eşleme eksik | 409 `mapping_missing` | "Hesap kodu eşlemesi eksik: Tahsilat — diğer. Aktarım başlatılamaz." |
| Fiş yok | 409 `nothing_to_export` | "Bu dönemde aktarılmamış fiş yok." |
| Hesap kodu biçimi | 422 `fields.{key}.debit_account` | "Hesap kodu rakam ve nokta (ör. 120.01)." |

## Yetki
`finance.charge.post` (öneri: `finance.accounting.export`); okuma `finance.read`.

## Kabul kriterleri
- [ ] Aktarılmış fiş yeni dosyaya tekrar girmez
- [ ] Ters kaydedilen tahsilat dosyada yok (ya da ters fişle)
- [ ] Dosyadaki borç toplamı = alacak toplamı
