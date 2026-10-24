# [Servis] Stok sayımı

Kaynak: Yazılım Dokümanı **OPS-02** (stok kartı ve hareketleri backend'de; bu istek yalnız sayım).

## Ekran
**Demirbaş ve Stok → Sayım** (`/demirbas?sekme=sayim`): asgari seviyenin altındakiler uyarısı; tüm malzemeler için sistem
miktarı, **sayılan** girişi ve anlık fark; **Sayımı kaydet**; sayım geçmişi (tarih, kişi, kalem, farklar).

## Uç nokta
- `GET …/stock-counts` (yeniden eskiye)
- `POST …/stock-counts` — `{ lines: [{ item_id, counted: "12.5" }] }` → `{ id, lines: [{ item_id, name, system, counted, diff }], created_by, created_at }`

## İş kuralları
- Yalnız girilen malzemeler sayılır. Fark ≠ 0 ise **"Sayım farkı"** notlu stok hareketi yazılır (fazla → giriş, eksik → çıkış);
  tek işlem (transaction) içinde.
- Belgede sayım farkı **onaya bağlı** (K21 onay mekanizması); karar gelene kadar doğrudan hareket. Onay gelince fark hareketi
  onaydan sonra yazılmalı.
- Asgari seviye uyarısından satın alma talebi önerisi satın alma paketiyle (SAT) bağlanacak.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Boş sayım | 422 `fields.lines` | "En az bir malzeme." |
| Geçersiz miktar | 422 `fields.lines.{item_id}` | "Geçersiz miktar." |
| Bilinmeyen malzeme | 404 `not_found` | … |

## Yetki
`inventory.manage`.
