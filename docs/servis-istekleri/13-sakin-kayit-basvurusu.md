# [Servis] Sakinin kendini kaydetmesi + yönetici onayı

## Ekran
- **Herkese açık form** `/kayit/:code` (oturum yok): ad, soyad, cep telefonu (+90 maskeli), e-posta (isteğe bağlı),
  blok/daire (serbest metin), malik/kiracı; aydınlatma metni bağlantısı (yeni sekmede, onay kutusu yok),
  açık rıza (isteğe bağlı kutu), bilgilendirme (zorunlu kutu). Başarıda başvuru numarası gösterilir.
- Operasyon → **Kayıt Başvuruları** (`/kayit-basvurulari`): kayıt bağlantısı (kopyala / yenile / kayda kapat-aç),
  Bekleyen / Onaylanan / Reddedilen sekmeleri; bekleyende **bölüm seç + Onayla** ya da **gerekçeyle Reddet**.
- `/aydinlatma`: aydınlatma metni **taslağı** (hukuk onayı bekliyor — açık karar K8).

Apsiyon: Kişiler → "Onay Bekleyen Kişiler" (sakin mobil uygulamadan kaydolur, yönetici onaylar).

## Uç nokta
Personel:
- `GET   /api/v1/sites/{slug}/registration-link` — `{ "code": "95bf1fbb57", "is_enabled": true }`
- `POST  /api/v1/sites/{slug}/registration-link/rotate` — yeni kod; eskisi hemen geçersiz
- `PATCH /api/v1/sites/{slug}/registration-link` — `{ "is_enabled": false }`
- `GET   /api/v1/sites/{slug}/registrations?status=pending|approved|rejected&page=` — sayfalı
- `POST  /api/v1/sites/{slug}/registrations/{id}/approve` — `{ "unit_id": "…", "start_date": "2026-10-05" }`
- `POST  /api/v1/sites/{slug}/registrations/{id}/reject` — `{ "reason": "Bu bölümde kayıtlı değil" }`

Herkese açık (kimlik doğrulama yok, rate limit'li):
- `GET  /api/v1/public/registration/{code}` — `{ "site_name": "Aksu Konakları", "site_slug": "aksu-konaklari" }`
- `POST /api/v1/public/registration/{code}`

## İstek / yanıt
```json
{ "first_name": "Test", "last_name": "DENEME", "phone": "+905321112233", "email": "test.deneme@ornek.local",
  "unit_text": "A blok 4", "relation": "tenant", "explicit_consent": false, "kvkk_ack": true }
```
```json
{ "data": { "reference": "KB-0001" }, "message": "Başvurunuz alındı (KB-0001). Site yönetimi onaylayınca giriş bilgileriniz size iletilecek." }
```
Personel listesindeki kayıt:
```json
{ "id": "…", "reference": "KB-0001", "first_name": "Test", "last_name": "DENEME", "phone": "+905321112233", "email": null,
  "unit_text": "A blok 4", "relation": "tenant", "explicit_consent": false, "status": "pending",
  "created_at": "…", "decided_at": null, "decided_by": null, "reject_reason": null, "unit_name": null }
```
Onay yanıtı: `{ "data": <kayıt, status approved, unit_name "A-4">, "message": "Test DENEME A-4 kiracı olarak eklendi." }`.

## İş kuralları
- Alan doğrulaması (kurumsal iletişim formu standardı): ad/soyad 2–40, rakam ve özel karakter yok, Türkçe harf serbest,
  baş/son boşluk kırpılır; telefon E.164, TR için `+905` ile başlar ve 12 hane; e-posta küçük harf, ≤ 254.
  Ekran aynı kuralları uyguluyor, sunucu **yine** doğrular.
- Ad baş harfi büyük, soyad tamamen büyük harfle kaydedilir (`tr-TR`).
- `kvkk_ack` (bilgilendirme) zorunlu → yoksa 422. `explicit_consent` isteğe bağlı; başvuru buna bağlanamaz,
  işaretlendiyse zaman damgasıyla saklanır.
- Aynı sitede aynı telefonla bekleyen başvuru varsa 409.
- **Onay** = mevcut `POST …/units/{id}/parties` mantığı (kişi + rol + başlangıç tarihi), tek işlemde.
  Telefon/e-postayla eşleşen kişi varsa yeni kişi açılmaz, mevcut `person_id` kullanılır.
  Sahte servis bugün onayı bu mevcut uca bağlıyor.
- **Malik hissesi:** bölümde %100 malik varsa malik onayı mevcut ucun kuralıyla 409 `owner_shares_exceed`
  döner (yerelde denendi). Ekran bu mesajı gösteriyor. İleride onay isteğine isteğe bağlı `share_percent`
  ve "önceki malikin bitiş tarihi" eklenebilir — şimdilik yönetici önce daire sayfasından düzeltir.
- Onaylanınca sakin hesabı açılır, giriş bilgisi SMS/e-postayla gider → açık karar **K5**. K5 gelene kadar
  hesap açılır ama gönderim yapılmaz; mesaj bunu söyler.
- Reddetmede gerekçe zorunlu; başvurana bildirim K5'e bağlı.
- Kayıt kodu tahmin edilemez (≥ 10 karakter rastgele); kapalı ya da eski kod 404. Herkese açık uçlara
  IP başına rate limit (öneri: dakikada 5 POST) ve gövde boyutu sınırı.
- Başvuru verisi kişisel veridir: reddedilen/bekleyen başvurular için saklama süresi açık karar **K8**.
- Herkese açık `GET` yalnız site adını verir; başka hiçbir site bilgisi dönmez.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Kod geçersiz / kapalı | 404 `not_found` | "Kayıt bağlantısı geçersiz ya da kapatılmış. Site yönetiminden yeni bağlantı isteyin." |
| Alan hatası | 422 `fields.*` | "Formda düzeltilmesi gereken alanlar var." |
| Bekleyen başvuru var | 409 `already_pending` | "Bu telefonla bekleyen bir başvuru var; yönetim inceleyince size dönülecek." |
| Zaten sonuçlandı | 409 `already_decided` | "Bu başvuru zaten sonuçlandı." |
| Malik hissesi dolu | 409 `owner_shares_exceed` | mevcut uçtaki mesaj |
| Çok fazla istek | 429 | "Çok fazla deneme yaptınız, biraz sonra tekrar deneyin." |

## Yetki
Personel uçları: `people.manage`. Herkese açık uçlar: kimlik doğrulama yok, rate limit var.

## Kabul kriterleri
- [ ] Bağlantı yenilenince eski kod 404
- [ ] Kayda kapalıyken POST 404
- [ ] Onay bölüme kişi ekliyor; aynı başvuru ikinci kez onaylanamıyor (409)
- [ ] Rate limit herkese açık POST'ta çalışıyor
- [ ] Başka sitenin başvurusu 404; `people.manage` olmayan rol 403
