# [Servis] Kurulum durumu ve canlıya geçiş kontrol listesi

Kaynak: Yazılım Dokümanı **YAP-01** (Tesis kurulum sihirbazı) — sihirbaz adımları mevcut ekranlara bağlantı olarak
kuruldu; bu istek yalnız **durum + kontrol listesi + canlıya alma**. Finans modu seçimi (Mod K / KiviERP) ortak kararı
(A-01) bekliyor; şimdilik `platform`.

## Ekran
- **Kurulum** (`/kurulum`): adımlar (yapı → bölümler/kişiler → finans → kullanıcılar/onaylar → modüller/kayıt → KVKK),
  finans modu kartı, **canlıya geçiş kontrol listesi** (zorunlu/isteğe bağlı, her madde ilgili ekrana "Git"),
  **Canlıya al** (zorunlular tamamsa). Durum rozeti: Kurulumda / Canlı.

## Uç nokta
- `GET  /api/v1/sites/{slug}/setup`
- `POST /api/v1/sites/{slug}/setup/go-live`
- (`POST …/setup/reset-demo` yalnız sahte serviste; backend'e gerekmez)

## İstek / yanıt
```json
{ "status": "setup", "went_live_at": null, "finance_mode": "platform", "ready": false,
  "checklist": [
    { "key": "structure",    "label": "Yapı tanımlı (blok ve bölümler)",            "ok": true,  "detail": "3 blok, 118 bölüm", "link": "daireler", "required": true },
    { "key": "owners",       "label": "Her bölümün en az bir maliki var",           "ok": false, "detail": "2 bölümde malik yok: B-7, C-1", "link": "daireler", "required": true },
    { "key": "shares",       "label": "Malik hisseleri tam %100",                   "ok": true,  "detail": "Tamam", "link": "daireler", "required": true },
    { "key": "land_share",   "label": "Arsa payları toplamı paydaya eşit",          "ok": false, "detail": "998 / 1000", "link": "daireler", "required": false },
    { "key": "bank",         "label": "Site adına banka hesabı (IBAN) tanımlı",     "ok": true,  "detail": "Tamam", "link": "kasa", "required": true },
    { "key": "charge_rule",  "label": "Aidat kuralı ve otomatik tahakkuk tanımlı",  "ok": true,  "detail": "…", "link": "tahakkuk", "required": true },
    { "key": "opening",      "label": "Açılış bakiyesi mutabakatı yapıldı",         "ok": false, "detail": "…", "link": "iceri-aktar", "required": true },
    { "key": "manager",      "label": "En az bir etkin site yöneticisi",            "ok": true,  "detail": "…", "link": "kullanicilar", "required": true },
    { "key": "mfa",          "label": "Site yöneticisi iki adımlı doğrulama kurdu", "ok": false, "detail": "…", "link": null, "required": false },
    { "key": "kvkk",         "label": "KVKK aydınlatma metni yayında",              "ok": false, "detail": "…", "link": "kayit-basvurulari", "required": true },
    { "key": "approvals",    "label": "Onay kuralları gözden geçirildi",            "ok": true,  "detail": "…", "link": "onay-kurallari", "required": false },
    { "key": "registration", "label": "Kayıt yöntemleri ayarlandı",                 "ok": true,  "detail": "davet, QR", "link": "kayit-basvurulari", "required": false }
  ] }
```
`go-live` → `{ data: { status: "live", went_live_at }, message: "Tesis canlıya alındı; artık davet gönderilebilir." }`.

## İş kuralları
- Yeni açılan site `status=setup`. Kurulumdaki sitede sakin daveti ve herkese açık kayıt kapalı (istek 23: 409
  `site_not_live`); personel her şeyi görür ve girer.
- Kontrol listesi her çağrıda gerçek veriden hesaplanır (istek 19 özeti, kasa hesapları, tahakkuk takvimi, aktarım
  geçmişi, üyeler, onay kuralları, kayıt ayarı). `ready` = tüm `required` maddeler `ok`.
- `go-live`: `ready` değilse 409 `checklist_incomplete` (eksikler mesajda); zaten canlıysa 409 `already_live`.
  Canlıya alma geri alınmaz; denetim kaydına yazılır.
- `opening` maddesi: açılış bakiyesi aktarımı onaylanmış (istek 25) **ya da** yöneticinin "mutabakat yapıldı" işareti
  (öneri: `POST setup/opening-reconciled`, imzalı mutabakat belgesi açıklamasıyla).
- `mfa` maddesi iki adımlı doğrulama gelene kadar `ok=false`, `required=false`.
- `finance_mode` yalnız `platform`; `kivi` ortak kararı ve Kivi görüşmesi sonrası (A-01), dönem sonunda sihirbazla.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Eksik madde | 409 `checklist_incomplete` | "Eksik maddeler var: Her bölümün en az bir maliki var; …" |
| Zaten canlı | 409 `already_live` | "Tesis zaten canlı." |

## Yetki
`modules.manage` (site yöneticisi). Platform yöneticisi de görebilmeli (`/yonetim` tarafı sonra).

## Kabul kriterleri
- [ ] Maliksiz bölüm varken `ready=false`, `go-live` 409
- [ ] Kurulumdaki sitede davet 409 `site_not_live`; canlıya alınca açılır
- [ ] Kontrol listesi bağlantıları ilgili ekrana götürür (`link` değerleri `/s/{slug}/…` yolları)
