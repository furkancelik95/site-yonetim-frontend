# [Servis] Destek oturumu (müşteri onaylı, süreli, salt okunur)

Kaynak: Yazılım Dokümanı **PYN-04**.

## Ekran
- **Platform → Destek → Destek oturumu**: tesis, süre (1–24 saat), gerekçe (bilet no ile) → **Onaya gönder**; oturum listesi.
- **Destek → Destek oturumları** (tesis): bekleyen talep kartı (isteyen, süre, gerekçe) → **Onayla** (salt okunur, süreli, kayda
  geçer uyarısıyla) / **Reddet** (gerekçe); aktif oturumda **Oturumu şimdi bitir**.
- Oturum aktifken tesisin **tüm ekranlarında** "Destek oturumu aktif — kim, bitiş saati" bandı.

## Uç nokta
- `POST /api/v1/platform/support-sessions` — `{ site_slug, site_name, reason, hours }` · `GET /api/v1/platform/support-sessions`
- `GET …/support-sessions` · `GET …/support-sessions/active` · `POST …/support-sessions/{id}/approve|reject|end` (belgede `…/approve`)

Oturum: `{ id, site_slug, site_name, reason, hours, requested_by, requested_at, status: "pending|active|rejected|expired", decided_by, decided_at, ends_at, reject_reason }`.

## İş kuralları
- **Müşteri onayı olmadan oturum açılmaz** (belge kabulü). Süre ≤ 24 saat; bitişte kendiliğinden kapanır (zamanlanmış iş).
  Bir tesis için aynı anda tek bekleyen/aktif oturum.
- Onay ve bitirme tesiste `members.manage` yetkilisinde.
- Oturum boyunca destek ekibi **salt okunur** erişir ("sakin olarak görüntüle" dahil); tüm okumalar ve işlemler denetim kaydına
  "destek oturumu" aktörüyle yazılır. Platform yöneticisinin oturum dışında müşteri verisi görmemesi kuralı korunur.
- Gerçek erişim (geçici, kapsamı tesisle sınırlı salt okunur oturum anahtarı) backend işi; sahte servis yalnız onay akışını
  ve bandı gösterir.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alanlar | 422 `fields.site_slug/reason/hours` | "Süre 1–24 saat." |
| Mevcut oturum | 409 `exists` | "Bu tesis için bekleyen ya da aktif oturum var." |
| Yetkisiz onay | 403 `forbidden` | "Destek oturumunu tesis yöneticisi onaylar." |
| Yanlış durum | 409 `invalid_status` | … |

## Yetki
Talep platform destek ekibi; onay/ret/bitirme tesis `members.manage`.
