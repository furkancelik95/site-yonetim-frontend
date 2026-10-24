# [Servis] Tedarikçi kartı

Kaynak: Yazılım Dokümanı **SAT-06** (tedarikçi kartı bölümü). Sözleşme performansı ayrı istekte.

## Ekran
**Tedarikçiler** (`/tedarikciler`): arama (unvan, vergi no), durum süzgeci; liste (unvan, VKN, kategori, maskeli IBAN, iletişim,
ortalama puan ve sayısı, sipariş sayısı, durum); **Tedarikçi ekle / Düzenle**.

## Uç nokta
- `GET …/vendors?q=&status=` → `[{ id, name, tax_no, phone, email, iban_masked, category, status, note, rating_avg, rating_count, order_count }]`
- `POST …/vendors` · `PATCH …/vendors/{id}` — `{ name, tax_no, phone, email, iban, category, status: "active|passive|blacklist", note }`

## İş kuralları
- Unvan 2–120; vergi no 10 hane (şahıs için T.C. kimlik 11 hane), site içinde benzersiz.
- IBAN isteğe bağlı, `TR` + 24 rakam; **hiçbir okumada açık dönmez** (`iban_masked`: `TR33 •••• •••• 1326`). Düzenlemede boş
  gönderilirse mevcut IBAN korunur. Ödeme dosyası/talimatı üretilecekse açık IBAN yalnız o uçta ve yetkiyle döner (KVKK).
- E-posta küçük harfe çevrilir, ≤ 254; telefon 10 hane.
- Pasif ve kara listedeki tedarikçiye teklif linki gönderilmez, teklif girilmez, sipariş verilmez.
- Puan: mal/hizmet kabulündeki 1–5 puanların ortalaması (istek 65). Belgeler belge modülüyle (RAP).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.name/tax_no/iban/email/phone/status` | "IBAN TR ile başlayan 26 karakter olmalı." … |
| Aynı vergi no | 422 `fields.tax_no` | "Bu vergi numarasıyla tedarikçi var." |

## Yetki
Okuma `expenses.read`; yazma `expenses.manage`.
