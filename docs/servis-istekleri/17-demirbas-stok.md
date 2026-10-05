# [Servis] Demirbaş ve stok

## Ekran
- Yönetim → **Demirbaş ve Stok** (`/demirbas`), iki sekme:
  - **Demirbaş**: liste (kod, ad, grup, yer, zimmet, alış tarihi/bedeli, durum), durum süzgeci, **Demirbaş ekle**, **Düzenle**.
  - **Stok**: malzeme listesi (mevcut, asgari, Azaldı/Yeterli), **Malzeme ekle**; satırda **Giriş / çıkış** formu ve son 10 hareket.

Apsiyon: Site → "Stok (giriş, çıkış, envanter, depo)", "Demirbaş".

## Uç nokta
Demirbaş:
- `GET   /api/v1/sites/{slug}/assets?status=in_use|broken|retired`
- `POST  /api/v1/sites/{slug}/assets`
- `PATCH /api/v1/sites/{slug}/assets/{id}`

Stok:
- `GET  /api/v1/sites/{slug}/stock-items`
- `POST /api/v1/sites/{slug}/stock-items` — `{ "name": "…", "unit_label": "litre", "min_quantity": "5", "location": "…" }`
- `GET  /api/v1/sites/{slug}/stock-items/{id}/moves` — yeniden eskiye
- `POST /api/v1/sites/{slug}/stock-items/{id}/moves` — `{ "direction": "in" | "out", "quantity": "12.5", "note": "…" }`

## Beklenen yanıt
```json
{ "id": "…", "code": "DB-0001", "name": "Çim biçme makinesi", "category": "Bahçe ekipmanı", "location": "B blok depo",
  "acquired_on": "2026-04-02", "value": "18500.00", "status": "in_use", "assignee": null, "note": null }
```
```json
{ "id": "…", "name": "Çamaşır suyu", "unit_label": "litre", "quantity": "4.5", "min_quantity": "5", "location": null }
```
Hareket yanıtı: `{ "data": { "item": <malzeme>, "move": { "id": "…", "direction": "out", "quantity": "8", "note": null, "moved_at": "…", "moved_by": "…" } }, "message": "…" }`.

## İş kuralları
- Demirbaş kodu sitede sıralı ve benzersiz (`DB-0001`), sunucu verir, değişmez.
- Demirbaş silinmez; `retired` (kullanım dışı) yapılır. Durum/zimmet değişiklikleri denetim kaydına yazılır
  (ileride demirbaş geçmişi ekranı).
- Miktarlar **ondalık metin**, en çok 3 hane (litre/kg için). Kayan nokta kullanılmaz.
- Mevcut miktar saklanan alan değil, hareketlerin toplamıdır (ya da hareketle aynı işlemde güncellenir); eksiye düşemez →
  çıkış mevcuttan fazlaysa 409. Eşzamanlı iki çıkışta da (satır kilidi).
- Hareket silinmez; yanlış hareket ters hareketle düzeltilir.
- Stok girişi gider yazmaz; satın alma faturası Giderler'den girilir (ileride gider kaydından stok girişi).
- `quantity ≤ min_quantity` → "Azaldı" (ekranda hesaplanıyor; sunucu `is_low` dönerse onu kullanırız).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.*` | "Formda düzeltilmesi gereken alanlar var." |
| Aynı adla malzeme | 422 `fields.name` | "Bu adla bir malzeme var." |
| Miktar sıfır/geçersiz | 422 `fields.quantity` | "Sıfırdan büyük bir miktar girin (en çok 3 ondalık)." |
| Stok yetmiyor | 409 `insufficient_stock` | "Stokta 4,5 litre var; daha fazlası çıkarılamaz." |

## Yetki
Okuma: `expenses.read`; yazma: `expenses.manage`. **Öneri:** `inventory.read` / `inventory.manage`
(Teknik Personel stok çıkışı yapabilsin).

## Kabul kriterleri
- [ ] Eşzamanlı iki çıkış stoğu eksiye düşüremiyor
- [ ] Ondalık miktar toplamı doğru (0,1 + 0,2 = 0,3)
- [ ] Demirbaş kodu benzersiz ve sıralı
