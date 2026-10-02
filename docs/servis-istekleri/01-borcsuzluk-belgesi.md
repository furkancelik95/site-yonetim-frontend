# [Servis] Borçsuzluk belgesi

## Ekran
Cari ekstre (`/s/{slug}/cari/{accountId}`) → **Hesap işlemleri** → "Borçsuzluk belgesi". Onaydan sonra
yazdırma sayfası açılır (`/s/{slug}/belge/borcsuzluk/{id}`). Kullanan: Yönetici, Muhasebe.
Kullanım: daire satışı/kiracı çıkışında sakin "borcum yok" belgesi ister (Apsiyon'da var).

## Uç nokta
- `POST /api/v1/sites/{slug}/accounts/{account_id}/clearance-certificates` — belge düzenle
- `GET  /api/v1/sites/{slug}/clearance-certificates/{id}` — belgeyi oku (yazdırma)

## İstek
Gövde yok (`{}`). `Idempotency-Key` kabul etmeli (çift tıklamada iki numara çıkmasın).

## Beklenen yanıt
`POST` → `201`, `GET` → `200` (`data` olmadan, yalnız nesne):
```json
{
  "data": {
    "id": "0192…",
    "number": "BB-2026-00001",
    "site": { "name": "Aksu Konakları", "slug": "aksu-konaklari" },
    "account": {
      "id": "01a0…", "reference_code": "A10-O", "kind": "occupant",
      "unit_name": "A-10", "person_name": "Burak IŞIK"
    },
    "balance": "0.00",
    "as_of": "2026-10-02",
    "issued_at": "2026-10-02T10:58:00Z",
    "issued_by": "Kerem Yıldırım",
    "valid_until": "2026-11-01"
  },
  "message": "BB-2026-00001 numaralı borçsuzluk belgesi düzenlendi."
}
```

## İş kuralları
- Bakiye > 0,005 ise belge **verilmez** (409). Alacaklı (eksi) ya da sıfır bakiye → verilir.
- Bakiye belge anındaki defterden hesaplanır ve belgeye **yazılır** (sonradan değişmez).
- Numara site bazında, yıl bazında artan: `BB-{yıl}-{5 hane}`. Boşluk bırakmaz (iptal edilen numara da sayılır).
- `valid_until` = `as_of` + 30 gün (öneri; ayar yapılabilir olsun mu → ürün kararı).
- Belge değişmez, silinmez. Denetim kaydına yazılır (`entity = clearance_certificate`).
- Sakin kendi belgesini görebilmeli mi? → şimdilik hayır, yalnız personel.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Hesabın borcu var | 409 `has_debt` | "Bu hesabın 624,13 TL borcu var; borçsuzluk belgesi verilemez." |
| Hesap kapalı | 409 `account_closed` | "Kapalı hesaba belge düzenlenemez." |
| Hesap/belge yok ya da başka sitenin | 404 | "Hesap bulunamadı." |
| Yetki yok | 403 | |

## Yetki
`finance.payment.record` (düzenleme), `finance.read` (okuma). Denetçi okuyabilir, düzenleyemez.

## Kabul kriterleri
- [ ] Yanıt yukarıdaki örnekle aynı şekilde
- [ ] Borçlu hesap 409, mesajda tutar tr-TR biçiminde
- [ ] Aynı Idempotency-Key ile ikinci istek aynı belgeyi döndürür (yeni numara yok)
- [ ] Yetkisi olmayan rol 403, başka sitenin kullanıcısı 404 alıyor
