# [Servis] Aylık hizmet karnesi ve ceza kesintisi

Kaynak: Yazılım Dokümanı **15.3** ve **SAT-06** (sözleşme ve aylık karne akışı).

## Ekran
**Sözleşme ayrıntısı → Aylık karne** (`/sozlesmeler/{id}?sekme=karne&donem=YYYY-MM`): dönem seçimi; KPI tablosu (kaynak ve
açıklaması — ör. "3 denetim ortalaması" —, hedef, gerçekleşen, puan, ağırlık; veri yoksa ve elle KPI'da giriş kutusu), toplam
skor; yönetici yorumu; **Değerleri kaydet**, **Karneyi kesinleştir**. Ceza kartı: tetiklenen kurallar, kesinti tutarı, dönem
faturasının beklenen tutarı; **Kesintiyi onayla / Reddet**; onaydan sonra kopyalanabilir tedarikçi bildirim taslağı.

## Uç nokta
- `GET …/contracts/{id}/scorecards/{period}` → `{ id, contract_id, period, rows: [{ kpi_id, name, source, target, weight, actual, score, detail }], total, comment, status: "draft|finalized", penalty: { amount, reasons, status: "none|pending|approved|rejected", decided_by, note } | null, monthly_amount, expected_invoice, finalized_by, finalized_by_id, finalized_at }`
- `PATCH …/contracts/{id}/scorecards/{period}` — `{ values: { [kpi_id]: number | null }, comment }` (yalnız elle girilebilen KPI'lar)
- `POST …/contracts/{id}/scorecards/{period}/finalize`
- `POST …/contracts/{id}/scorecards/{period}/penalty` — `{ decision: "approve|reject", note }`
- Belgede: `GET …/contracts/{cid}/scorecards` · `POST …/scorecards/{sid}/finalize`

## İş kuralları
- Taslak karne her açılışta kaynaklardan yeniden hesaplanır (dönem sonunda zamanlanmış iş de üretir); elle girilen değerler
  korunur. Kaynaklı değer elle ezilemez.
- KPI puanı = min(100, gerçekleşen / hedef × 100); toplam skor ağırlıklı ortalama.
- **Ceza**: kural için `gerçekleşen < hedef × (1 − below_percent/100)` ise kesinti; yüzde kesinti aylık bedel üzerinden.
  Belgedeki kabul senaryosu doğrulandı: 20.000 TL/ay, denetim hedefi 85, gerçekleşen 72, "hedefin %10'undan fazla altında
  → %5" → **1.000 TL** kesinti onaya düşer.
- Kesinleştirme: dönem bitmeden yapılamaz; tüm KPI'ların gerçekleşeni dolu olmalı; kesinleşen karne değişmez. Ceza varsa
  `pending` olur ve onay kuralı **"Ceza kesintisi"**ne düşer (onay modülüne yeni işlem türü gerekir); **karneyi kesinleştiren
  onaylayamaz**.
- Onaylanan kesinti o dönemin tedarikçi faturasının **beklenen tutarını** düşürür (`expected_invoice`); üçlü eşleşme (istek 66)
  bu tutara göre yapılır. Mod K'da kesinti bilgisi Kivi'ye iletilir [KİVİ]. Tedarikçiye bildirim taslağı üretilir (gönderim K5).
- Karne PDF'i ve arşivi belge modülüyle (RAP); yenileme kararında son 12 ay karneleri sözleşme genel sekmesinde.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Dönem biçimi | 422 `fields.period` | "Dönem seçin." |
| Değer aralığı | 422 `fields.values.{kpi_id}` | "0–100." |
| Dönem açık | 409 `period_open` | "Dönem bitmeden karne kesinleşmez." |
| Eksik değer | 422 `missing_values` | "Gerçekleşeni eksik KPI: …" |
| Kesinleşmiş | 409 `finalized` | "Kesinleşmiş karne değiştirilemez." |
| Kendi kesinleştirdiğini onaylama | 403 `self_approval` | "Karneyi kesinleştiren kişi kesintiyi onaylayamaz." |
| Ret gerekçesi | 422 `fields.note` | … |

## Yetki
`contracts.manage`.
