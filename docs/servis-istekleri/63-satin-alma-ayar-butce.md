# [Servis] Satın alma ayarları ve bütçe kontrolü

Kaynak: Yazılım Dokümanı **15.2** ve **SAT-01** (bütçe gösterimi).

## Ekran
- **Satın alma → Ayarlar** (`/satin-alma?sekme=ayar`): tutar eşikleri ve asgari teklif sayısı, son eşiğin üstü, fatura tutar
  toleransı (%), teklif linki geçerliliği (gün).
- **Yeni satın alma talebi** formunda kategori seçilince bütçe satırı: yıllık bütçe, bu yıl harcanan, açık taahhüt, **kalan**;
  tahmini toplam kalanı aşarsa "Bütçe aşımı" uyarısı; tutara göre gereken teklif sayısı.

## Uç nokta
- `GET/PUT …/purchase-settings` — `{ thresholds: [{ max: "10000.00", quotes: 1 }, { max: "100000.00", quotes: 2 }], above_quotes: 3, tolerance_percent: 1, link_days: 7 }`
- `GET …/purchase-budget?category_id=` → `{ has_budget, annual, spent, committed, remaining }`

## İş kuralları
- Varsayılan: < 10.000 TL → 1, 10.000–100.000 TL → 2, > 100.000 TL → 3 teklif; tolerans %1; link 7 gün.
- Eşikler küçükten büyüğe; teklif sayısı 1–10; tolerans %0–10; link 1–30 gün.
- **Bütçe**: `annual` = yürürlükteki işletme projesinde (budget-plans/current) bu gider kategorisine bağlı kalemlerin yıllık
  toplamı; `spent` = bu yılın iptal/ters kayıt olmayan giderleri; `committed` = onay bekleyen/onaylı satın alma talepleri +
  faturası kapanmamış siparişler; `remaining = annual − spent − committed`. Kategoride kalem yoksa `has_budget: false`
  (bütçe aşımı işaretlenmez).
- Belgede bütçe gerçekleşmesi (8.10) ile aynı hesap kullanılmalı.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Eşik | 422 `fields.thresholds` | "Eşikler küçükten büyüğe sıralanmalı." … |
| Diğer | 422 `fields.above_quotes/tolerance_percent/link_days` | … |
| Kategori yok | 422 `fields.category_id` | "Kategori seçin." |

## Yetki
Ayar yazma `expenses.manage`; okuma `expenses.read`.
