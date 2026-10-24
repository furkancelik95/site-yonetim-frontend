# [Servis] Kayıt yöntemleri, davetler, QR afiş önseçimi

Kaynak: Yazılım Dokümanı **YAP-07** (Kayıt yöntemleri: davet, QR, site kodu), **YAP-08** (Başvuru ve onay).
İstek 13'ün (sakinin kendini kaydetmesi) üstüne gelir.

## Ekran
- **Sakin kaydı** (`/kayit-basvurulari`): sekmeler **Başvurular** (istek 13), **Davetler** (oluştur, bağlantı kopyala,
  yeniden gönder, iptal), **Kayıt yöntemleri** (davet / QR / site bağlantısı aç-kapa, malik kiracısını onaylar,
  malik başvurusunda belge, davet geçerlilik günü, **KVKK aydınlatma metni yayında**).
- **QR afiş** (`/kayit-afisi`): tesis / blok / tek bölüm kapsamı, A4 / A5 / bölüm etiketleri; blok ve bölüm afişi
  bağlantıya `?blok=` / `?bolum=` ekler, form önseçili açılır. Bağlantı yenilenince afişler eskir (ekranda uyarı).
- **Davetle kayıt** (`/davet/{token}`, oturumsuz): kişi yalnız telefonunu doğrular + bilgilendirme; hesabı hemen açılır,
  geçici parola bir kez gösterilir.
- **Herkese açık kayıt formu** (`/kayit/{code}`): blok/bölüm listesi gelirse açılır liste, gelmezse serbest metin.

## Uç nokta
- `GET/PUT /api/v1/sites/{slug}/settings/registration`
- `GET  /api/v1/sites/{slug}/invitations?status=` — dizi
- `POST /api/v1/sites/{slug}/invitations`, `POST …/invitations/{id}/resend`, `POST …/invitations/{id}/cancel`
- `GET  /api/v1/public/invitations/{token}`, `POST …/accept` — oturumsuz
- `GET  /api/v1/public/registration/{code}` — **mevcut yanıta ek alanlar**; `POST` gövdesine `unit_id` kabulü

## İstek / yanıt
Ayar:
```json
{ "invite_enabled": true, "qr_enabled": true, "code_enabled": true, "owner_can_approve_tenant": false,
  "owner_document_required": false, "invite_valid_days": 7, "kvkk_published": false }
```
Davet: `{ "full_name": "Test DENEME", "phone": "+905321112233", "unit_id": "…", "relation": "owner" }` → + `id`,
`unit_name`, `status` (`sent | opened | completed | expired | cancelled`), `link` (`/davet/{token}`), `sent_by`, `sent_at`,
`expires_at`, `completed_at`.

Herkese açık davet: `GET` → `{ site_name, full_name, unit_name, relation, phone_hint: "2233", status, expires_at }`;
`POST accept` `{ "phone": "+905321112233", "kvkk_ack": true }` → `{ data: { unit_name, temporary_password }, message }`
(201). Kabulde kişi bölüme `relation` ile eklenir (istek 13 onayıyla aynı sonuç), giriş hesabı açılır.

Herkese açık kayıt formu `GET` yanıtına ek:
```json
{ "site_name": "…", "site_slug": "…",
  "blocks": [{ "id": "…", "name": "A", "units": [{ "id": "…", "name": "A-4" }] }],
  "document_required": false, "relations": ["owner", "tenant"] }
```
`blocks` yalnız blok/bölüm adı — **kişi adı yok** (KVKK). `POST` gövdesinde `unit_id` (isteğe bağlı) kabul edilsin;
`unit_text` yine gönderilir. Frontend şimdilik yalnız `unit_text` gönderir.

## İş kuralları
- Yöntem kapalıyken: davet oluşturma 409 `method_disabled`; QR ve site kodu kapalıysa `public/registration/{code}` 404
  `method_disabled`.
- Davet geçerliliği `invite_valid_days` (1–30); süresi dolan `expired`, "yeniden gönder" yeni token üretir, eskisi geçersiz.
  Aynı telefona açık davet varken ikinci davet 409 `already_invited`. Tamamlanmış davet iptal/yenilenemez.
- Kabulde telefon davetteki numarayla **tam eşleşmeli** (422 `fields.phone`); `kvkk_ack` zorunlu. Davet `completed` olunca
  tekrar kullanılamaz (409 `already_completed`).
- **SMS yok (K5):** servis bağlantıyı üretir, göndermez; yönetim kopyalayıp iletir. SMS gelince `resend` gönderimi de yapar.
- `kvkk_published` yalnız bilgi bayrağı; canlıya geçiş kontrol listesinde (istek 26) zorunlu madde.
- `owner_can_approve_tenant` ve `owner_document_required` ortak kararı bekleyen davranışlar; şimdilik yalnız saklanır
  (belge yükleme bu istekte yok).
- Kurulumdaki tesiste (istek 26 `status=setup`) davet gönderilmez (409 `site_not_live`).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.full_name/phone/unit_id/relation` | "Formda düzeltilmesi gereken alanlar var." |
| Yöntem kapalı | 409 `method_disabled` | "Davet yöntemi kapalı; Ayarlar › Kayıt yöntemleri'nden açın." |
| Açık davet var | 409 `already_invited` | "Bu telefona gönderilmiş açık bir davet var; yeniden gönderin ya da iptal edin." |
| Geçersiz/dolmuş token | 404 `not_found` | "Davet bağlantısı geçersiz ya da süresi dolmuş. Site yönetiminden yeni davet isteyin." |
| Telefon eşleşmiyor | 422 `fields.phone` | "Numara davetteki numarayla eşleşmiyor. …" |
| Davet kullanılmış | 409 `already_completed` | "Bu davet daha önce kullanılmış." |

## Yetki
Ayar: `modules.manage` (öneri; şimdilik `people.manage`). Davetler: `people.manage`. Herkese açık uçlar oturumsuz,
hız sınırı (istek 13'teki gibi).

## Kabul kriterleri
- [ ] Davet kabulünde kişi bölüme eklenir, giriş hesabı açılır, parola bir kez döner
- [ ] Yanlış telefon 422, süresi dolan 404, ikinci kabul 409
- [ ] `public/registration/{code}` yanıtı blok/bölüm adlarını kişi bilgisi olmadan döner
- [ ] Yöntem kapalıyken ilgili uç 409/404
