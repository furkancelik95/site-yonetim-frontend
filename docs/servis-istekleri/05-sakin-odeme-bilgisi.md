# [Servis] Sakin ana sayfasında sitenin ödeme bilgisi

## Ekran
Sakin ana sayfası (`/sakin/{slug}`) → bakiye kartının altında "Ödeme bilgileri": banka, IBAN, açıklamaya
yazılacak referans kodu. Referans uygulamada vardı; sakinin "nereye ödeyeceğim" sorusunun cevabı.

## Uç nokta
`GET /api/v1/sites/{slug}/resident/home` — yanıta alan eklenmesi.

## Beklenen yanıt (eklenen alan)
```json
{
  "payment_info": { "bank_name": "Örnek Bank", "iban": "TR33 0006 1005 1978 6457 8413 26", "account_holder": "Aksu Konakları Site Yönetimi" },
  "…": "mevcut alanlar aynen"
}
```
Site IBAN girilmemişse `payment_info: null` (ekran "ödeme bilgisi için yönetimle görüşün" yazar).

## İş kuralları
- Kaynak: sitenin kendi hesabı (`sites.iban`, `sites.bank_name` — platformda site açılırken giriliyor). Platform
  parayı tutmaz (6493).
- `account_holder` alanı yoksa site adı.

## Yetki
Sakin (kendi sitesi).

## Kabul kriterleri
- [ ] IBAN boşluklu ya da boşluksuz, frontend biçimlendirir
- [ ] IBAN yoksa `null`
