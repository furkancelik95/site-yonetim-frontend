# [Servis] Sözleşme performans tanımları: tedarikçi bağlantısı, KPI, ceza ve artış kuralı

Kaynak: Yazılım Dokümanı **SAT-06** ve **15.3**. Sözleşme kartı (`/contracts`) backend'de; bu istek ona eklenen performans katmanı.

## Ekran
**Sözleşme ayrıntısı** (`/sozlesmeler/{id}`, listede firma adı bağlantı):
- **Genel**: bedel, bitişe kalan gün, tedarikçi puanı, son karne; 60 gün içinde biten için yenileme uyarısı; onay bekleyen
  artış / eksik endeks uyarısı; son 12 ay karneleri (skor, durum, kesinti).
- **KPI ve ceza**: tedarikçi kartı seçimi; KPI'lar (ad, kaynak, SLA için talep kategorisi, hedef %, ağırlık; ağırlık toplamı
  göstergesi); ceza kuralları ("KPI hedefin %Y fazla altındaysa bedelden %Z / sabit ₺ kesinti").
- **Fiyat artışı** sekmesindeki kural formu (istek 70).

## Uç nokta
- `GET …/contracts/{id}/performance` → `{ vendor_id, vendor: { id, name, rating_avg, rating_count } | null, kpis, penalties, escalation, escalations, monthly_amount, escalation_preview, last_scorecards: [{ period, total, status, penalty }] }`
- `PUT …/contracts/{id}/performance` — `{ vendor_id, kpis: [{ id?, name, source: "inspection|patrol|tasks|sla|manual", target, weight, request_category }], penalties: [{ id?, kpi_id, below_percent, cut_kind: "percent|fixed", cut_value }], escalation: { kind: "none|tufe|ufe|avg|fixed", fixed_rate, period: "yearly|semiannual", cap } }`

## İş kuralları
- KPI hedefi 1–100 (%), ağırlık 1–100, **ağırlıkların toplamı 100**. KPI silinince ona bağlı ceza kuralları da silinir.
- KPI kaynakları: denetim listesi puanı (OPS-03, ayın denetim skorlarının ortalaması), devriye tamamlama oranı (GUV-09,
  okutulan nokta / plandaki nokta), görevli görev tamamlama oranı (OPS-06), talep SLA uyumu (HIZ, ayda kapanan taleplerden
  SLA içinde kapananların oranı; isteğe bağlı talep kategorisi), elle giriş. **Kaynak modülü kapalıysa ya da o ay veri
  yoksa KPI elle girilir.**
- Ceza kuralı eşiği `below_percent` 0–99; yüzde kesinti 1–100 ve sözleşmede aylık/yıllık bedel gerektirir (aylık bedel =
  aylık bedel ya da yıllık/12); sabit kesinti > 0.
- Artış kuralı için sözleşmede bedel olmalı; sabit oran %0,01–200; tavan boş ya da > 0.
- Tedarikçi kartı bağlantısı isteğe bağlı (istek 62); sözleşmenin `vendor` metni korunur. İleride sözleşme formunda tedarikçi
  seçimi doğrudan yapılabilir.
- Aylık sabit hizmet gider taslağı belgede çerçeve sözleşmeden üretilir; mevcut **Tekrarlanan giderler** (backend'de var)
  sözleşmeye bağlanarak karşılanabilir — karar Furkan'da.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| KPI alanları | 422 `fields.kpis.{i}.name/source/target/weight` | … |
| Ağırlık toplamı | 422 `fields.kpis` | "Ağırlıkların toplamı 100 olmalı." |
| Ceza alanları | 422 `fields.penalties.{i}.kpi_id/below_percent/cut_kind/cut_value`, `fields.penalties` | … |
| Artış alanları | 422 `fields.escalation.kind/fixed_rate/cap` | "Artış için sözleşmede bedel olmalı." … |

## Yetki
Okuma sözleşme okuma yetkisi; yazma `contracts.manage`.
