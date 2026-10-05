# [Servis] Toplantılar ve genel kurul

## Ekran
- Yönetim → **Toplantılar** (`/toplantilar`): liste (Tümü / Planlanan / Yapılan / İptal), **Toplantı planla**
  (tür, başlık, tarih-saat, yer, gündem maddeleri).
- Toplantı ayrıntısı (`/toplantilar/:id`): planlananda her gündem maddesine sonuç (kabul / ret / ertelendi /
  bilgi verildi), kabul–ret–çekimser oy sayısı (isteğe bağlı), karar metni ve katılım notu → **Kararları kaydet**
  (kayıt kilitlenir). Yapılanda yazdırılabilir **tutanak** (imza alanlarıyla). Genel kurulda hazirun listesine bağlantı.
- Planlarken genel kurul tarihi 15 günden yakınsa uyarı (KMK m.29, çağrı süresi). Engel değil, uyarı.

Apsiyon: Site → "Toplantılar", "Yapılacak işler".

## Uç nokta
- `GET  /api/v1/sites/{slug}/meetings?status=planned|held|cancelled&page=` — sayfalı, tarihe göre yeniden eskiye
- `GET  /api/v1/sites/{slug}/meetings/{id}`
- `POST /api/v1/sites/{slug}/meetings` — `{ "kind": "general_ordinary", "title": "…", "scheduled_at": "2026-10-15T16:30:00Z", "location": "…", "agenda": ["…", "…"] }`
- `POST /api/v1/sites/{slug}/meetings/{id}/decisions` — `{ "attendance_note": "…", "items": [ { "id": "…", "result": "accepted", "decision": "…", "votes_for": 27, "votes_against": 3, "votes_abstain": 1 } ] }`
- `POST /api/v1/sites/{slug}/meetings/{id}/cancel` — `{ "reason": "…" }`

## Beklenen yanıt
```json
{ "id": "…", "number": 1, "kind": "general_ordinary", "title": "Test DENEME 2026 olağan genel kurulu",
  "scheduled_at": "2026-10-15T16:30:00Z", "location": "Sosyal tesis salonu", "status": "held",
  "agenda": [ { "id": "…", "order": 1, "title": "Açılış ve divan heyetinin seçimi", "result": "accepted",
                "decision": "Divan başkanlığına … seçildi.", "votes_for": null, "votes_against": null, "votes_abstain": null } ],
  "attendance_note": "48 bölümden 31'i katıldı veya temsil edildi", "held_at": "…", "cancel_reason": null,
  "created_by": "Kerem Yıldırım", "created_at": "…" }
```
Yazmalarda `{ "data": <toplantı>, "message": "Kararlar kaydedildi; toplantı yapıldı olarak işaretlendi. Kayıt artık değiştirilemez." }`.

## İş kuralları
- Tür: `general_ordinary` (olağan genel kurul), `general_extraordinary` (olağanüstü), `board` (yönetim kurulu).
- Gündem 1–30 madde; sıra numarası sunucuda verilir. Planlanan toplantının gündemi değiştirilebilir mi? → bu sürümde hayır
  (yanlışsa iptal + yeniden planla); istenirse `PATCH` eklenir.
- Karar girişi **tek seferlik**: her madde için `result` zorunlu, `info` dışındaki sonuçlarda `decision` zorunlu.
  Kayıttan sonra değişiklik yok (yasal kayıt); düzeltme yeni toplantı kararıyla yapılır.
- Oy sayıları isteğe bağlı, ≥ 0 tam sayı. **Yeter sayı hesabı yok**: kat malikleri kurulunda karar sayısı hem kişi hem
  arsa payı çoğunluğuna bakar (KMK m.30) ve konuya göre değişir — hesaplama ileride, hukukçuyla kuralları netleşince.
- Çağrı süresi uyarısı (15 gün) ekranda; sunucu engellemez.
- Toplantı çağrısının sakinlere duyurulması: şimdilik yönetici Duyurular'dan elle yayınlar. İleride
  `POST …/meetings` yanıtından tek tıkla duyuru taslağı.
- Tutanak sisteme kaydedilir ama noter onaylı karar defterinin yerine geçmez; ekranda bu yazıyor.
- Her yazma denetim kaydına gider.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.kind/title/scheduled_at/location/agenda` | "Formda düzeltilmesi gereken alanlar var." |
| Eksik karar | 422 `fields.items.{sıra}` | "2. maddenin karar metnini yazın." |
| Yapılmış/iptal toplantıya karar | 409 `not_planned` | "Kararlar yalnız planlanan toplantıya girilir." |
| İptal gerekçesi yok | 422 `fields.reason` | "Gerekçe yazın." |

## Yetki
Okuma: `announcements.read`. Planlama, karar, iptal: `announcements.publish`.
**Öneri:** ayrı `meetings.read` / `meetings.manage` izinleri (docs/05'e eklenmeli; Yönetim Kurulu Üyesi ve Denetçi okur).

## Kabul kriterleri
- [ ] Kararlar kaydedilince toplantı `held`, ikinci kayıt 409
- [ ] `info` maddesinde karar metni boş geçilebiliyor, diğerlerinde 422
- [ ] Başka sitenin toplantısı 404; yetkisiz rol 403
