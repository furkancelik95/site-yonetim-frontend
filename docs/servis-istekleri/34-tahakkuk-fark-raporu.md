# [Servis] Tahakkuk fark raporu

Kaynak: Yazılım Dokümanı **FIN-05** (taslak ekranı, fark raporu sekmesi). Tahakkuk kaynağı (K23) ve finans sorumlusu
(K22) bu isteğin dışında.

## Ekran
- **Tahakkuk** önizlemesinin altında **Fark raporu**: son kesinleşmiş döneme göre eşik üstü artan/azalan, yeni ve bu
  dönem olmayan hesaplar; sayılar rozet, satırlar cari hesaba bağlantılı.

## Uç nokta
- `GET /api/v1/sites/{slug}/charge-runs/preview/diff?charge_date=&due_date=` — önizleme ile aynı parametreler

```json
{ "period": "11/2026", "base_period": "10/2026", "threshold": 10, "compared": 96,
  "counts": { "increase": 4, "decrease": 2, "new": 3, "missing": 1 },
  "rows": [{ "account_id": "…", "unit_name": "A-4", "person_name": "…", "account_kind": "occupant",
             "previous": "9626.11", "current": "10820.00", "change_percent": 12.4, "flag": "increase" }] }
```

## İş kuralları
- Karşılaştırma: önizlemedeki her hesap ↔ son kesinleşmiş (ters kaydedilmemiş) koşudaki aynı hesap.
- `|değişim| ≥ diff_threshold_percent` (istek 33, varsayılan %10) → `increase|decrease`; önceki dönemde yok → `new`;
  bu dönemde yok → `missing`. Önceki kesinleşmiş koşu yoksa `base_period: null`, boş liste.
- Belgedeki diğer işaretler — "sorumlusu belirsiz" (K22), "tüketim verisi eksik" (sayaç modülü), "muafiyet uygulanan"
  (aidat kuralı, K23) — kararlar gelince eklenir.
- Salt okuma; kayıt oluşturmaz. Büyük sitede (3.000 bölüm) tek istekte hesaplanmalı (sahte servis sayfa sayfa okuyor).

## Yetki
`finance.read`.

## Kabul kriterleri
- [ ] Aynı veriyle iki çağrı aynı sonucu verir
- [ ] Eşik değişince işaretli satırlar buna göre değişir
